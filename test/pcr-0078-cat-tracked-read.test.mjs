import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildShellToolCall,
  buildToolResultMessage,
  captureProviderRequest,
  createPiAdapter,
  DEFAULT_BUDGET_CHARS,
  messageText,
} from "../adapters/pi/replay.mjs";
import {
  parseShellFileRead,
  shellCommandFromInput,
  tokenizeShellCommand,
} from "../adapters/shell-read.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";

const PROBE_PATH = "probe.ts";
const OLD_BODY = "export const marker = 'T78_OLD';\n".repeat(40);
const NEW_BODY = "export const marker = 'T78_NEW';\n".repeat(40);
const MAX_TRACKED = 512 * 1024;

const LARGE_PATH = "src/large.ts";
const HEAD_LINES = 120;
const SMALL_FILE_COUNT = 20;
const SMALL_LINES = 30;
const LARGE_LINES = 2_000;

function smallBody(index) {
  return `export const s${index} = "SMALL_${index}";\n`.repeat(SMALL_LINES);
}

function largeBody(marker = "LARGE_OLD") {
  const lines = `export const big = "${marker}";\n`.repeat(LARGE_LINES);
  return `${lines}export const tailMarker = "TAIL_ONLY_${marker}";\n`;
}

function headSlice(content, lineCount = HEAD_LINES) {
  return `${content.split("\n").slice(0, lineCount).join("\n")}\n`;
}

async function writeProbe(workspace, content) {
  await writeFile(join(workspace, PROBE_PATH), content, { encoding: "utf8" });
}

function turn1ShellMessages(staleBody = OLD_BODY) {
  return [
    buildShellToolCall({ toolCallId: "call-t78", command: `cat ${PROBE_PATH}` }),
    buildToolResultMessage({ toolCallId: "call-t78", content: staleBody }),
    { role: "user", content: "what is the marker?" },
  ];
}

function turn1ReadMessages(staleBody = OLD_BODY) {
  return [
    buildReadToolCall({ toolCallId: "call-t78-read", path: PROBE_PATH }),
    buildToolResultMessage({ toolCallId: "call-t78-read", content: staleBody }),
    { role: "user", content: "what is the marker?" },
  ];
}

async function runShellTwoTurnReplay({ workspace, editBeforeTurn2 = false }) {
  const adapter = createPiAdapter({ budgetChars: 120_000 });
  const ctx = { cwd: workspace };
  const persisted = turn1ShellMessages();

  await adapter.onTurnStart({ turnIndex: 1 });
  await adapter.onToolResult(
    {
      toolName: "bash",
      toolCallId: "call-t78",
      input: { command: `cat ${PROBE_PATH}` },
      content: OLD_BODY,
      isError: false,
    },
    ctx,
  );
  assert.equal(adapter.engine.registry.list().length, 1);

  const turn1 = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
  assert.ok(turn1);

  if (editBeforeTurn2) {
    await writeProbe(workspace, NEW_BODY);
  }

  await adapter.onTurnStart({ turnIndex: 2 });
  const turn2 = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
  assert.ok(turn2);

  return { turn1, turn2 };
}

async function buildLargeWorkspaceBoard({ budgetChars = DEFAULT_BUDGET_CHARS } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0078-large-"));
  await mkdir(join(workspace, "src"), { recursive: true });

  const large = largeBody();
  await writeFile(join(workspace, LARGE_PATH), large, "utf8");
  const headContent = headSlice(large);

  const smalls = [];
  const messages = [{ role: "user", content: "Survey the workspace sources." }];

  for (let index = 0; index < SMALL_FILE_COUNT; index += 1) {
    const path = `src/s${index}.ts`;
    const body = smallBody(index);
    await writeFile(join(workspace, path), body, "utf8");
    const callId = `call-s${index}`;
    smalls.push({ path, body, callId });
    messages.push(buildReadToolCall({ toolCallId: callId, path }));
    messages.push(buildToolResultMessage({ toolCallId: callId, content: body }));
  }

  messages.push(buildReadToolCall({ toolCallId: "call-large-read", path: LARGE_PATH }));
  messages.push(buildToolResultMessage({ toolCallId: "call-large-read", content: large }));
  messages.push(
    buildShellToolCall({
      toolCallId: "call-large-head",
      command: `head -n ${HEAD_LINES} ${LARGE_PATH}`,
    }),
  );
  messages.push(buildToolResultMessage({ toolCallId: "call-large-head", content: headContent }));
  messages.push({ role: "user", content: "Summarize large.ts head and the small modules." });

  const adapter = createPiAdapter({ budgetChars });
  const ctx = { cwd: workspace };

  await adapter.onTurnStart({ turnIndex: 1 });
  for (const small of smalls) {
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: small.callId,
        input: { path: small.path },
        content: small.body,
        isError: false,
      },
      ctx,
    );
  }
  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: "call-large-read",
      input: { path: LARGE_PATH },
      content: large,
      isError: false,
    },
    ctx,
  );
  await adapter.onToolResult(
    {
      toolName: "bash",
      toolCallId: "call-large-head",
      input: { command: `head -n ${HEAD_LINES} ${LARGE_PATH}` },
      content: headContent,
      isError: false,
    },
    ctx,
  );

  const turn1 = await adapter.onContext(
    { messages: structuredClone(messages), budgetChars },
    ctx,
  );

  return { workspace, adapter, ctx, messages, large, headContent, turn1 };
}

async function editLargeHeadLine(workspace) {
  const lines = (await readFile(join(workspace, LARGE_PATH), "utf8")).split("\n");
  lines[9] = 'export const big = "LARGE_NEW";';
  await writeFile(join(workspace, LARGE_PATH), lines.join("\n"), "utf8");
}

test("PCR 0078: parseShellFileRead recognizes cat-class single-file reads", () => {
  assert.deepEqual(parseShellFileRead("cat src/a.ts"), { path: "src/a.ts", scope: "file" });
  assert.deepEqual(parseShellFileRead("head -n 5 src/a.ts"), {
    path: "src/a.ts",
    scope: "region",
    startLine: 1,
    endLine: 5,
  });
  assert.deepEqual(parseShellFileRead("tail -n 3 src/a.ts"), {
    path: "src/a.ts",
    scope: "region",
    tailLines: 3,
  });
  assert.deepEqual(parseShellFileRead("sed -n '2,4p' src/a.ts"), {
    path: "src/a.ts",
    scope: "region",
    startLine: 2,
    endLine: 4,
  });
  assert.deepEqual(parseShellFileRead("nl src/a.ts"), { path: "src/a.ts", scope: "file" });
  assert.deepEqual(parseShellFileRead("bash -c 'cat src/a.ts'"), { path: "src/a.ts", scope: "file" });
});

test("PCR 0078: parseShellFileRead rejects unsafe or ambiguous shell", () => {
  assert.equal(parseShellFileRead("cat a.ts b.ts"), null);
  assert.equal(parseShellFileRead("cat a.ts | wc -l"), null);
  assert.equal(parseShellFileRead("cat $(find . -name x)"), null);
  assert.equal(parseShellFileRead("echo hello"), null);
  assert.equal(parseShellFileRead("wc -l src/a.ts"), null);
});

test("PCR 0078: bash cat of workspace text file is tracked and turn-2 edit injects NEW", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0078-cat-"));
  try {
    await writeProbe(workspace, OLD_BODY);
    const { turn1, turn2 } = await runShellTwoTurnReplay({ workspace, editBeforeTurn2: true });

    assert.match(turn1.projection.text, /T78_OLD/u);
    assert.doesNotMatch(turn1.projection.text, /T78_NEW/u);
    assert.match(turn2.projection.text, /T78_NEW/u);
    assert.doesNotMatch(turn2.projection.text, /T78_OLD/u);

    const payloadText = messageText(turn2.messages);
    assert.match(payloadText, /T78_NEW/u);
    assert.doesNotMatch(payloadText, /T78_OLD/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0078: official read replay still works (0073/0076/0077 regression guard)", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0078-read-"));
  try {
    await writeProbe(workspace, NEW_BODY);
    const capture = await captureProviderRequest({
      cwd: workspace,
      persistedMessages: turn1ReadMessages(OLD_BODY),
      budgetChars: 120_000,
    });

    assert.ok(capture.adapterApplied);
    assert.match(capture.projectionText, /T78_NEW/u);
    assert.doesNotMatch(capture.payloadText, /T78_OLD/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0078: outside-workspace cat stays untracked last-resort shell result", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0078-outside-"));
  const outside = await mkdtemp(join(tmpdir(), "freshctx-pcr-0078-outside-other-"));
  try {
    await writeProbe(outside, OLD_BODY);
    const outsidePath = join(outside, PROBE_PATH);
    const adapter = createPiAdapter({ budgetChars: 8_000 });
    const ctx = { cwd: workspace };

    await adapter.onToolResult(
      {
        toolName: "bash",
        toolCallId: "call-outside",
        input: { command: `cat ${outsidePath}` },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    assert.equal(adapter.engine.registry.list().length, 0);

    const persisted = [
      buildShellToolCall({ toolCallId: "call-outside", command: `cat ${outsidePath}` }),
      buildToolResultMessage({ toolCallId: "call-outside", content: OLD_BODY }),
      { role: "user", content: "task" },
    ];
    const hookResult = await adapter.onContext({ messages: persisted }, ctx);
    assert.equal(hookResult, undefined);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("PCR 0078: binary cat stays untracked last-resort shell result", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0078-binary-"));
  try {
    const binaryPath = "probe.bin";
    await writeFile(join(workspace, binaryPath), Buffer.from([0, 1, 2, 0, 4]), { encoding: null });
    const adapter = createPiAdapter({ budgetChars: 8_000 });

    await adapter.onToolResult(
      {
        toolName: "bash",
        toolCallId: "call-binary",
        input: { command: `cat ${binaryPath}` },
        content: "binary",
        isError: false,
      },
      { cwd: workspace },
    );
    assert.equal(adapter.engine.registry.list().length, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0078: oversized cat stays untracked last-resort shell result", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0078-oversized-"));
  try {
    const bigPath = "big.txt";
    await writeFile(join(workspace, bigPath), "x".repeat(MAX_TRACKED + 1), { encoding: "utf8" });
    const adapter = createPiAdapter({ budgetChars: 8_000 });

    await adapter.onToolResult(
      {
        toolName: "bash",
        toolCallId: "call-big",
        input: { command: `cat ${bigPath}` },
        content: "x".repeat(100),
        isError: false,
      },
      { cwd: workspace },
    );
    assert.equal(adapter.engine.registry.list().length, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0078: empty registry fail-open preserves original provider payload", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0078-empty-"));
  try {
    const original = [{ role: "user", content: "task only" }];
    const adapter = createPiAdapter({ budgetChars: 8_000 });
    const hookResult = await adapter.onContext({ messages: original }, { cwd: workspace });
    assert.equal(hookResult, undefined);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0078: shellCommandFromInput reads command field", () => {
  assert.equal(shellCommandFromInput({ command: "cat a.ts" }), "cat a.ts");
  assert.equal(shellCommandFromInput({ path: "a.ts" }), null);
});

test("PCR 0078: tokenizeShellCommand handles quoted paths", () => {
  assert.deepEqual(tokenizeShellCommand('cat "path with spaces/a.ts"'), [
    "cat",
    "path with spaces/a.ts",
  ]);
});

test("PCR 0078: large-workspace turn 1 serves small files and tracked head slice", async () => {
  const { workspace, turn1 } = await buildLargeWorkspaceBoard();
  try {
    assert.ok(turn1);
    assert.equal(DEFAULT_BUDGET_CHARS, 32_768);
    assert.equal(turn1.projection.selected.length, 21);
    assert.equal(
      turn1.projection.omitted.filter((item) => item.reason === "budget").length,
      1,
    );
    assert.deepEqual(
      turn1.projection.omitted
        .filter((item) => item.reason === "budget")
        .map((item) => item.unit.path),
      [LARGE_PATH],
    );
    assert.ok(
      turn1.projection.selected.some(
        (unit) => unit.path === LARGE_PATH && unit.endLine === HEAD_LINES + 1,
      ),
    );
    assert.match(turn1.projection.text, /LARGE_OLD/u);
    const t1Bytes = Buffer.byteLength(turn1.projection.text, "utf8");
    assert.ok(t1Bytes > 9_000 && t1Bytes < 30_000, `t1Bytes=${t1Bytes}`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0078: budget-omitted whole-file read is pruned not left as stale cat body", async () => {
  const { workspace, turn1, messages, large } = await buildLargeWorkspaceBoard();
  try {
    const payloadText = messageText(turn1.messages);
    assert.ok(!payloadText.includes('TAIL_ONLY_LARGE_OLD'));
    assert.match(payloadText, /\[freshctx:/u);
    assert.match(turn1.projection.text, /LARGE_OLD/u);
    assert.equal(messages.filter((message) => message.role === "tool").length, 22);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0078: large-workspace turn 2 unchanged includes current bodies", async () => {
  const { workspace, adapter, ctx, messages, turn1 } = await buildLargeWorkspaceBoard();
  try {
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext(
      { messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS },
      ctx,
    );
    assert.ok(turn2);
    const turn1Bytes = Buffer.byteLength(turn1.projection.text, "utf8");
    const turn2Bytes = Buffer.byteLength(turn2.projection.text, "utf8");
    const units = decodeProjectionUnits(turn2.projection.text);
    assert.equal(units.length, turn2.projection.selected.length);
    for (const unit of units) {
      assert.ok(unit.content.length > 0);
      assert.equal(unit.contentBytes, Buffer.byteLength(unit.content, "utf8"));
    }
    assert.match(turn2.projection.text, /LARGE_OLD/u);
    assert.doesNotMatch(turn2.projection.text, /unchanged="true"/u);
    assert.equal(turn2Bytes, turn1Bytes);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0078: large-workspace turn 2 after head-line edit injects NEW not stale shell body", async () => {
  const { workspace, adapter, ctx, messages, turn1 } = await buildLargeWorkspaceBoard();
  try {
    await editLargeHeadLine(workspace);
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext(
      { messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS },
      ctx,
    );
    assert.ok(turn2);
    assert.match(turn2.projection.text, /LARGE_NEW/u);
    assert.ok(!messageText(turn2.messages).includes('TAIL_ONLY_LARGE_OLD'));
    const turn1Bytes = Buffer.byteLength(turn1.projection.text, "utf8");
    const turn2Bytes = Buffer.byteLength(turn2.projection.text, "utf8");
    assert.ok(turn2Bytes <= turn1Bytes + 500);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0078: old 24k still budget-omits whole-file reads on dense small-module board", async () => {
  const { workspace, turn1 } = await buildLargeWorkspaceBoard({ budgetChars: 24_000 });
  try {
    assert.ok(turn1);
    assert.equal(
      turn1.projection.omitted.filter((item) => item.reason === "budget").length,
      1,
    );
    assert.deepEqual(
      turn1.projection.omitted
        .filter((item) => item.reason === "budget")
        .map((item) => item.unit.path),
      [LARGE_PATH],
    );
    assert.ok(
      turn1.projection.selected.some(
        (unit) => unit.path === LARGE_PATH && unit.endLine === HEAD_LINES + 1,
      ),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
