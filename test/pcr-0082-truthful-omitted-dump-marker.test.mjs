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
import { dropUnservedReadToolPairs } from "../adapters/request-prune.mjs";

const CLI_PATH = "src/viajante/cli.py";
const DUMP_CALL_ID = "call-cat";
const PAD = "x".repeat(39_000);
const OLD_BODY = `# MARKER_CLI=CL0\n${PAD}\n`;
const NEW_BODY = `# MARKER_CLI=CL1\n${PAD}\n`;

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

async function setupBoard() {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0082-"));
  await mkdir(join(workspace, "src/viajante"), { recursive: true });
  await writeFile(join(workspace, CLI_PATH), OLD_BODY, "utf8");

  const adapter = createPiAdapter({ budgetChars: DEFAULT_BUDGET_CHARS });
  const ctx = { cwd: workspace };
  const catCommand = `cat ${join(workspace, CLI_PATH)}`;
  const persisted = [
    buildReadToolCall({ toolCallId: "call-read", path: CLI_PATH }),
    buildToolResultMessage({ toolCallId: "call-read", content: OLD_BODY }),
    buildShellToolCall({ toolCallId: DUMP_CALL_ID, command: catCommand }),
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
  await adapter.onToolResult(
    {
      toolName: "bash",
      toolCallId: DUMP_CALL_ID,
      input: { command: catCommand },
      content: OLD_BODY,
      isError: false,
    },
    ctx,
  );

  return { adapter, ctx, persisted, workspace };
}

test("PCR 0082: cold over-cap cat keeps its pair with a truthful budget marker", async () => {
  const board = await setupBoard();
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

    assert.equal(toolCallIds(result.messages).includes(DUMP_CALL_ID), true);
    const dumpResult = toolResultFor(result.messages, DUMP_CALL_ID);
    assert.ok(dumpResult);
    const marker = messageText([dumpResult]);
    assert.match(marker, new RegExp(`freshctx:stale-dump path=${CLI_PATH}`, "u"));
    assert.match(marker, /omitted from the live projection for budget/u);
    assert.doesNotMatch(marker, /Current content is supplied in the live projection/u);
  } finally {
    await rm(board.workspace, { recursive: true, force: true });
  }
});

test("PCR 0082: same-turn refresh over cap keeps the cat pair and full CL1", async () => {
  const board = await setupBoard();
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
  } finally {
    await rm(board.workspace, { recursive: true, force: true });
  }
});

test("PCR 0082: unresolved tracked cat marker does not claim current bytes", () => {
  const messages = [
    buildShellToolCall({ toolCallId: DUMP_CALL_ID, command: `cat ${CLI_PATH}` }),
    buildToolResultMessage({ toolCallId: DUMP_CALL_ID, content: OLD_BODY }),
  ];
  const projection = {
    selected: [],
    omitted: [{ unit: { id: "fc-unresolved", path: CLI_PATH }, reason: "unresolved" }],
  };
  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["bash"]),
    servedCallIds: new Set([DUMP_CALL_ID]),
    observedCallIds: new Set([DUMP_CALL_ID]),
    trackedPaths: [CLI_PATH],
    projection,
  });

  assert.equal(toolCallIds(pruned).includes(DUMP_CALL_ID), true);
  const dumpResult = toolResultFor(pruned, DUMP_CALL_ID);
  assert.ok(dumpResult);
  const marker = messageText([dumpResult]);
  assert.doesNotMatch(marker, /CL0/u);
  assert.match(marker, /unresolved/u);
  assert.doesNotMatch(marker, /Current content is supplied in the live projection/u);
});
