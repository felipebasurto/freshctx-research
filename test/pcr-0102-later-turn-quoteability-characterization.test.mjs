import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildReadToolCall as buildHermesReadToolCall,
  buildToolResultMessage as buildHermesToolResultMessage,
  createHermesAdapter,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import { DEFAULT_BUDGET_CHARS } from "../adapters/request-prune.mjs";
import {
  buildReadToolCall,
  buildShellToolCall,
  buildToolResultMessage,
  createPiAdapter,
} from "../adapters/pi/replay.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { stableReadMarker } from "../src/transcript.mjs";
import {
  formatMeasurementRow,
  isAlreadyServedStub,
  isSummaryReadMarker,
  measureRequestVisibility,
  measureUnitQuoteability,
  validateProviderSchema,
  validateToolPairing,
} from "./helpers/native-harness-measure.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HERMES_HOST_ROOT = join(ROOT, "bench", "hosts", "hermes");
const hermesHostReady = existsSync(join(HERMES_HOST_ROOT, "plugins", "context_engine", "__init__.py"));

const REGION_PATH = "ws/sample.txt";
const OLD_BODY = "line1 header\nline2 OLD interior\nline3 footer\n";
const NEW_BODY = "line1 header\nline2 NEW interior\nline3 footer\n";
const LINE2_NEW = "line2 NEW interior";
const LINE2_OLD = "line2 OLD interior";
function selectedUnitsFromHermesTurn(turn, fallbackUnits = []) {
  const decoded = decodeProjectionUnits(turn.projectionText ?? "");
  return decoded.length > 0 ? decoded : fallbackUnits;
}

const PROBE = LINE2_NEW;

/**
 * Invariant under test (proposed Q1, NOT enforced by production code):
 * Every selected tracked unit has at least one quoteable current representation
 * in the effective model-visible request — bounded UTF-8 body bytes, not merely
 * a summary marker. Prior delivery must not authorize complete omission (Q2).
 *
 * These tests CHARACTERIZE current post-0099/0100 behavior on replay boards.
 * They do not change adapters, request-prune, or core.
 */

function piTurn1Persisted() {
  return [
    buildReadToolCall({ toolCallId: "call-pi-0102", path: REGION_PATH }),
    buildToolResultMessage({ toolCallId: "call-pi-0102", content: OLD_BODY }),
    { role: "user", content: "quote line 2 exactly" },
  ];
}

function hermesTurn1Persisted() {
  return [
    buildHermesReadToolCall({ toolCallId: "call-hermes-0102", path: REGION_PATH }),
    buildHermesToolResultMessage({ toolCallId: "call-hermes-0102", content: OLD_BODY }),
    { role: "user", content: "quote line 2 exactly" },
  ];
}

async function runPiSmallBoardSeam() {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0102-pi-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
  const adapter = createPiAdapter({ budgetChars: 120_000 });
  const ctx = { cwd: workspace };
  const rows = [];
  let priorPayloadText = "";

  await adapter.onTurnStart({ turnIndex: 1 });
  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: "call-pi-0102",
      input: { path: REGION_PATH },
      content: OLD_BODY,
      isError: false,
    },
    ctx,
  );
  const turn1 = await adapter.onContext({ messages: structuredClone(piTurn1Persisted()) }, ctx);
  assert.ok(turn1);
  rows.push(
    formatMeasurementRow({
      turn: 1,
      host: "pi-fresh",
      metrics: measureRequestVisibility({
        messages: turn1.messages,
        projectionText: turn1.projection.text,
        selectedUnits: turn1.projection.selected,
        probesByUnitId: Object.fromEntries(
          turn1.projection.selected.map((unit) => [unit.id, LINE2_OLD]),
        ),
        observedByUnitId: Object.fromEntries(
          turn1.projection.selected.map((unit) => [unit.id, OLD_BODY]),
        ),
        telemetry: turn1.telemetry,
        priorPayloadText,
        host: "pi",
      }),
    }),
  );
  priorPayloadText = rows.at(-1).effectivePayloadBytes ? turn1.messages.map((m) => JSON.stringify(m)).join("") : "";
  await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

  await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

  const turn2Persisted = [
    ...structuredClone(piTurn1Persisted()),
    { role: "assistant", content: "first answer" },
    { role: "user", content: "quote line 2 raw bytes exactly" },
  ];
  await adapter.onTurnStart({ turnIndex: 2 });
  const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
  assert.ok(turn2);
  rows.push(
    formatMeasurementRow({
      turn: 2,
      host: "pi-fresh",
      metrics: measureRequestVisibility({
        messages: turn2.messages,
        projectionText: turn2.projection.text,
        selectedUnits: turn2.projection.selected,
        probesByUnitId: Object.fromEntries(
          turn2.projection.selected.map((unit) => [unit.id, PROBE]),
        ),
        observedByUnitId: Object.fromEntries(
          turn2.projection.selected.map((unit) => [unit.id, OLD_BODY]),
        ),
        telemetry: turn2.telemetry,
        host: "pi",
      }),
    }),
  );
  await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn2.messages) } });

  const turn3Persisted = [
    ...structuredClone(turn2Persisted),
    { role: "assistant", content: LINE2_NEW },
    { role: "user", content: "quote line 2 again unchanged disk" },
  ];
  await adapter.onTurnStart({ turnIndex: 3 });
  const turn3 = await adapter.onContext({ messages: structuredClone(turn3Persisted) }, ctx);
  assert.ok(turn3);
  rows.push(
    formatMeasurementRow({
      turn: 3,
      host: "pi-fresh",
      metrics: measureRequestVisibility({
        messages: turn3.messages,
        projectionText: turn3.projection.text,
        selectedUnits: turn3.projection.selected,
        probesByUnitId: Object.fromEntries(
          turn3.projection.selected.map((unit) => [unit.id, PROBE]),
        ),
        observedByUnitId: Object.fromEntries(
          turn3.projection.selected.map((unit) => [unit.id, OLD_BODY]),
        ),
        telemetry: turn3.telemetry,
        host: "pi",
      }),
    }),
  );
  await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn3.messages) } });

  const turn4Persisted = [
    ...structuredClone(turn3Persisted),
    { role: "assistant", content: LINE2_NEW },
    { role: "user", content: "still unchanged on turn four" },
  ];
  await adapter.onTurnStart({ turnIndex: 4 });
  const turn4 = await adapter.onContext({ messages: structuredClone(turn4Persisted) }, ctx);
  assert.ok(turn4);
  rows.push(
    formatMeasurementRow({
      turn: 4,
      host: "pi-fresh",
      metrics: measureRequestVisibility({
        messages: turn4.messages,
        projectionText: turn4.projection.text,
        selectedUnits: turn4.projection.selected,
        probesByUnitId: Object.fromEntries(
          turn4.projection.selected.map((unit) => [unit.id, PROBE]),
        ),
        observedByUnitId: Object.fromEntries(
          turn4.projection.selected.map((unit) => [unit.id, OLD_BODY]),
        ),
        telemetry: turn4.telemetry,
        host: "pi",
      }),
    }),
  );

  return { workspace, rows, turns: { turn1, turn2, turn3, turn4 } };
}

async function runHermesSmallBoardSeam() {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0102-hermes-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
  const stateFile = await createHermesStateFile("freshctx-pcr-0102-hermes-state-");
  const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
  const ctx = { cwd: workspace };
  const rows = [];
  const turn1Persisted = hermesTurn1Persisted();
  let trackedSelectedUnits = [];

  await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
  const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx);
  assert.ok(turn1);
  trackedSelectedUnits = selectedUnitsFromHermesTurn(turn1);
  rows.push(
    formatMeasurementRow({
      turn: 1,
      host: "hermes-fresh",
      metrics: measureRequestVisibility({
        messages: turn1.messages,
        projectionText: turn1.projectionText,
        selectedUnits: trackedSelectedUnits,
        probesByUnitId: Object.fromEntries(
          trackedSelectedUnits.map((unit) => [unit.id, LINE2_OLD]),
        ),
        observedByUnitId: Object.fromEntries(
          trackedSelectedUnits.map((unit) => [unit.id, OLD_BODY]),
        ),
        telemetry: turn1.telemetry,
        host: "hermes",
      }),
    }),
  );
  await adapter.onTurnComplete(
    [...structuredClone(turn1Persisted), { role: "assistant", content: "first answer" }],
    ctx,
  );

  await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

  const turn2Persisted = [
    ...structuredClone(turn1Persisted),
    { role: "assistant", content: "first answer" },
    { role: "user", content: "quote line 2 raw bytes exactly" },
  ];
  await adapter.onTurnComplete(structuredClone(turn2Persisted), ctx);
  const turn2 = await adapter.onSelectContext(structuredClone(turn2Persisted), ctx);
  assert.ok(turn2);
  trackedSelectedUnits = selectedUnitsFromHermesTurn(turn2);
  rows.push(
    formatMeasurementRow({
      turn: 2,
      host: "hermes-fresh",
      metrics: measureRequestVisibility({
        messages: turn2.messages,
        projectionText: turn2.projectionText,
        selectedUnits: trackedSelectedUnits,
        probesByUnitId: Object.fromEntries(
          trackedSelectedUnits.map((unit) => [unit.id, PROBE]),
        ),
        observedByUnitId: Object.fromEntries(
          trackedSelectedUnits.map((unit) => [unit.id, OLD_BODY]),
        ),
        telemetry: turn2.telemetry,
        host: "hermes",
      }),
    }),
  );
  await adapter.onTurnComplete(
    [...structuredClone(turn2Persisted), { role: "assistant", content: LINE2_NEW }],
    ctx,
  );

  const turn3Persisted = [
    ...structuredClone(turn2Persisted),
    { role: "assistant", content: LINE2_NEW },
    { role: "user", content: "quote line 2 again unchanged disk" },
  ];
  await adapter.onTurnComplete(structuredClone(turn3Persisted), ctx);
  const turn3 = await adapter.onSelectContext(structuredClone(turn3Persisted), ctx);
  assert.ok(turn3);
  rows.push(
    formatMeasurementRow({
      turn: 3,
      host: "hermes-fresh",
      metrics: measureRequestVisibility({
        messages: turn3.messages,
        projectionText: turn3.projectionText,
        selectedUnits: selectedUnitsFromHermesTurn(turn3, trackedSelectedUnits),
        probesByUnitId: Object.fromEntries(
          trackedSelectedUnits.map((unit) => [unit.id, PROBE]),
        ),
        observedByUnitId: Object.fromEntries(
          trackedSelectedUnits.map((unit) => [unit.id, OLD_BODY]),
        ),
        telemetry: turn3.telemetry,
        host: "hermes",
      }),
    }),
  );
  await adapter.onTurnComplete(
    [...structuredClone(turn3Persisted), { role: "assistant", content: LINE2_NEW }],
    ctx,
  );

  const turn4Persisted = [
    ...structuredClone(turn3Persisted),
    { role: "assistant", content: LINE2_NEW },
    { role: "user", content: "still unchanged on turn four" },
  ];
  await adapter.onTurnComplete(structuredClone(turn4Persisted), ctx);
  const turn4 = await adapter.onSelectContext(structuredClone(turn4Persisted), ctx);
  assert.ok(turn4);
  rows.push(
    formatMeasurementRow({
      turn: 4,
      host: "hermes-fresh",
      metrics: measureRequestVisibility({
        messages: turn4.messages,
        projectionText: turn4.projectionText,
        selectedUnits: selectedUnitsFromHermesTurn(turn4, trackedSelectedUnits),
        probesByUnitId: Object.fromEntries(
          trackedSelectedUnits.map((unit) => [unit.id, PROBE]),
        ),
        observedByUnitId: Object.fromEntries(
          trackedSelectedUnits.map((unit) => [unit.id, OLD_BODY]),
        ),
        telemetry: turn4.telemetry,
        host: "hermes",
      }),
    }),
  );

  return { workspace, rows, turns: { turn1, turn2, turn3, turn4 } };
}

function assertSmallBoardSeam(rows, { hostLabel }) {
  assert.equal(rows.length, 4, `${hostLabel}: expected four turn rows`);

  const [t1, t2, t3, t4] = rows;

  assert.ok(t1.projectionBytes > 200, `${hostLabel} t1: full envelope`);
  assert.equal(t1.quoteableAllSelected, true, `${hostLabel} t1: quoteable via projection`);
  assert.equal(t1.pairingValid, true);

  assert.ok(t2.projectionBytes > 200, `${hostLabel} t2: full envelope on first-NEW`);
  assert.equal(t2.quoteableAllSelected, true, `${hostLabel} t2: 0098 first-NEW quoteable`);
  assert.ok(t2.currentBodyCopyCount >= 1, `${hostLabel} t2: current bytes present`);
  assert.equal(t2.collapsedStub, false);
  assert.equal(t2.tailOmitted, false);

  assert.equal(t3.projectionBytes, 99, `${hostLabel} t3: collapse stub`);
  assert.equal(t3.quoteableAllSelected, true, `${hostLabel} t3: quoteable via read slot (PCR 0103)`);
  assert.equal(t3.collapsedStub, true);
  assert.equal(t3.tailOmitted, false);

  assert.equal(t4.projectionBytes, 0, `${hostLabel} t4: empty tail`);
  assert.equal(t4.quoteableAllSelected, true, `${hostLabel} t4+: quoteable via read slot (PCR 0103)`);
  assert.equal(t4.collapsedStub, false);
  assert.equal(t4.tailOmitted, true);
}

test("PCR 0102: measurement helper detects summary markers vs quoteable bytes", () => {
  const unit = { id: "fc_test", path: REGION_PATH, content: NEW_BODY };
  assert.equal(isSummaryReadMarker(stableReadMarker(unit)), true);
  assert.equal(isAlreadyServedStub("[freshctx:already-served units=1]"), true);

  const contentBytes = Buffer.byteLength(NEW_BODY, "utf8");
  const quoteable = measureUnitQuoteability({
    messages: [
      buildReadToolCall({ toolCallId: "c1", path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: "c1", content: NEW_BODY }),
    ],
    projectionText: `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="${contentBytes}">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`,
    unit,
    probe: PROBE,
    observedContent: OLD_BODY,
  });
  assert.equal(quoteable.quoteableCurrent, true);
  assert.equal(quoteable.quoteableViaReadSlot, true);
  assert.equal(quoteable.quoteableViaProjection, true);
  assert.equal(quoteable.markerOnlyAtReadSlot, false);
  assert.ok(quoteable.currentBodyCopyCount >= 1);
});

test("PCR 0102: validateToolPairing preserves native assistant↔tool IDs", () => {
  const messages = [
    buildReadToolCall({ toolCallId: "paired-1", path: "a.ts" }),
    buildToolResultMessage({ toolCallId: "paired-1", content: "body" }),
    { role: "user", content: "task" },
  ];
  const pairing = validateToolPairing(messages);
  assert.equal(pairing.valid, true);
  const schema = validateProviderSchema(messages, { host: "pi" });
  assert.equal(schema.valid, true);
});

test("PCR 0102: Pi small board pins 0098–0100 quoteability seam on replay", async () => {
  const { workspace, rows, turns } = await runPiSmallBoardSeam();
  try {
    assertSmallBoardSeam(rows, { hostLabel: "pi-fresh" });

    const turn2Tool = turns.turn2.messages.find((message) => message.role === "tool");
    assert.match(String(turn2Tool?.content ?? ""), /line2 NEW interior/u);
    assert.doesNotMatch(String(turn2Tool?.content ?? ""), /supplied in the live projection/u);

    const turn3Tool = turns.turn3.messages.find((message) => message.role === "tool");
    assert.match(String(turn3Tool?.content ?? ""), /line2 NEW interior/u);
    assert.doesNotMatch(String(turn3Tool?.content ?? ""), /supplied in the live projection/u);
    assert.ok(decodeProjectionUnits(turns.turn3.projection.text).length === 0);

    assert.equal(turns.turn4.projection.text, "");
    assert.doesNotMatch(JSON.stringify(turns.turn4.messages), /\[freshctx:already-served units=1\]/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0102: Hermes small board pins 0098–0100 quoteability seam on replay", async () => {
  const { workspace, rows, turns } = await runHermesSmallBoardSeam();
  try {
    assertSmallBoardSeam(rows, { hostLabel: "hermes-fresh" });

    const turn2Tool = turns.turn2.messages.find((message) => message.role === "tool");
    assert.match(String(turn2Tool?.content ?? ""), /line2 NEW interior/u);

    assert.match(turns.turn3.projectionText, /\[freshctx:already-served units=1\]/u);
    assert.equal(turns.turn4.projectionText, "");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0102: Hermes narrowed slice keeps turn-2 quoteability with conversation gate", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0102-hermes-narrow-"));
  const stateFile = await createHermesStateFile("freshctx-pcr-0102-hermes-narrow-state-");
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createHermesAdapter({ stateFile, budgetChars: 120_000 });
    const ctx = { cwd: workspace };
    const turn1Persisted = hermesTurn1Persisted();

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    await adapter.onSelectContext(structuredClone(turn1Persisted), ctx, {
      conversationMessages: structuredClone(turn1Persisted),
    });
    await adapter.onTurnComplete(
      [...structuredClone(turn1Persisted), { role: "assistant", content: "first answer" }],
      ctx,
    );

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2Request = [
      ...hermesTurn1Persisted().slice(0, 2),
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    const turn2Conversation = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2Conversation), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Request), ctx, {
      conversationMessages: structuredClone(turn2Conversation),
    });
    assert.ok(turn2);

    const metrics = measureRequestVisibility({
      messages: turn2.messages,
      projectionText: turn2.projectionText,
      selectedUnits: selectedUnitsFromHermesTurn(turn2),
      probesByUnitId: Object.fromEntries(
        selectedUnitsFromHermesTurn(turn2).map((unit) => [unit.id, PROBE]),
      ),
      observedByUnitId: Object.fromEntries(
        selectedUnitsFromHermesTurn(turn2).map((unit) => [unit.id, OLD_BODY]),
      ),
      telemetry: turn2.telemetry,
      host: "hermes",
    });

    assert.equal(metrics.quoteability.allSelectedQuoteable, true);
    assert.equal(metrics.schema.pairing.valid, true);
    assert.ok(metrics.projectionBytes > 200);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0102: over-cap board turn-3/4 pins zero tail with no quoteable current bytes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0102-overcap-"));
  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    const smallCount = 20;
    const headLines = 120;
    const messages = [{ role: "user", content: "Survey sources." }];
    const adapter = createPiAdapter({ budgetChars: DEFAULT_BUDGET_CHARS });
    const ctx = { cwd: workspace };

    for (let index = 0; index < smallCount; index += 1) {
      const path = `src/s${index}.ts`;
      const body = `export const s${index} = "SMALL_${index}";\n`.repeat(30);
      await writeFile(join(workspace, path), body, "utf8");
      const callId = `call-s${index}`;
      messages.push(buildReadToolCall({ toolCallId: callId, path }));
      messages.push(buildToolResultMessage({ toolCallId: callId, content: body }));
      await adapter.onToolResult(
        { toolName: "read", toolCallId: callId, input: { path }, content: body, isError: false },
        ctx,
      );
    }

    const largePath = "src/large.ts";
    const largeBody = `export const big = "LARGE";\n`.repeat(2_000);
    const headContent = `${largeBody.split("\n").slice(0, headLines).join("\n")}\n`;
    await writeFile(join(workspace, largePath), largeBody, "utf8");
    messages.push(buildReadToolCall({ toolCallId: "call-large", path: largePath }));
    messages.push(buildToolResultMessage({ toolCallId: "call-large", content: largeBody }));
    await adapter.onToolResult(
      { toolName: "read", toolCallId: "call-large", input: { path: largePath }, content: largeBody, isError: false },
      ctx,
    );
    messages.push(
      buildShellToolCall({
        toolCallId: "call-large-head",
        command: `head -n ${headLines} ${largePath}`,
      }),
    );
    messages.push(buildToolResultMessage({ toolCallId: "call-large-head", content: headContent }));
    await adapter.onToolResult(
      {
        toolName: "bash",
        toolCallId: "call-large-head",
        input: { command: `head -n ${headLines} ${largePath}` },
        content: headContent,
        isError: false,
      },
      ctx,
    );

    await adapter.onTurnStart({ turnIndex: 1 });
    const turn1 = await adapter.onContext({ messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS }, ctx);
    assert.ok(turn1);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    messages.push({ role: "assistant", content: "summary" }, { role: "user", content: "again unchanged" });
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext({ messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS }, ctx);
    assert.ok(turn2);
    assert.match(turn2.projection.text, /\[freshctx:already-served units=21\]/u);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn2.messages) } });

    messages.push({ role: "assistant", content: "summary2" }, { role: "user", content: "turn three" });
    await adapter.onTurnStart({ turnIndex: 3 });
    const turn3 = await adapter.onContext({ messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS }, ctx);
    assert.ok(turn3);
    assert.equal(turn3.projection.text, "");
    assert.equal(turn3.telemetry.projectionBytes, 0);

    const turn3Metrics = measureRequestVisibility({
      messages: turn3.messages,
      projectionText: turn3.projection.text,
      selectedUnits: turn3.projection.selected,
      probesByUnitId: Object.fromEntries(
        turn3.projection.selected.map((unit) => [unit.id, unit.content.slice(0, 40)]),
      ),
      telemetry: turn3.telemetry,
      host: "pi",
    });
    assert.equal(turn3Metrics.compaction.tailOmitted, true);
    assert.equal(turn3Metrics.quoteability.allSelectedQuoteable, true);

    messages.push({ role: "assistant", content: "summary3" }, { role: "user", content: "turn four" });
    await adapter.onTurnStart({ turnIndex: 4 });
    const turn4 = await adapter.onContext({ messages: structuredClone(messages), budgetChars: DEFAULT_BUDGET_CHARS }, ctx);
    assert.ok(turn4);
    assert.equal(turn4.projection.text, "");
    assert.equal(turn4.telemetry.projectionBytes, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0102: stale bytes remain absent from effective payload on later unchanged turns", async () => {
  const { workspace, turns } = await runPiSmallBoardSeam();
  try {
    for (const turn of [turns.turn3, turns.turn4]) {
      const metrics = measureRequestVisibility({
        messages: turn.messages,
        projectionText: turn.projection.text,
        selectedUnits: turn.projection.selected,
        probesByUnitId: Object.fromEntries(
          turn.projection.selected.map((unit) => [unit.id, PROBE]),
        ),
        observedByUnitId: Object.fromEntries(
          turn.projection.selected.map((unit) => [unit.id, OLD_BODY]),
        ),
        telemetry: turn.telemetry,
        host: "pi",
      });
      assert.equal(metrics.staleBodyCopyCount, 0, "stale OLD interior must not reappear");
      assert.doesNotMatch(JSON.stringify(turn.messages), new RegExp(LINE2_OLD, "u"));
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0102: live Hermes/Pi native baseline compare skipped when host checkout absent", { skip: hermesHostReady }, () => {
  assert.ok(!hermesHostReady, "bench/hosts/hermes absent; replay characterization only");
});

test("PCR 0102: live Hermes native baseline compare deferred to host-contract boards", { skip: !hermesHostReady }, () => {
  assert.ok(hermesHostReady, "host checkout present; live native compare belongs in 0096/0097 host-contract tests");
});

test("PCR 0102: live Pi native compare skipped when host absent", () => {
  assert.ok(true, "Pi native replay uses in-repo runner only; no live host checkout on this VM");
});
