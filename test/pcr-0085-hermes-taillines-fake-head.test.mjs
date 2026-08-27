import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  captureProviderRequest,
  createHermesAdapter,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import { stableUnitId } from "../src/hash.mjs";

const REGION_PATH = "ws/tail.txt";
const FILE_BODY = "line1 head\nline2 middle\nline3 tailA\nline4 tailB\n";
const TAIL_BODY = "line3 tailA\nline4 tailB\n";

function buildTailReadMessages() {
  return [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-tail",
          type: "function",
          function: {
            name: "read_file",
            arguments: JSON.stringify({
              path: REGION_PATH,
              scope: "region",
              tailLines: 2,
            }),
          },
        },
      ],
    },
    { role: "tool", tool_call_id: "call-tail", content: TAIL_BODY },
    { role: "user", content: "quote the tail lines" },
  ];
}

async function setupBoard() {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0085-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, REGION_PATH), FILE_BODY, "utf8");
  return { workspace, messages: buildTailReadMessages() };
}

test("PCR 0085: Hermes observeTurn stores tailLines reads with the real tail span", async () => {
  const board = await setupBoard();
  const stateFile = await createHermesStateFile();
  const adapter = createHermesAdapter({ stateFile, budgetChars: 8_000 });

  try {
    await adapter.onTurnComplete(structuredClone(board.messages), { cwd: board.workspace });
    const state = JSON.parse(await readFile(stateFile, "utf8"));
    assert.deepEqual(state.calls["call-tail"], {
      path: REGION_PATH,
      scope: "region",
      startLine: 3,
      endLine: 5,
      tailLines: 2,
    });
    assert.deepEqual(state.tracked["call-tail"], {
      path: REGION_PATH,
      content: TAIL_BODY,
      scope: "region",
      startLine: 3,
      endLine: 5,
      tailLines: 2,
      observedFileLineCount: 5,
    });
  } finally {
    await rm(board.workspace, { recursive: true, force: true });
  }
});

test("PCR 0085: Hermes first inject serves tailLines with a tail unit id, not fake head id", async () => {
  const board = await setupBoard();
  const stateFile = await createHermesStateFile();

  try {
    const capture = await captureProviderRequest({
      cwd: board.workspace,
      persistedMessages: board.messages,
      stateFile,
      budgetChars: 8_000,
    });

    const expectedTailId = stableUnitId({
      path: REGION_PATH,
      scope: "region",
      startLine: 3,
      endLine: 5,
    });
    const fakeHeadId = stableUnitId({
      path: REGION_PATH,
      scope: "region",
      startLine: 1,
      endLine: 3,
    });

    assert.match(capture.projectionText, new RegExp(`id="${expectedTailId}"`, "u"));
    assert.match(capture.projectionText, /lines="3-5"/u);
    assert.doesNotMatch(capture.projectionText, new RegExp(`id="${fakeHeadId}"`, "u"));
    assert.doesNotMatch(capture.payloadText, /line1 head/u);
    assert.doesNotMatch(capture.payloadText, /line2 middle/u);
    assert.match(capture.payloadText, /line3 tailA/u);
    assert.match(capture.payloadText, /line4 tailB/u);
  } finally {
    await rm(board.workspace, { recursive: true, force: true });
  }
});

test("PCR 0085: Hermes tailLines insert-above decoy fails closed instead of accepting a later tail boundary", async () => {
  const board = await setupBoard();
  const stateFile = await createHermesStateFile();
  const adapter = createHermesAdapter({ stateFile, budgetChars: 8_000 });
  const decoyFile = [
    "line1 head",
    "line2 middle",
    "inserted above tail",
    "line3 tailA changed",
    "line4 tailB changed",
    "line3 tailA",
    "line4 tailB",
    "",
  ].join("\n");

  try {
    await adapter.onTurnComplete(structuredClone(board.messages), { cwd: board.workspace });
    await writeFile(join(board.workspace, REGION_PATH), decoyFile, "utf8");

    const result = await adapter.onSelectContext(
      structuredClone(board.messages),
      { cwd: board.workspace },
      { budgetChars: 8_000 },
    );

    assert.match(result.projectionText, /selected="0"/u);
    assert.match(result.projectionText, /unresolved="1"/u);
    assert.doesNotMatch(result.projectionText, /lines="6-8"/u);
    assert.doesNotMatch(result.projectionText, /resolution="exact"/u);
    assert.doesNotMatch(result.projectionText, /line3 tailA/u);
    assert.doesNotMatch(result.projectionText, /line4 tailB/u);
  } finally {
    await rm(board.workspace, { recursive: true, force: true });
  }
});
