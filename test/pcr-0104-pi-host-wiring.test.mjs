import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_BUDGET_CHARS } from "../adapters/request-prune.mjs";
import {
  buildReadToolCall,
  buildToolResultMessage,
  createPiAdapter,
  messageText,
} from "../adapters/pi/replay.mjs";
import {
  measureRequestVisibility,
  validateProviderSchema,
  validateToolPairing,
} from "./helpers/native-harness-measure.mjs";

const REGION_PATH = "ws/sample.txt";
const OLD_BODY = "line1 header\nline2 OLD interior\nline3 footer\n";
const NEW_BODY = "line1 header\nline2 NEW interior\nline3 footer\n";
const LINE2_NEW = "line2 NEW interior";
const LINE3_FOOTER = "line3 footer";

const OMITTED_PATH = "src/large.ts";
const OMITTED_PAD = "x".repeat(39_000);
const OMITTED_BODY = `export const marker = "PCR_0104_OMIT";\n${OMITTED_PAD}\n`;

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function toolResultFor(messages, callId) {
  return messages.find((message) =>
    (message.toolCallId ?? message.tool_call_id) === callId
    && (message.role === "tool" || message.role === "toolResult"),
  );
}

function toolResultText(message) {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

/** Pi-native assistant/toolCall + toolResult grammar (PCR 0081/0089). */
function piNativeReadPair({ callId, path, content }) {
  return [
    {
      role: "assistant",
      content: [
        { type: "toolCall", id: callId, name: "read", arguments: { path } },
      ],
    },
    {
      role: "toolResult",
      toolCallId: callId,
      toolName: "read",
      content: [{ type: "text", text: content }],
      isError: false,
    },
  ];
}

async function trackNativeRead(adapter, ctx, { callId, path, content }) {
  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: callId,
      input: { path },
      content: [{ type: "text", text: content }],
      isError: false,
    },
    ctx,
  );
}

function assertPiRequestInvariants(turn, { probe, observed, host = "pi" } = {}) {
  const metrics = measureRequestVisibility({
    messages: turn.messages,
    projectionText: turn.projection.text,
    selectedUnits: turn.projection.selected,
    probesByUnitId: Object.fromEntries(
      turn.projection.selected.map((unit) => [unit.id, probe ?? unit.content]),
    ),
    observedByUnitId: Object.fromEntries(
      turn.projection.selected.map((unit) => [unit.id, observed ?? ""]),
    ),
    telemetry: turn.telemetry,
    host,
  });
  assert.equal(metrics.schema.valid, true, metrics.schema.issues.join("; "));
  assert.equal(metrics.schema.pairing.valid, true);
  assert.equal(metrics.quoteability.allSelectedQuoteable, true);
  assert.equal(metrics.staleBodyCopyCount, 0);
  return metrics;
}

test("PCR 0104: Pi-native grammar preserves pairing and read-slot inline on collapsed tail", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0104-native-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");

    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-pi-0104-native";
    const turn1Persisted = [
      ...piNativeReadPair({ callId, path: REGION_PATH, content: OLD_BODY }),
      { role: "user", content: "quote line 2 exactly" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await trackNativeRead(adapter, ctx, { callId, path: REGION_PATH, content: OLD_BODY });
    const turn1 = await adapter.onContext({ messages: structuredClone(turn1Persisted) }, ctx);
    assert.ok(turn1);
    assert.equal(validateProviderSchema(turn1.messages, { host: "pi" }).valid, true);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: [{ type: "text", text: LINE2_NEW }] },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
    assert.ok(turn2);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn2.messages) } });

    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: [{ type: "text", text: LINE2_NEW }] },
      { role: "user", content: "quote line 2 again unchanged disk" },
    ];
    await adapter.onTurnStart({ turnIndex: 3 });
    const turn3 = await adapter.onContext({ messages: structuredClone(turn3Persisted) }, ctx);
    assert.ok(turn3);
    assert.equal(turn3.projection.text, "");
    assert.equal(turn3.telemetry.projectionBytes, 0);
    assertPiRequestInvariants(turn3, { probe: LINE2_NEW, observed: OLD_BODY });

    const readSlot = toolResultFor(turn3.messages, callId);
    assert.match(toolResultText(readSlot), /line2 NEW interior/u);
    assert.doesNotMatch(toolResultText(readSlot), /supplied in the live projection/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0104: edited content turn-2 first-NEW inlines at read slot while tail keeps full envelope", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0104-edit-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-pi-0104-edit";
    const turn1Persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: callId,
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
    assertPiRequestInvariants(turn2, { probe: LINE2_NEW, observed: OLD_BODY });

    const readSlot = toolResultFor(turn2.messages, callId);
    assert.match(toolResultText(readSlot), /^line1 header\nline2 NEW interior/u);
    assert.doesNotMatch(toolResultText(readSlot), /OLD interior/u);
    assert.equal(countOccurrences(messageText(turn2.messages), NEW_BODY), 2);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0104: deleted file after read never injects last-known bytes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0104-delete-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    const filePath = join(workspace, REGION_PATH);
    await writeFile(filePath, OLD_BODY, "utf8");

    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-pi-0104-delete";
    const persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: callId,
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    await rm(filePath);

    const turn = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
    assert.ok(turn);
    const payloadText = messageText(turn.messages);
    assert.doesNotMatch(payloadText, /OLD interior/u);
    assert.doesNotMatch(payloadText, /NEW interior/u);
    assert.equal(turn.projection.selected.length, 0);
    assert.match(turn.projection.text, /unresolved="1"/u);
    assert.equal(validateToolPairing(turn.messages).valid, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0104: resolution failure keeps marker-only read slot without observed replay", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0104-unresolved-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    const filePath = join(workspace, REGION_PATH);
    await writeFile(filePath, OLD_BODY, "utf8");

    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-pi-0104-unresolved";
    const persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: callId,
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    await rm(filePath);

    const turn = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
    assert.ok(turn);
    const readSlot = toolResultFor(turn.messages, callId);
    assert.ok(readSlot);
    assert.doesNotMatch(toolResultText(readSlot), /OLD interior/u);
    assert.doesNotMatch(messageText(turn.messages), /OLD interior/u);
    assert.match(turn.projection.text, /unresolved="1"/u);
    assert.equal(validateToolPairing(turn.messages).valid, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0104: over-budget read keeps truthful omission marker without stale body replay", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0104-budget-"));
  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, OMITTED_PATH), OMITTED_BODY, "utf8");

    const adapter = createPiAdapter({ budgetChars: DEFAULT_BUDGET_CHARS });
    const ctx = { cwd: workspace };
    const callId = "call-pi-0104-budget";
    const turn1Persisted = [
      buildReadToolCall({ toolCallId: callId, path: OMITTED_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OMITTED_BODY }),
      { role: "user", content: "quote the marker" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: callId,
        input: { path: OMITTED_PATH },
        content: OMITTED_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(turn1Persisted) }, ctx);
    assert.ok(turn1);
    const turn1Read = toolResultFor(turn1.messages, callId);
    assert.match(toolResultText(turn1Read), /freshctx:omitted-read/u);
    assert.match(toolResultText(turn1Read), /budget/u);
    assert.doesNotMatch(toolResultText(turn1Read), /PCR_0104_OMIT/u);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "noted" },
      { role: "user", content: "again unchanged" },
    ];
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
    assert.ok(turn2);
    assert.match(turn2.projection.text, /budget-omitted="1"/u);
    assert.equal(turn2.projection.selected.length, 0);
    const turn2Read = toolResultFor(turn2.messages, callId);
    assert.match(toolResultText(turn2Read), /PCR_0104_OMIT/u);
    assert.doesNotMatch(toolResultText(turn2Read), /freshctx:omitted-read/u);
    assert.doesNotMatch(messageText(turn2.messages), /\[freshctx:already-served/u);
    assert.equal(validateToolPairing(turn2.messages).valid, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0104: retry after undelivered projection does not promote skip or replay stale tool bytes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0104-retry-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-pi-0104-retry";
    const persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: callId,
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
    assert.ok(turn1);
    assert.equal(turn1.telemetry.skipEligibleSelections, 0);

    await adapter.onTurnStart({ turnIndex: 2 });
    const retry = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
    assert.ok(retry);
    assert.equal(retry.telemetry.skipEligibleSelections, 0);
    assert.equal(adapter.lastInjectedRevision.size, 0);
    assert.equal(adapter.pendingInjectedRevision.size, 1);
    assert.match(retry.projection.text, /<freshctx /u);
    assert.doesNotMatch(retry.projection.text, /\[freshctx:already-served/u);
    assertPiRequestInvariants(retry, { probe: LINE2_NEW, observed: OLD_BODY });

    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(retry.messages) } });
    assert.equal(adapter.pendingInjectedRevision.size, 0);

    const collapsedPersisted = [
      ...structuredClone(persisted),
      { role: "assistant", content: "applied answer" },
      { role: "user", content: "again unchanged" },
    ];
    await adapter.onTurnStart({ turnIndex: 3 });
    const collapsed = await adapter.onContext({ messages: structuredClone(collapsedPersisted) }, ctx);
    assert.ok(collapsed);
    assert.equal(collapsed.telemetry.skipEligibleSelections, 1);
    assert.equal(collapsed.projection.text, "");
    assert.equal(collapsed.telemetry.projectionBytes, 0);
    assertPiRequestInvariants(collapsed, { probe: LINE2_NEW, observed: OLD_BODY });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0104: adapter failure fail-open preserves persisted messages unchanged", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0104-failopen-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 8_000 });
    const ctx = { cwd: workspace };
    const persisted = [
      buildReadToolCall({ toolCallId: "call-pi-0104-fail", path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: "call-pi-0104-fail", content: OLD_BODY }),
      { role: "user", content: "task" },
    ];

    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0104-fail",
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );

    const originalProject = adapter.engine.project.bind(adapter.engine);
    adapter.engine.project = () => {
      throw new Error("simulated context failure");
    };
    const hookResult = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
    assert.equal(hookResult, undefined);
    adapter.engine.project = originalProject;

    const requestMessages = hookResult?.messages ?? persisted;
    assert.deepEqual(requestMessages, persisted);
    assert.match(messageText(requestMessages), /OLD interior/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0104: later-turn exact quotation of never-quoted footer with empty tail", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0104-footer-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-pi-0104-footer";
    let persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2 exactly" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: callId,
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    let turn = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
    assert.ok(turn);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn.messages) } });

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    for (const [index, userText, assistantText] of [
      [2, "quote line 2 raw bytes exactly", LINE2_NEW],
      [3, "quote line 2 again unchanged disk", LINE2_NEW],
      [4, `quote this exact footer line raw: ${LINE3_FOOTER}`, LINE2_NEW],
    ]) {
      persisted = [
        ...structuredClone(persisted),
        { role: "assistant", content: assistantText },
        { role: "user", content: userText },
      ];
      await adapter.onTurnStart({ turnIndex: index });
      turn = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
      assert.ok(turn);
      if (index < 4) {
        await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn.messages) } });
      }
    }

    assert.equal(turn.projection.text, "");
    assert.equal(turn.telemetry.projectionBytes, 0);
    assert.doesNotMatch(messageText(turn.messages), /OLD interior/u);
    assertPiRequestInvariants(turn, { probe: LINE3_FOOTER, observed: OLD_BODY });
    assert.match(messageText(turn.messages), new RegExp(LINE3_FOOTER, "u"));
    assert.doesNotMatch(
      JSON.stringify(persisted.filter((message) => message.role === "assistant")),
      new RegExp(LINE3_FOOTER, "u"),
    );

    const readSlot = toolResultFor(turn.messages, callId);
    assert.match(toolResultText(readSlot), new RegExp(LINE3_FOOTER, "u"));
    assert.equal(validateToolPairing(turn.messages).valid, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0104: request copy rewrites read slot while persisted session stays observation-time", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0104-persisted-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-pi-0104-persisted";
    const persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: callId,
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
    assert.ok(turn1);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    const turn2Persisted = [
      ...structuredClone(persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 again unchanged disk" },
    ];
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
    assert.ok(turn2);

    const persistedTool = toolResultFor(turn2Persisted, callId);
    assert.match(toolResultText(persistedTool), /OLD interior/u);
    const requestTool = toolResultFor(turn2.messages, callId);
    assert.match(toolResultText(requestTool), /NEW interior/u);
    assert.doesNotMatch(toolResultText(requestTool), /OLD interior/u);
    assert.equal(validateToolPairing(turn2.messages).valid, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
