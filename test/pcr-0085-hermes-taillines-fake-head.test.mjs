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
const WRONG_SIZED_TAIL_BODY = "line1 head\nline2 middle\nline3 tailA\n";
const UNDERSIZED_TAIL_BODY = "line4 tailB\n";
const MIDDLE_TAIL_BODY = "line2 middle\nline3 tailA\nline4 tailB\n";
const EXTRA_NL_TAIL_BODY = "line3 tailA\nline4 tailB\n\n";

function buildTailReadMessages(content = TAIL_BODY) {
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
    { role: "tool", tool_call_id: "call-tail", content },
    { role: "user", content: "quote the tail lines" },
  ];
}

async function setupBoard(content = TAIL_BODY) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0085-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, REGION_PATH), FILE_BODY, "utf8");
  return { workspace, messages: buildTailReadMessages(content) };
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

test("PCR 0086: Hermes first inject fail-closes a wrong-sized tailLines payload without minting an EOF tail id", async () => {
  const board = await setupBoard(WRONG_SIZED_TAIL_BODY);
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

    assert.match(capture.projectionText, /selected="0"/u);
    assert.match(capture.projectionText, /unresolved="1"/u);
    assert.doesNotMatch(capture.payloadText, new RegExp(`freshctx:${expectedTailId}\\b`, "u"));
    assert.doesNotMatch(capture.projectionText, new RegExp(`id="${expectedTailId}"`, "u"));
    assert.doesNotMatch(capture.projectionText, /lines="3-5"/u);
    assert.doesNotMatch(capture.payloadText, /line1 head/u);
    assert.doesNotMatch(capture.payloadText, /line2 middle/u);
    assert.doesNotMatch(capture.payloadText, /line4 tailB/u);
  } finally {
    await rm(board.workspace, { recursive: true, force: true });
  }
});

test("PCR 0088: Hermes first inject fail-closes undersized, middle, and extra-NL tail payloads without minting an EOF tail id", async () => {
  const invalidBoards = [
    { name: "undersized", content: UNDERSIZED_TAIL_BODY },
    { name: "middle", content: MIDDLE_TAIL_BODY },
    { name: "extra-nl", content: EXTRA_NL_TAIL_BODY },
  ];
  const expectedTailId = stableUnitId({
    path: REGION_PATH,
    scope: "region",
    startLine: 3,
    endLine: 5,
  });

  for (const invalidBoard of invalidBoards) {
    const board = await setupBoard(invalidBoard.content);
    const stateFile = await createHermesStateFile();

    try {
      const capture = await captureProviderRequest({
        cwd: board.workspace,
        persistedMessages: board.messages,
        stateFile,
        budgetChars: 8_000,
      });

      assert.match(capture.projectionText, /selected="0"/u, invalidBoard.name);
      assert.match(capture.projectionText, /unresolved="1"/u, invalidBoard.name);
      assert.doesNotMatch(
        capture.payloadText,
        new RegExp(`freshctx:${expectedTailId}\\b`, "u"),
        invalidBoard.name,
      );
      assert.doesNotMatch(
        capture.projectionText,
        new RegExp(`id="${expectedTailId}"`, "u"),
        invalidBoard.name,
      );
      assert.doesNotMatch(capture.projectionText, /lines="3-5"/u, invalidBoard.name);
      assert.doesNotMatch(capture.projectionText, /line3 tailA/u, invalidBoard.name);
      assert.doesNotMatch(capture.projectionText, /line4 tailB/u, invalidBoard.name);
    } finally {
      await rm(board.workspace, { recursive: true, force: true });
    }
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
