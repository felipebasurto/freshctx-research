import assert from "node:assert/strict";
import test from "node:test";

import {
  replaceBudgetOmittedReadQuoteability,
  shouldInlineBudgetOmittedReadAtToolResult,
} from "../adapters/request-prune.mjs";

const TWO_USERS = [
  { role: "user", content: "first" },
  { role: "assistant", content: "ok" },
  { role: "user", content: "second" },
];
const EMPTY_ENVELOPE = '<freshctx turn="2" selected="0" unresolved="1" budget-omitted="0"></freshctx>';

test("PCR 0161: an unresolved unit is never inlined at the read slot", () => {
  const stale = { id: "fc_x", path: "a.txt", state: "unresolved", content: "OLD BYTES\n" };
  assert.equal(
    shouldInlineBudgetOmittedReadAtToolResult({
      userCountMessages: TWO_USERS,
      unit: stale,
      projectionText: EMPTY_ENVELOPE,
    }),
    false,
  );
  const fresh = { ...stale, state: "resolved" };
  assert.equal(
    shouldInlineBudgetOmittedReadAtToolResult({
      userCountMessages: TWO_USERS,
      unit: fresh,
      projectionText: EMPTY_ENVELOPE,
    }),
    true,
  );
});

test("PCR 0161: replaceBudgetOmittedReadQuoteability leaves the omitted marker when the unit is unresolved", () => {
  const marker = "[freshctx:omitted-read path=a.txt] Current content was omitted from the live projection for budget.";
  const messages = [
    ...TWO_USERS.slice(0, 2),
    { role: "tool", tool_call_id: "call_1", content: marker },
    TWO_USERS[2],
  ];
  const unit = { id: "fc_x", path: "a.txt", state: "unresolved", content: "OLD BYTES\n" };
  const out = replaceBudgetOmittedReadQuoteability(messages, {
    unitForCallId: () => unit,
    projectionText: EMPTY_ENVELOPE,
    userCountMessages: messages,
    historicalReadDispositionByCallId: new Map([["call_1", { path: "a.txt", disposition: "budget" }]]),
    latestReadCallIds: new Set(["call_1"]),
  });
  assert.equal(out[2].content, marker);
  assert.equal(JSON.stringify(out).includes("OLD BYTES"), false);
});
