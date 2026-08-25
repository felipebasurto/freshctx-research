import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildShellToolCall,
  buildToolResultMessage,
  createPiAdapter,
  DEFAULT_BUDGET_CHARS,
  messageText,
} from "../adapters/pi/replay.mjs";
import {
  buildReadToolCall as buildHermesReadToolCall,
  buildToolResultMessage as buildHermesToolResultMessage,
  captureProviderRequest as captureHermesRequest,
} from "../adapters/hermes/replay.mjs";
import { projectContext } from "../src/projector.mjs";
import { stableReadMarker } from "../src/transcript.mjs";

const CLI_PATH = "src/viajante/cli.py";
const DUMP_CALL_ID = "call-python";
const PAD = "x".repeat(39_000);
const OLD_BODY = `# MARKER_CLI=CL0\n${PAD}\n`;
const NEW_BODY = `# MARKER_CLI=CL1\n${PAD}\n`;
const NEUTRAL_DUMP_MARKER = "Shell dump removed. Check the live projection.";

function toolCallIds(messages) {
  return messages.flatMap((message) =>
    Array.isArray(message.tool_calls)
      ? message.tool_calls.map((call) => call.id)
      : [],
  );
}

function toolResultFor(messages, callId) {
  return messages.find((message) =>
    (message.toolCallId ?? message.tool_call_id) === callId
    && (message.role === "tool" || message.role === "toolResult"),
  );
}

function pythonDumpCommand() {
  return `python3 -c "print(open('${CLI_PATH}').read())"`;
}

function assertTruthfulBudgetOmission(projectionText) {
  assert.match(
    projectionText,
    new RegExp(
      `<freshctx-omitted id="[^"]+" path="${CLI_PATH}" reason="budget"/>`,
      "u",
    ),
  );
  assert.doesNotMatch(projectionText, /CL0|CL1/u);
}

async function setupPiBoard() {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0082-"));
  await mkdir(join(workspace, "src/viajante"), { recursive: true });
  await writeFile(join(workspace, CLI_PATH), OLD_BODY, "utf8");

  const adapter = createPiAdapter({ budgetChars: DEFAULT_BUDGET_CHARS });
  const ctx = { cwd: workspace };
  const persisted = [
    buildReadToolCall({ toolCallId: "call-read", path: CLI_PATH }),
    buildToolResultMessage({ toolCallId: "call-read", content: OLD_BODY }),
    buildShellToolCall({ toolCallId: DUMP_CALL_ID, command: pythonDumpCommand() }),
    buildToolResultMessage({ toolCallId: DUMP_CALL_ID, content: OLD_BODY }),
    { role: "user", content: "CLI=?" },
  ];

  await adapter.onTurnStart({ turnIndex: 1 });
  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: "call-read",
      input: { path: CLI_PATH },
      content: OLD_BODY,
      isError: false,
    },
    ctx,
  );

  return { adapter, ctx, persisted, workspace };
}

test("PCR 0082: core names cold budget omissions without injecting their bytes", () => {
  const projection = projectContext(
    [
      {
        id: "fc-cli",
        path: CLI_PATH,
        content: OLD_BODY,
        state: "resolved",
        revision: "sha256:cli",
        startLine: 1,
        endLine: 1,
        lastUsedAt: 0,
        changedAt: -1,
        changeCount: 0,
        pinned: false,
        selector: null,
        resolutionMethod: "whole-file",
      },
    ],
    { turn: 1, budgetChars: DEFAULT_BUDGET_CHARS },
  );

  assert.equal(projection.selected.length, 0);
  assertTruthfulBudgetOmission(projection.text);
});

test("PCR 0082: historical read markers report availability without claiming selection", () => {
  const marker = stableReadMarker({ id: "fc-cli", path: CLI_PATH });

  assert.match(
    marker,
    /Read body removed\. Check the live projection\./u,
  );
  assert.doesNotMatch(marker, /Current content is supplied in the live projection/u);
});

test("PCR 0082: Pi keeps an untracked dump pair with a neutral marker and named omission", async () => {
  const board = await setupPiBoard();
  try {
    const result = await board.adapter.onContext(
      { messages: structuredClone(board.persisted) },
      board.ctx,
    );
    assert.ok(result);

    const payload = messageText(result.messages);
    assert.doesNotMatch(payload, /CL0/u);
    assert.doesNotMatch(payload, /CL1/u);
    assert.equal(result.projection.selected.length, 0);
    assert.equal(
      result.projection.omitted.some(
        (item) => item.unit.path === CLI_PATH && item.reason === "budget",
      ),
      true,
    );
    assertTruthfulBudgetOmission(result.projection.text);

    assert.equal(toolCallIds(result.messages).includes(DUMP_CALL_ID), true);
    const dumpResult = toolResultFor(result.messages, DUMP_CALL_ID);
    assert.ok(dumpResult);
    const marker = messageText([dumpResult]);
    assert.match(marker, new RegExp(`freshctx:stale-dump path=${CLI_PATH}`, "u"));
    assert.match(marker, new RegExp(NEUTRAL_DUMP_MARKER, "u"));
    assert.doesNotMatch(marker, /Current content is supplied in the live projection/u);
  } finally {
    await rm(board.workspace, { recursive: true, force: true });
  }
});

test("PCR 0082: Hermes keeps an untracked dump pair with a neutral marker and named omission", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0082-hermes-"));
  try {
    await mkdir(join(workspace, "src/viajante"), { recursive: true });
    await writeFile(join(workspace, CLI_PATH), OLD_BODY, "utf8");
    const persisted = [
      buildHermesReadToolCall({ toolCallId: "call-read", path: CLI_PATH }),
      buildHermesToolResultMessage({ toolCallId: "call-read", content: OLD_BODY }),
      buildShellToolCall({ toolCallId: DUMP_CALL_ID, command: pythonDumpCommand() }),
      buildHermesToolResultMessage({ toolCallId: DUMP_CALL_ID, content: OLD_BODY }),
      { role: "user", content: "CLI=?" },
    ];
    const capture = await captureHermesRequest({
      cwd: workspace,
      persistedMessages: persisted,
      stateFile: join(workspace, "session.json"),
      budgetChars: DEFAULT_BUDGET_CHARS,
    });

    assert.doesNotMatch(capture.payloadText, /CL0|CL1/u);
    assertTruthfulBudgetOmission(capture.projectionText);
    assert.match(capture.payloadText, new RegExp(`freshctx:stale-dump path=${CLI_PATH}`, "u"));
    assert.match(capture.payloadText, new RegExp(NEUTRAL_DUMP_MARKER, "u"));
    assert.doesNotMatch(
      capture.payloadText,
      /Current content is supplied in the live projection/u,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0082: same-turn refresh over cap keeps full CL1 and no stale body", async () => {
  const board = await setupPiBoard();
  try {
    await writeFile(join(board.workspace, CLI_PATH), NEW_BODY, "utf8");
    const result = await board.adapter.onContext(
      { messages: structuredClone(board.persisted) },
      board.ctx,
    );
    assert.ok(result);

    const payload = messageText(result.messages);
    assert.match(payload, /CL1/u);
    assert.doesNotMatch(payload, /CL0/u);
    assert.equal(payload.split("CL1").length - 1, 1);
    assert.equal(result.projection.selected.length, 1);
    assert.equal(result.projection.selected[0].path, CLI_PATH);
    assert.equal(result.projection.selected[0].content, NEW_BODY);
    assert.equal(result.projection.text.includes(NEW_BODY), true);

    assert.equal(toolCallIds(result.messages).includes(DUMP_CALL_ID), true);
    const dumpResult = toolResultFor(result.messages, DUMP_CALL_ID);
    assert.ok(dumpResult);
    assert.doesNotMatch(messageText([dumpResult]), /CL0/u);
    assert.match(messageText([dumpResult]), new RegExp(NEUTRAL_DUMP_MARKER, "u"));
  } finally {
    await rm(board.workspace, { recursive: true, force: true });
  }
});

test("PCR 0082: core names unresolved units without injecting last-known bytes", () => {
  const projection = projectContext(
    [
      {
        id: "fc-unresolved",
        path: "src/unresolved.ts",
        content: "LAST_KNOWN_SECRET",
        state: "unresolved",
        revision: "sha256:unresolved",
        startLine: 2,
        endLine: 2,
        lastUsedAt: 0,
        changedAt: -1,
        changeCount: 0,
        pinned: false,
        selector: null,
        resolutionMethod: "anchors-not-found",
      },
    ],
    { turn: 1, budgetChars: DEFAULT_BUDGET_CHARS },
  );

  assert.match(
    projection.text,
    /<freshctx-omitted id="fc-unresolved" path="src\/unresolved.ts" reason="unresolved"\/>/u,
  );
  assert.doesNotMatch(projection.text, /LAST_KNOWN_SECRET/u);
});
