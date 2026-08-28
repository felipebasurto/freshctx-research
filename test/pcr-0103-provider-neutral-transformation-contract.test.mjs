import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  createPiAdapter,
  messageText as piMessageText,
} from "../adapters/pi/replay.mjs";
import {
  currentProjectionMarker,
  projectionCarriesQuoteableUnits,
  replaceTrackedReadToolResults,
  resolveProjectionText,
  servedReadToolResultContent,
  shouldInlineSelectedReadAtToolResult,
} from "../adapters/request-prune.mjs";
import { stableReadMarker } from "../src/transcript.mjs";
import {
  measureRequestVisibility,
  validateToolPairing,
} from "./helpers/native-harness-measure.mjs";

const REGION_PATH = "ws/sample.txt";
const OLD_BODY = "line1 header\nline2 OLD interior\nline3 footer\n";
const NEW_BODY = "line1 header\nline2 NEW interior\nline3 footer\n";
const LINE2_NEW = "line2 NEW interior";
const LINE3_FOOTER = "line3 footer";

function piTurn1Persisted(callId = "call-pi-0103") {
  return [
    buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
    buildToolResultMessage({ toolCallId: callId, content: OLD_BODY }),
    { role: "user", content: "quote line 2 exactly" },
  ];
}

test("PCR 0103: projectionCarriesQuoteableUnits rejects collapsed stub and empty tail", () => {
  const contentBytes = Buffer.byteLength(NEW_BODY, "utf8");
  const full = `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="${contentBytes}">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`;
  assert.equal(projectionCarriesQuoteableUnits(full), true);
  assert.equal(projectionCarriesQuoteableUnits(currentProjectionMarker({ unitCount: 1 })), false);
  assert.equal(projectionCarriesQuoteableUnits(""), false);
});

test("PCR 0103: shouldInlineSelectedReadAtToolResult inlines when tail omits quoteable bytes", () => {
  const unit = { id: "fc_test", path: REGION_PATH, content: NEW_BODY };
  const selectedUnitIds = new Set(["fc_test"]);
  const collapsed = currentProjectionMarker({ unitCount: 1 });

  assert.equal(
    shouldInlineSelectedReadAtToolResult({
      unit,
      observedContent: OLD_BODY,
      projectionText: collapsed,
      selectedUnitIds,
      turn2FirstNewGate: false,
    }),
    true,
  );
  assert.equal(
    shouldInlineSelectedReadAtToolResult({
      unit,
      observedContent: OLD_BODY,
      projectionText: "",
      selectedUnitIds,
      turn2FirstNewGate: false,
    }),
    true,
  );
  assert.equal(
    shouldInlineSelectedReadAtToolResult({
      unit,
      observedContent: OLD_BODY,
      projectionText: `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="${Buffer.byteLength(NEW_BODY, "utf8")}">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`,
      selectedUnitIds,
      turn2FirstNewGate: false,
    }),
    false,
  );
});

test("PCR 0103: servedReadToolResultContent never injects when unit content is empty", () => {
  const unit = { id: "fc_test", path: REGION_PATH, content: "" };
  assert.equal(
    servedReadToolResultContent({
      unit,
      observedContent: OLD_BODY,
      inlineSelectedRead: true,
      selectedUnitIds: new Set(["fc_test"]),
    }),
    stableReadMarker(unit),
  );
});

test("PCR 0103: replaceTrackedReadToolResults preserves role, call ID, and pairing", () => {
  const unit = { id: "fc_test", path: REGION_PATH, content: NEW_BODY };
  const messages = [
    buildReadToolCall({ toolCallId: "paired-read", path: REGION_PATH }),
    buildToolResultMessage({ toolCallId: "paired-read", content: OLD_BODY }),
    { role: "user", content: "again" },
  ];
  const rewritten = replaceTrackedReadToolResults(messages, {
    unitForCallId: (callId) => (callId === "paired-read" ? unit : undefined),
    projection: { selected: [unit], omitted: [] },
    skipEligibleSelections: 1,
    projectionText: "",
    lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
  });
  const tool = rewritten.find((message) => message.role === "tool");
  assert.equal(tool?.toolCallId, "paired-read");
  assert.match(String(tool?.content ?? ""), /line2 NEW interior/u);
  assert.equal(validateToolPairing(rewritten).valid, true);
});

test("PCR 0103: acceptance — later unchanged turn quotes line never in prior assistant replies", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0103-acceptance-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0103",
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(piTurn1Persisted()) }, ctx);
    assert.ok(turn1);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2Persisted = [
      ...structuredClone(piTurn1Persisted()),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
    assert.ok(turn2);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn2.messages) } });

    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: "quote line 2 again unchanged disk" },
    ];
    await adapter.onTurnStart({ turnIndex: 3 });
    const turn3 = await adapter.onContext({ messages: structuredClone(turn3Persisted) }, ctx);
    assert.ok(turn3);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn3.messages) } });

    const turn4Persisted = [
      ...structuredClone(turn3Persisted),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: `quote this exact footer line raw: ${LINE3_FOOTER}` },
    ];
    await adapter.onTurnStart({ turnIndex: 4 });
    const turn4 = await adapter.onContext({ messages: structuredClone(turn4Persisted) }, ctx);
    assert.ok(turn4);
    assert.equal(turn4.projection.text, "");
    assert.doesNotMatch(piMessageText(turn4.messages), /line2 OLD interior/u);

    const metrics = measureRequestVisibility({
      messages: turn4.messages,
      projectionText: turn4.projection.text,
      selectedUnits: turn4.projection.selected,
      probesByUnitId: Object.fromEntries(
        turn4.projection.selected.map((unit) => [unit.id, LINE3_FOOTER]),
      ),
      observedByUnitId: Object.fromEntries(
        turn4.projection.selected.map((unit) => [unit.id, OLD_BODY]),
      ),
      telemetry: turn4.telemetry,
      host: "pi",
    });
    assert.equal(metrics.quoteability.allSelectedQuoteable, true);
    assert.equal(metrics.staleBodyCopyCount, 0);
    assert.match(piMessageText(turn4.messages), new RegExp(LINE3_FOOTER, "u"));
    assert.doesNotMatch(
      JSON.stringify(turn4Persisted.filter((message) => message.role === "assistant")),
      new RegExp(LINE3_FOOTER, "u"),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0103: resolveProjectionText collapses unchanged later turns to an empty tail", () => {
  const projection = {
    selected: [{ id: "fc_test", revision: "sha256:abc", path: REGION_PATH, content: NEW_BODY }],
    omitted: [],
    text: `<freshctx turn="3">${NEW_BODY}</freshctx>`,
  };
  const laterMessages = [
    { role: "user", content: "task" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "again" },
  ];
  assert.equal(
    resolveProjectionText({
      messages: laterMessages,
      projection,
      skipEligibleSelections: 1,
    }),
    "",
  );
});
