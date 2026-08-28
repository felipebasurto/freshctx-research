import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadState } from "../adapters/hermes/bridge.mjs";
import {
  buildReadToolCall,
  buildToolResultMessage,
  createHermesAdapter,
  createHermesStateFile,
  messageText,
} from "../adapters/hermes/replay.mjs";
import { DEFAULT_BUDGET_CHARS } from "../adapters/request-prune.mjs";
import { FreshCtxEngine } from "../src/index.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
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
const OMITTED_BODY = `export const marker = "PCR_0105_OMIT";\n${OMITTED_PAD}\n`;

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function selectedUnitsFromTurn(turn, fallbackUnits = []) {
  const decoded = decodeProjectionUnits(turn.projectionText ?? "");
  return decoded.length > 0 ? decoded : fallbackUnits;
}

function toolResultFor(messages, callId) {
  return messages.find((message) =>
    message.tool_call_id === callId
    && message.role === "tool",
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

async function ackHermesDelivery(adapter, ctx, persisted, assistantText = "first answer") {
  await adapter.onTurnComplete(
    [...structuredClone(persisted), { role: "assistant", content: assistantText }],
    ctx,
  );
}

function assertHermesRequestInvariants(turn, {
  probe,
  observed,
  selectedUnits,
  host = "hermes",
} = {}) {
  const units = selectedUnits ?? selectedUnitsFromTurn(turn);
  const metrics = measureRequestVisibility({
    messages: turn.messages,
    projectionText: turn.projectionText,
    selectedUnits: units,
    probesByUnitId: Object.fromEntries(
      units.map((unit) => [unit.id, probe ?? unit.content]),
    ),
    observedByUnitId: Object.fromEntries(
      units.map((unit) => [unit.id, observed ?? ""]),
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

test("PCR 0105: Hermes OpenAI grammar preserves pairing and read-slot inline on collapsed tail", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0105-native-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0105-native-state-");
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");

    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-hermes-0105-native";
    const turn1Persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2 exactly" },
    ];

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx);
    assert.ok(turn1);
    assert.equal(validateProviderSchema(turn1.messages, { host: "hermes" }).valid, true);
    await ackHermesDelivery(adapter, ctx, turn1Persisted);

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2Persisted), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Persisted), ctx);
    assert.ok(turn2);
    await ackHermesDelivery(adapter, ctx, turn2Persisted, LINE2_NEW);

    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: "quote line 2 again unchanged disk" },
    ];
    await adapter.onTurnComplete(structuredClone(turn3Persisted), ctx);
    const turn3 = await adapter.onSelectContext(structuredClone(turn3Persisted), ctx);
    assert.ok(turn3);
    assert.match(turn3.projectionText, /\[freshctx:already-served/u);
    const trackedUnits = selectedUnitsFromTurn(turn2);
    assertHermesRequestInvariants(turn3, {
      probe: LINE2_NEW,
      observed: OLD_BODY,
      selectedUnits: trackedUnits,
    });

    const readSlot = toolResultFor(turn3.messages, callId);
    assert.match(toolResultText(readSlot), /line2 NEW interior/u);
    assert.doesNotMatch(toolResultText(readSlot), /supplied in the live projection/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0105: edited content turn-2 first-NEW inlines at read slot while tail keeps full envelope", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0105-edit-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0105-edit-state-");
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-hermes-0105-edit";
    const turn1Persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx);
    assert.ok(turn1);
    await ackHermesDelivery(adapter, ctx, turn1Persisted);

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2Persisted), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Persisted), ctx);
    assert.ok(turn2);
    assert.ok(turn2.projectionText.includes("<freshctx-unit"));
    assertHermesRequestInvariants(turn2, {
      probe: LINE2_NEW,
      observed: OLD_BODY,
      selectedUnits: selectedUnitsFromTurn(turn2),
    });

    const readSlot = toolResultFor(turn2.messages, callId);
    assert.match(toolResultText(readSlot), /^line1 header\nline2 NEW interior/u);
    assert.doesNotMatch(toolResultText(readSlot), /OLD interior/u);
    assert.equal(countOccurrences(messageText(turn2.messages), NEW_BODY), 2);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0105: deleted file after read never injects last-known bytes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0105-delete-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0105-delete-state-");
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    const filePath = join(workspace, REGION_PATH);
    await writeFile(filePath, OLD_BODY, "utf8");

    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-hermes-0105-delete";
    const persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onTurnComplete(structuredClone(persisted), ctx);
    await rm(filePath);

    const turn = await adapter.onSelectContext(structuredClone(persisted), ctx);
    assert.ok(turn);
    const payloadText = messageText(turn.messages);
    assert.doesNotMatch(payloadText, /OLD interior/u);
    assert.doesNotMatch(payloadText, /NEW interior/u);
    assert.equal(turn.selected, 0);
    assert.match(turn.projectionText, /unresolved="1"/u);
    assert.equal(validateToolPairing(turn.messages).valid, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0105: resolution failure keeps marker-only read slot without observed replay", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0105-unresolved-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0105-unresolved-state-");
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    const filePath = join(workspace, REGION_PATH);
    await writeFile(filePath, OLD_BODY, "utf8");

    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-hermes-0105-unresolved";
    const persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onTurnComplete(structuredClone(persisted), ctx);
    await rm(filePath);

    const turn = await adapter.onSelectContext(structuredClone(persisted), ctx);
    assert.ok(turn);
    const readSlot = toolResultFor(turn.messages, callId);
    assert.ok(readSlot);
    assert.doesNotMatch(toolResultText(readSlot), /OLD interior/u);
    assert.doesNotMatch(messageText(turn.messages), /OLD interior/u);
    assert.match(turn.projectionText, /unresolved="1"/u);
    assert.equal(validateToolPairing(turn.messages).valid, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0105: over-budget read keeps truthful omission marker without stale body replay", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0105-budget-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0105-budget-state-");
  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, OMITTED_PATH), OMITTED_BODY, "utf8");

    const adapter = createHermesAdapter({ stateFile, budgetChars: DEFAULT_BUDGET_CHARS });
    const ctx = { cwd: workspace };
    const callId = "call-hermes-0105-budget";
    const turn1Persisted = [
      buildReadToolCall({ toolCallId: callId, path: OMITTED_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OMITTED_BODY }),
      { role: "user", content: "quote the marker" },
    ];

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx);
    assert.ok(turn1);
    const turn1Read = toolResultFor(turn1.messages, callId);
    assert.match(toolResultText(turn1Read), /freshctx:omitted-read/u);
    assert.match(toolResultText(turn1Read), /budget/u);
    assert.doesNotMatch(toolResultText(turn1Read), /PCR_0105_OMIT/u);
    await ackHermesDelivery(adapter, ctx, turn1Persisted);

    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "noted" },
      { role: "user", content: "again unchanged" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2Persisted), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Persisted), ctx);
    assert.ok(turn2);
    assert.match(turn2.projectionText, /budget-omitted="1"/u);
    assert.equal(turn2.selected, 0);
    const turn2Read = toolResultFor(turn2.messages, callId);
    assert.match(toolResultText(turn2Read), /freshctx:omitted-read/u);
    assert.doesNotMatch(toolResultText(turn2Read), /PCR_0105_OMIT/u);
    assert.doesNotMatch(messageText(turn2.messages), /\[freshctx:already-served/u);
    assert.equal(validateToolPairing(turn2.messages).valid, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0105: retry after undelivered projection does not promote skip or replay stale tool bytes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0105-retry-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0105-retry-state-");
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");
    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-hermes-0105-retry";
    const persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onTurnComplete(structuredClone(persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(persisted), ctx);
    assert.ok(turn1);
    assert.equal(turn1.telemetry.skipEligibleSelections, 0);

    const retry = await adapter.onSelectContext(structuredClone(persisted), ctx);
    assert.ok(retry);
    assert.equal(retry.telemetry.skipEligibleSelections, 0);
    const pendingState = await loadState(stateFile);
    assert.ok(pendingState.pendingInjectedRevision);
    assert.equal(pendingState.lastInjectedRevision, undefined);
    assert.match(retry.projectionText, /<freshctx /u);
    assert.doesNotMatch(retry.projectionText, /\[freshctx:already-served/u);
    assertHermesRequestInvariants(retry, {
      probe: LINE2_NEW,
      observed: OLD_BODY,
      selectedUnits: selectedUnitsFromTurn(retry),
    });

    await ackHermesDelivery(adapter, ctx, persisted, "applied answer");

    const collapsedPersisted = [
      ...structuredClone(persisted),
      { role: "assistant", content: "applied answer" },
      { role: "user", content: "again unchanged" },
    ];
    await adapter.onTurnComplete(structuredClone(collapsedPersisted), ctx);
    const collapsed = await adapter.onSelectContext(structuredClone(collapsedPersisted), ctx);
    assert.ok(collapsed);
    assert.equal(collapsed.telemetry.skipEligibleSelections, 1);
    assert.match(collapsed.projectionText, /\[freshctx:already-served/u);
    assertHermesRequestInvariants(collapsed, {
      probe: LINE2_NEW,
      observed: OLD_BODY,
      selectedUnits: selectedUnitsFromTurn(retry),
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0105: adapter failure fail-open preserves persisted messages unchanged", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0105-failopen-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0105-failopen-state-");
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createHermesAdapter({ stateFile, budgetChars: 8_000 });
    const ctx = { cwd: workspace };
    const persisted = [
      buildReadToolCall({ toolCallId: "call-hermes-0105-fail", path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: "call-hermes-0105-fail", content: OLD_BODY }),
      { role: "user", content: "task" },
    ];

    await adapter.onTurnComplete(structuredClone(persisted), ctx);

    const originalProject = FreshCtxEngine.prototype.project;
    FreshCtxEngine.prototype.project = () => {
      throw new Error("simulated context failure");
    };
    const hookResult = await adapter.onSelectContext(structuredClone(persisted), ctx);
    FreshCtxEngine.prototype.project = originalProject;

    assert.equal(hookResult, undefined);
    const requestMessages = hookResult?.messages ?? persisted;
    assert.deepEqual(requestMessages, persisted);
    assert.match(messageText(requestMessages), /OLD interior/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0105: later-turn exact quotation of never-quoted footer with empty tail", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0105-footer-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0105-footer-state-");
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-hermes-0105-footer";
    let persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2 exactly" },
    ];
    let trackedUnits = [];

    await adapter.onTurnComplete(structuredClone(persisted), ctx);
    let turn = await adapter.onSelectContext(structuredClone(persisted), ctx);
    assert.ok(turn);
    trackedUnits = selectedUnitsFromTurn(turn);
    await ackHermesDelivery(adapter, ctx, persisted);

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    for (const [assistantText, userText] of [
      ["first answer", "quote line 2 raw bytes exactly"],
      [LINE2_NEW, "quote line 2 again unchanged disk"],
      [LINE2_NEW, `quote this exact footer line raw: ${LINE3_FOOTER}`],
    ]) {
      persisted = [
        ...structuredClone(persisted),
        { role: "assistant", content: assistantText },
        { role: "user", content: userText },
      ];
      await adapter.onTurnComplete(structuredClone(persisted), ctx);
      turn = await adapter.onSelectContext(structuredClone(persisted), ctx);
      assert.ok(turn);
      if (!userText.includes("footer")) {
        trackedUnits = selectedUnitsFromTurn(turn, trackedUnits);
        await ackHermesDelivery(adapter, ctx, persisted, assistantText);
      }
    }

    assert.equal(turn.projectionText, "");
    assert.equal(turn.telemetry.projectionBytes, 0);
    assert.doesNotMatch(messageText(turn.messages), /OLD interior/u);
    assertHermesRequestInvariants(turn, {
      probe: LINE3_FOOTER,
      observed: OLD_BODY,
      selectedUnits: trackedUnits,
    });
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

test("PCR 0105: request copy rewrites read slot while persisted session stays observation-time", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0105-persisted-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0105-persisted-state-");
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");
    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const callId = "call-hermes-0105-persisted";
    const persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
      { role: "user", content: "quote line 2" },
    ];

    await adapter.onTurnComplete(structuredClone(persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(persisted), ctx);
    assert.ok(turn1);
    await ackHermesDelivery(adapter, ctx, persisted);

    const turn2Persisted = [
      ...structuredClone(persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 again unchanged disk" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2Persisted), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Persisted), ctx);
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
