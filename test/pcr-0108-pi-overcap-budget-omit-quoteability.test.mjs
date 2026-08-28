import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_BUDGET_CHARS,
  projectionCarriesQuoteableUnits,
  replaceBudgetOmittedReadQuoteability,
  shouldInlineBudgetOmittedReadAtToolResult,
} from "../adapters/request-prune.mjs";
import {
  buildReadToolCall,
  buildToolResultMessage,
  createPiAdapter,
  messageText,
} from "../adapters/pi/replay.mjs";
import {
  measureRequestVisibility,
  validateToolPairing,
} from "./helpers/native-harness-measure.mjs";

const REGION_PATH = "region_b.txt";
const LINE2_PROBE = "OVERCAP_LINE2_FRESH";
const PAD = "z".repeat(39_500);
const OVERCAP_BODY = `line1 header\n${LINE2_PROBE}\nline3 footer\n${PAD}\n`;

function toolResultFor(messages, callId) {
  return messages.find((message) =>
    (message.toolCallId ?? message.tool_call_id) === callId
    && (message.role === "tool" || message.role === "toolResult"),
  );
}

function toolResultText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

test("PCR 0108: shouldInlineBudgetOmittedReadAtToolResult gates turn-1 and empty content", () => {
  const unit = { id: "fc_over", path: REGION_PATH, content: OVERCAP_BODY };
  const envelopeOnly = `<freshctx turn="2" selected="0" unresolved="0" budget-omitted="1"></freshctx>`;
  assert.equal(projectionCarriesQuoteableUnits(envelopeOnly), false);
  assert.equal(
    shouldInlineBudgetOmittedReadAtToolResult({
      userCountMessages: [{ role: "user", content: "one" }],
      unit,
      projectionText: envelopeOnly,
    }),
    false,
  );
  assert.equal(
    shouldInlineBudgetOmittedReadAtToolResult({
      userCountMessages: [
        { role: "user", content: "one" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "two" },
      ],
      unit,
      projectionText: envelopeOnly,
    }),
    true,
  );
  assert.equal(
    shouldInlineBudgetOmittedReadAtToolResult({
      userCountMessages: [
        { role: "user", content: "one" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "two" },
      ],
      unit: { ...unit, content: "" },
      projectionText: envelopeOnly,
    }),
    false,
  );
});

test("PCR 0108: replaceBudgetOmittedReadQuoteability requires prior delivered budget omit", () => {
  const unit = { id: "fc_over", path: REGION_PATH, content: OVERCAP_BODY };
  const messages = [
    buildReadToolCall({ toolCallId: "call-over", path: REGION_PATH }),
    buildToolResultMessage({
      toolCallId: "call-over",
      content: `[freshctx:omitted-read path=${REGION_PATH}] Current content was omitted from the live projection for budget.`,
    }),
    { role: "user", content: "again" },
  ];
  const envelopeOnly = `<freshctx turn="2" selected="0" unresolved="0" budget-omitted="1"></freshctx>`;
  const laterUsers = [
    { role: "user", content: "one" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "two" },
  ];

  const withoutHistory = replaceBudgetOmittedReadQuoteability(messages, {
    unitForCallId: () => unit,
    projectionText: envelopeOnly,
    userCountMessages: laterUsers,
    historicalReadDispositionByCallId: new Map(),
    latestReadCallIds: new Set(["call-over"]),
  });
  assert.match(toolResultText(withoutHistory[1]), /freshctx:omitted-read/u);

  const withHistory = replaceBudgetOmittedReadQuoteability(messages, {
    unitForCallId: () => unit,
    projectionText: envelopeOnly,
    userCountMessages: laterUsers,
    historicalReadDispositionByCallId: new Map([
      ["call-over", { path: REGION_PATH, disposition: "budget" }],
    ]),
    latestReadCallIds: new Set(["call-over"]),
  });
  assert.match(toolResultText(withHistory[1]), new RegExp(LINE2_PROBE, "u"));
  assert.doesNotMatch(toolResultText(withHistory[1]), /freshctx:omitted-read/u);
  assert.equal(validateToolPairing(withHistory).valid, true);
});

test("PCR 0108: Pi over-cap unchanged later turns quote line 2 without reread", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0108-overcap-"));
  try {
    await writeFile(join(workspace, REGION_PATH), OVERCAP_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: DEFAULT_BUDGET_CHARS });
    const ctx = { cwd: workspace };
    const callId = "call-pi-0108-over";
    let persisted = [
      buildReadToolCall({ toolCallId: callId, path: REGION_PATH }),
      buildToolResultMessage({ toolCallId: callId, content: OVERCAP_BODY }),
      { role: "user", content: "quote line 2 exactly" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: callId,
        input: { path: REGION_PATH },
        content: OVERCAP_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext(
      { messages: structuredClone(persisted), budgetChars: DEFAULT_BUDGET_CHARS },
      ctx,
    );
    assert.ok(turn1);
    assert.equal(turn1.projection.selected.length, 0);
    assert.match(turn1.projection.text, /budget-omitted="1"/u);
    const turn1Read = toolResultFor(turn1.messages, callId);
    assert.match(toolResultText(turn1Read), /freshctx:omitted-read/u);
    assert.doesNotMatch(toolResultText(turn1Read), new RegExp(LINE2_PROBE, "u"));
    assert.doesNotMatch(turn1.projection.text, new RegExp(LINE2_PROBE, "u"));
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    for (const turnIndex of [2, 3, 4, 5]) {
      persisted = [
        ...structuredClone(persisted),
        { role: "assistant", content: "summary" },
        { role: "user", content: `turn ${turnIndex} quote line 2 raw bytes exactly` },
      ];
      await adapter.onTurnStart({ turnIndex: turnIndex - 1 });
      const turn = await adapter.onContext(
        { messages: structuredClone(persisted), budgetChars: DEFAULT_BUDGET_CHARS },
        ctx,
      );
      assert.ok(turn, `turn ${turnIndex}`);
      assert.equal(turn.projection.selected.length, 0, `turn ${turnIndex} selected`);
      assert.match(turn.projection.text, /budget-omitted="1"/u, `turn ${turnIndex} envelope`);
      assert.doesNotMatch(turn.projection.text, /<freshctx-unit/u, `turn ${turnIndex} no official body`);

      const readSlot = toolResultFor(turn.messages, callId);
      assert.match(toolResultText(readSlot), new RegExp(LINE2_PROBE, "u"), `turn ${turnIndex} read slot`);
      assert.doesNotMatch(toolResultText(readSlot), /freshctx:omitted-read/u, `turn ${turnIndex} no omit marker`);

      const metrics = measureRequestVisibility({
        messages: turn.messages,
        projectionText: turn.projection.text,
        selectedUnits: turn.projection.omitted.map((item) => item.unit),
        probesByUnitId: Object.fromEntries(
          turn.projection.omitted.map((item) => [item.unit.id, LINE2_PROBE]),
        ),
        telemetry: turn.telemetry,
        host: "pi",
      });
      assert.equal(metrics.quoteability.allSelectedQuoteable, true, `turn ${turnIndex} quoteable`);
      assert.equal(metrics.staleBodyCopyCount, 0, `turn ${turnIndex} no stale replay`);
      assert.equal(validateToolPairing(turn.messages).valid, true, `turn ${turnIndex} pairing`);

      await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn.messages) } });
    }

    assert.doesNotMatch(messageText(persisted.filter((m) => m.role === "assistant")), new RegExp(LINE2_PROBE, "u"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
