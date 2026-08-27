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

const CLI_PATH = "src/viajante/cli.py";
const READ_CALL_ID = "call-read";
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

async function setupBoard({ includeDump = false } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0083-"));
  await mkdir(join(workspace, "src/viajante"), { recursive: true });
  await writeFile(join(workspace, CLI_PATH), OLD_BODY, "utf8");

  const adapter = createPiAdapter({ budgetChars: DEFAULT_BUDGET_CHARS });
  const ctx = { cwd: workspace };
  const persisted = [
    buildReadToolCall({ toolCallId: READ_CALL_ID, path: CLI_PATH }),
    buildToolResultMessage({ toolCallId: READ_CALL_ID, content: OLD_BODY }),
  ];
  if (includeDump) {
    const catCommand = `cat ${join(workspace, CLI_PATH)}`;
    persisted.push(buildShellToolCall({ toolCallId: DUMP_CALL_ID, command: catCommand }));
    persisted.push(buildToolResultMessage({ toolCallId: DUMP_CALL_ID, content: OLD_BODY }));
  }
  persisted.push({ role: "user", content: "CLI=?" });

  await adapter.onTurnStart({ turnIndex: 1 });
  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: READ_CALL_ID,
      input: { path: CLI_PATH },
      content: OLD_BODY,
      isError: false,
    },
    ctx,
  );
  if (includeDump) {
    const catCommand = `cat ${join(workspace, CLI_PATH)}`;
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
  }

  return { adapter, ctx, persisted, workspace };
}

test("PCR 0083: cold over-cap official read keeps its pair with a truthful budget marker", async () => {
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

    assert.equal(toolCallIds(result.messages).includes(READ_CALL_ID), true);
    const readResult = toolResultFor(result.messages, READ_CALL_ID);
    assert.ok(readResult);
    const marker = messageText([readResult]);
    assert.match(marker, new RegExp(`path=${CLI_PATH}`, "u"));
    assert.match(marker, /omitted from the live projection for budget/u);
    assert.doesNotMatch(marker, /Current content is supplied in the live projection/u);
  } finally {
    await rm(board.workspace, { recursive: true, force: true });
  }
});

test("PCR 0083: same-turn CL1 refresh keeps official read pair and one live body", async () => {
  const board = await setupBoard({ includeDump: true });
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

    assert.equal(toolCallIds(result.messages).includes(READ_CALL_ID), true);
    const readResult = toolResultFor(result.messages, READ_CALL_ID);
    assert.ok(readResult);
    assert.doesNotMatch(messageText([readResult]), /CL0/u);
    assert.match(messageText([readResult]), /Current content is supplied in the live projection/u);

    assert.equal(toolCallIds(result.messages).includes(DUMP_CALL_ID), true);
    const dumpResult = toolResultFor(result.messages, DUMP_CALL_ID);
    assert.ok(dumpResult);
    assert.doesNotMatch(messageText([dumpResult]), /CL0/u);
  } finally {
    await rm(board.workspace, { recursive: true, force: true });
  }
});
