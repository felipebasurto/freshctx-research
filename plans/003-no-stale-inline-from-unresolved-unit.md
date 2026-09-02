# Plan 003: A budget-omitted read is never back-filled with last-known bytes once its unit is unresolved

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fd523eb..HEAD -- adapters/request-prune.mjs adapters/pi/replay.mjs adapters/pi/extension.ts src/registry.mjs test/pcr-0108-pi-overcap-budget-omit-quoteability.test.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `fd523eb`, 2026-09-02

## Why this matters

FreshCtx's first non-negotiable invariant (`SOUL.md` "No stale injection",
`AGENTS.md` "Never inject last-known content when current resolution fails") is
that a unit whose current bytes cannot be resolved is omitted and reported,
never rendered from its previous content. The PCR 0108 quoteability pass in
`adapters/request-prune.mjs` inlines `unit.content` into the latest read tool
result when a unit was budget-omitted on an earlier turn and the current tail
carries no quoteable body. It checks the *historical* disposition (`budget`)
and that `unit.content` is non-empty, but it never checks the unit's *current*
`state`. `FreshRegistry.refresh()` leaves the previous `content` in place when
it marks a unit `unresolved`. So the sequence "turn N: over-cap read →
budget-omitted; turn N+1: the file is deleted, renamed, or made ambiguous →
unresolved" produces a request whose tool result carries the turn-N bytes as if
they were current. This plan closes that gate with one condition and a
red-green test.

## Current state

- `adapters/request-prune.mjs` — request-copy transformation shared by the Pi
  and Hermes adapters.

```js
// lines 181-190
export function shouldInlineBudgetOmittedReadAtToolResult({
  userCountMessages = [],
  unit,
  projectionText,
}) {
  if (userMessageCount(userCountMessages) <= 1) return false;
  const current = String(unit?.content ?? "");
  if (current.length === 0) return false;
  return !projectionCarriesQuoteableUnits(projectionText);
}

// lines 192-223
export function replaceBudgetOmittedReadQuoteability(messages, {
  unitForCallId,
  projectionText,
  userCountMessages = messages,
  historicalReadDispositionByCallId = new Map(),
  latestReadCallIds,
} = {}) {
  const budgetHistorical = new Set();
  for (const [callId, item] of historicalReadDispositionByCallId.entries()) {
    if (item?.disposition === "budget") budgetHistorical.add(callId);
  }
  // ...
  return messages.map((message) => {
    const callId = toolResultCallId(message);
    if (!callId || !budgetHistorical.has(callId) || !latest.has(callId)) {
      return structuredClone(message);
    }
    const unit = unitForCallId(callId);
    if (!unit) return structuredClone(message);
    if (!shouldInlineBudgetOmittedReadAtToolResult({ userCountMessages, unit, projectionText })) {
      return structuredClone(message);
    }
    return withToolResultContent(message, String(unit.content ?? ""));
  });
}
```

  `toolResultCallId` (line 67) accepts `{ role: "tool", tool_call_id }` or
  `{ role: "toolResult", toolCallId }`. `withToolResultContent` (line 90)
  replaces a string content or a `[{type:"text"}]` array.

- `src/registry.mjs:320-324` — on failed refresh:

```js
      if (resolved.state !== "resolved") {
        unit.state = "unresolved";
        unit.resolutionMethod = resolved.method;
        results.push(unit);
        continue;
      }
```

  `unit.content` is **not** cleared here; that is intentional because the
  in-memory archive (`unit.versions`) and exact recovery rely on the object,
  and clearing it would change unrelated tests. Do not clear it.

- Callers of the quoteability pass: `adapters/pi/replay.mjs:409-418` and
  `adapters/pi/extension.ts:378-385` (both pass `unitForCallId` that returns
  the live registry unit, so `unit.state` is available). The Hermes bridge
  does not call this pass.

- Convention: adapter invariants are tested with `node:test` against the
  exported pure functions plus a replay through `createPiAdapter`. Exemplar:
  `test/pcr-0108-pi-overcap-budget-omit-quoteability.test.mjs` (first test,
  lines 46-70, builds a bare `unit` object and calls
  `shouldInlineBudgetOmittedReadAtToolResult` directly). New invariant tests
  are named `test/pcr-NNNN-<slug>.test.mjs` when they accompany a PCR;
  otherwise a descriptive name is fine. Because this fix is a behaviour change,
  `CONTRIBUTING.md` asks for a Public Change Record under `docs/lab/pcr/`
  using `docs/lab/TEMPLATE.md` and a row in `docs/lab/INDEX.md` and
  `docs/lab/METRICS.md`; see Step 4.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Grammars (once) | `npm run ise:install` | exit 0 |
| Target test | `node --test test/pcr-0161-unresolved-no-inline.test.mjs` | `# fail 0` after fix; `# fail 1` before |
| Regression | `node --test test/pcr-0108-pi-overcap-budget-omit-quoteability.test.mjs test/adapter-request-prune.test.mjs test/pi-adapter.test.mjs` | `# fail 0` |
| Full suite | `npm test` | `# fail 0` |
| Evaluate | `npm run evaluate` | `EVALUATE_VERDICT=PASS`; `payloadBytes.candidate` unchanged from before the fix |

## Scope

**In scope** (the only files you should create or modify):
- `adapters/request-prune.mjs` (the two functions excerpted above only)
- `test/pcr-0161-unresolved-no-inline.test.mjs` (create; use the next free PCR
  number if 0161 is taken — see STOP conditions)
- `docs/lab/pcr/0161-unresolved-no-inline.md` (create), `docs/lab/INDEX.md`,
  `docs/lab/METRICS.md` (append one row each), `README.md` and
  `docs/ARCHITECTURE.md` PCR count sentence (+1)

**Out of scope** (do NOT touch, even though they look related):
- `src/registry.mjs` — do not clear `unit.content` on unresolved; exact
  recovery and `versions` bookkeeping depend on the current object shape.
- `adapters/pi/extension.ts` and `adapters/pi/replay.mjs` — the fix lives in
  the shared function; callers need no change.
- `dropUnservedReadToolPairs` and the `omitted-read` marker text — separate
  behaviour, covered by PCR 0082/0083/0089 tests.

## Git workflow

- Branch: `cursor/no-stale-inline-unresolved`
- Commit 1 (red): `test: PCR 0161 unresolved unit must not inline last-known bytes`
- Commit 2 (green): `fix(adapters): gate budget-omit inlining on unit.state === "resolved"`
- Commit 3: `docs: PCR 0161 record`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the failing test

Create `test/pcr-0161-unresolved-no-inline.test.mjs`:

```js
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
```

**Verify**: `node --test test/pcr-0161-unresolved-no-inline.test.mjs` →
`# fail 1` (the first assertion of test 1 and test 2 fail because the current
code inlines `OLD BYTES`). If it passes before the fix, STOP: the premise is
wrong.

### Step 2: Gate on the current state

In `adapters/request-prune.mjs`, inside
`shouldInlineBudgetOmittedReadAtToolResult`, insert one line after the
user-count check:

```js
  if (userMessageCount(userCountMessages) <= 1) return false;
  if (unit?.state !== "resolved") return false;
  const current = String(unit?.content ?? "");
```

No other change. `unit.state` is set by `FreshRegistry` (`"resolved"` |
`"unresolved"`); bare test fixtures elsewhere in the suite that omit `state`
would now be treated as not-inlinable — Step 3 checks for that.

**Verify**: `node --test test/pcr-0161-unresolved-no-inline.test.mjs` → `# fail 0`.

### Step 3: Regression check the PCR 0108 happy path

`test/pcr-0108-pi-overcap-budget-omit-quoteability.test.mjs:46` builds
`const unit = { id: "fc_over", path: REGION_PATH, content: OVERCAP_BODY };`
with no `state`. Run:

`node --test test/pcr-0108-pi-overcap-budget-omit-quoteability.test.mjs`

- If it fails only because a bare fixture lacks `state`, add
  `state: "resolved"` to that fixture object (this is the one allowed edit to a
  test outside the new file; record it in the commit message).
- If it fails for any other reason, STOP.

Then `npm test` → `# fail 0`.

### Step 4: Record the change

1. Copy `docs/lab/TEMPLATE.md` to `docs/lab/pcr/0161-unresolved-no-inline.md`.
   Fill: hypothesis "a budget-omitted read whose unit is unresolved on a later
   turn must render the omitted marker, not last-known bytes"; what changed
   (one-line gate); benchmark table with real `npm test` count, `npm run check`,
   `npm run evaluate` verdict and `payloadBytes` (should be identical to the
   README table — this fix does not touch the apex pack path); label
   `synthetic`.
2. Append a row to `docs/lab/INDEX.md` following the existing column order
   (`| [0161](pcr/0161-unresolved-no-inline.md) | 2026-MM-DD | ... | `synthetic` | accept |`).
3. Append a row to `docs/lab/METRICS.md` in the matching ledger section
   (copy the shape of the previous synthetic row).
4. Bump the PCR count sentence in `README.md` and `docs/ARCHITECTURE.md` by one
   (search `Public Change Records`). If Plan 002 has landed, the count is
   derived and only the docs need the bump.

**Verify**: `node --test test/living-docs.test.mjs` → `# fail 0`.

## Test plan

- New: `test/pcr-0161-unresolved-no-inline.test.mjs` — two tests: pure gate
  (unresolved → false, resolved → true) and end-to-end pass over a message
  list (marker preserved, old bytes absent).
- Existing regression: PCR 0108 suite (inlining still happens for resolved
  units), `test/adapter-request-prune.test.mjs`, `test/pi-adapter.test.mjs`.
- `npm run evaluate` verdict and payload bytes unchanged.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test test/pcr-0161-unresolved-no-inline.test.mjs` → `# pass 2`, `# fail 0`
- [ ] `rg -n 'unit\?\.state !== "resolved"' adapters/request-prune.mjs` → exactly one match, inside `shouldInlineBudgetOmittedReadAtToolResult`
- [ ] `npm test` exits 0
- [ ] `npm run evaluate` prints `EVALUATE_VERDICT=PASS` with the same `payloadBytes.candidate` as `README.md`
- [ ] `docs/lab/pcr/0161-*.md` exists and INDEX/METRICS reference it
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The red test passes before the fix (behaviour already changed upstream).
- `docs/lab/pcr/0161-*` already exists — pick the next free number and rename
  the test/PCR consistently; if numbering is unclear, report.
- Any test other than the PCR 0108 fixture-shape case fails after Step 2.
- `npm run evaluate` payload bytes change (this fix must not touch the apex
  path; if it does, something else is wrong).

## Maintenance notes

- Any future "inline current bytes at the read slot" shortcut must gate on
  `unit.state === "resolved"`. Reviewers should grep for `unit.content` in
  `adapters/request-prune.mjs` and confirm each use is behind that gate or is
  a marker/identity use.
- Deferred: `FreshRegistry.refresh()` could also drop `content` to `null` on
  unresolved so the type system (rather than a gate) prevents this class of
  bug. That would change `renderUnit`/recovery assumptions and needs its own
  invariant-test pass; not part of this plan.
