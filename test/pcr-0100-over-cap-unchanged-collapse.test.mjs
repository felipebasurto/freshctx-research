import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_BUDGET_CHARS } from "../adapters/request-prune.mjs";
import {
  buildReadToolCall,
  buildShellToolCall,
  buildToolResultMessage,
  createPiAdapter,
  messageText,
} from "../adapters/pi/replay.mjs";
import {
  createHermesAdapter,
  createHermesStateFile,
  messageText as hermesMessageText,
} from "../adapters/hermes/replay.mjs";

const REGION_PATH = "ws/sample.txt";
const OLD_BODY = "line1 header\nline2 OLD interior\nline3 footer\n";
const NEW_BODY = "line1 header\nline2 NEW interior\nline3 footer\n";
const LINE2_NEW = "line2 NEW interior";

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

async function buildLargeWorkspaceBoard({ budgetChars = DEFAULT_BUDGET_CHARS } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0100-large-"));
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

test("PCR 0100: over-cap large board turn-2 unchanged collapses instead of re-dumping bodies", async () => {
  const { workspace, adapter, ctx, messages, turn1 } = await buildLargeWorkspaceBoard();
  try {
    assert.ok(turn1);
    const turn1Bytes = turn1.telemetry.projectionBytes;
    assert.ok(turn1Bytes > 9_000, `turn1 should serve the working set (got ${turn1Bytes})`);
    assert.equal(turn1.projection.omitted.filter((item) => item.reason === "budget").length, 1);

    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    messages.push({ role: "assistant", content: "summary" }, { role: "user", content: "again unchanged" });
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext(
      { messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS },
      ctx,
    );
    assert.ok(turn2);
    assert.equal(turn2.projection.text, "");
    assert.equal(turn2.telemetry.projectionBytes, 0);
    assert.ok(turn2.telemetry.projectionBytes < 200, `turn2 collapsed (${turn2.telemetry.projectionBytes})`);
    assert.ok(
      turn2.telemetry.projectionBytes < turn1Bytes / 10,
      `turn2 must not re-dump turn1 bodies (${turn2.telemetry.projectionBytes} vs ${turn1Bytes})`,
    );
    assert.doesNotMatch(turn2.projection.text, /<freshctx-unit/u);
    assert.equal(turn2.telemetry.skipEligibleSelections, 21);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0100: over-cap large board turn-3 collapse then turn-4 omit (0099 path)", async () => {
  const { workspace, adapter, ctx, messages, turn1 } = await buildLargeWorkspaceBoard();
  try {
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    messages.push({ role: "assistant", content: "summary" }, { role: "user", content: "again unchanged" });
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext(
      { messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS },
      ctx,
    );
    assert.ok(turn2);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn2.messages) } });

    messages.push({ role: "assistant", content: "summary2" }, { role: "user", content: "turn three" });
    await adapter.onTurnStart({ turnIndex: 3 });
    const turn3 = await adapter.onContext(
      { messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS },
      ctx,
    );
    assert.ok(turn3);
    assert.equal(turn3.projection.text, "");
    assert.equal(turn3.telemetry.projectionBytes, 0);

    messages.push({ role: "assistant", content: "summary3" }, { role: "user", content: "turn four" });
    await adapter.onTurnStart({ turnIndex: 4 });
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn3.messages) } });
    const turn4 = await adapter.onContext(
      { messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS },
      ctx,
    );
    assert.ok(turn4);
    assert.equal(turn4.projection.text, "");
    assert.equal(turn4.telemetry.projectionBytes, 0);
    assert.doesNotMatch(messageText(turn4.messages), /\[freshctx:already-served/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0100: over-cap large board head-line edit still injects NEW on turn 2 (0080/0098 guard)", async () => {
  const { workspace, adapter, ctx, messages, turn1 } = await buildLargeWorkspaceBoard();
  try {
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });
    await editLargeHeadLine(workspace);

    messages.push({ role: "assistant", content: "summary" }, { role: "user", content: "what changed in large.ts?" });
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext(
      { messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS },
      ctx,
    );
    assert.ok(turn2);
    assert.match(turn2.projection.text, /LARGE_NEW/u);
    assert.match(turn2.projection.text, /TAIL_ONLY_LARGE_OLD/u);
    assert.doesNotMatch(turn2.projection.text, /\[freshctx:already-served units=21\]/u);
    assert.ok(turn2.telemetry.projectionBytes > 1_000);
    assert.equal(turn2.telemetry.skipEligibleSelections, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0100: quoteable first-NEW on small board stays full envelope (0098 regression)", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0100-quoteable-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const turn1Persisted = [
      buildReadToolCall({ toolCallId: "call-pi-0100", path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: "call-pi-0100", content: OLD_BODY }),
      { role: "user", content: "quote line 2 exactly" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0100",
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(turn1Persisted) }, ctx);
    assert.ok(turn1);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
    assert.ok(turn2);
    assert.ok(turn2.projection.text.includes("<freshctx-unit"));
    assert.match(turn2.projection.text, /line2 NEW interior/u);
    assert.ok(turn2.telemetry.projectionBytes > 200);
    assert.doesNotMatch(turn2.projection.text, /\[freshctx:already-served units=1\]/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0100: Hermes over-cap large board collapses on unchanged later turn", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0100-hermes-large-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0100-hermes-state-");
  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    const large = largeBody();
    await writeFile(join(workspace, LARGE_PATH), large, "utf8");
    const headContent = headSlice(large);

    const messages = [{ role: "user", content: "Survey the workspace sources." }];
    for (let index = 0; index < SMALL_FILE_COUNT; index += 1) {
      const path = `src/s${index}.ts`;
      const body = smallBody(index);
      await writeFile(join(workspace, path), body, "utf8");
      const callId = `call-s${index}`;
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

    const hermes = createHermesAdapter({ stateFile, budgetChars: DEFAULT_BUDGET_CHARS });
    const ctx = { cwd: workspace };

    await hermes.onTurnComplete(structuredClone(messages), ctx);
    const turn1Hermes = await hermes.onSelectContext(structuredClone(messages), ctx);
    assert.ok(turn1Hermes);
    await hermes.onTurnComplete(
      [...structuredClone(messages), { role: "assistant", content: "summary" }],
      ctx,
    );

    const turn2Persisted = [
      ...structuredClone(messages),
      { role: "assistant", content: "summary" },
      { role: "user", content: "again unchanged" },
    ];
    await hermes.onTurnComplete(structuredClone(turn2Persisted), ctx);
    const turn2Hermes = await hermes.onSelectContext(structuredClone(turn2Persisted), ctx);
    assert.ok(turn2Hermes);
    assert.equal(turn2Hermes.projectionText, "");
    assert.equal(turn2Hermes.telemetry.projectionBytes, 0);
    assert.ok(turn2Hermes.telemetry.projectionBytes < 200);
    assert.ok(
      turn2Hermes.telemetry.projectionBytes < turn1Hermes.telemetry.projectionBytes / 10,
    );
    assert.doesNotMatch(turn2Hermes.projectionText, /<freshctx-unit/u);
    assert.doesNotMatch(hermesMessageText(turn2Hermes.messages), /TAIL_ONLY_LARGE_OLD/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
