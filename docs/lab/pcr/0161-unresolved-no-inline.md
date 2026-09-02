# PCR 0161 — A budget-omitted read is never back-filled from an unresolved unit

- Date (UTC): 2026-09-02
- Author / agent: Cursor Cloud Agent (executing `plans/003-no-stale-inline-from-unresolved-unit.md`)
- Branch / PR: `grok/plan-003-no-stale-inline` / draft, stacked on `grok/plan-002-living-docs-derived`
- Commit: `92ca663` (fix) on top of plan base `fd523eb`
- Paper-manifest digest (if research work): unchanged (not research work)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- Result labels used: `synthetic`
- Decision: **accept** (invariant fix; no apex path change)

## Hypothesis or change

A budget-omitted read whose unit is unresolved on a later turn must render the
omitted marker, not last-known bytes.

## What we did

1. Reproduced the gap with a red test
   (`test/pcr-0161-unresolved-no-inline.test.mjs`): a bare unit with
   `state: "unresolved"` and non-empty `content`, two user turns, and an
   envelope-only projection. Before the fix
   `shouldInlineBudgetOmittedReadAtToolResult` returned `true` and
   `replaceBudgetOmittedReadQuoteability` replaced the `omitted-read` marker
   with `OLD BYTES`. Both tests failed (`# fail 2`).
2. Added one gate in `adapters/request-prune.mjs`
   `shouldInlineBudgetOmittedReadAtToolResult`, immediately after the
   user-count check: `if (unit?.state !== "resolved") return false;`. No other
   code change. `FreshRegistry.refresh()` still keeps `unit.content` in memory
   for exact recovery; it is simply never rendered as current from this path.
3. The two bare fixtures in
   `test/pcr-0108-pi-overcap-budget-omit-quoteability.test.mjs` (lines 47 and
   85) gained `state: "resolved"` so the PCR 0108 happy path still inlines.
   That is the single fixture-shape edit plan 003 step 3 allows; no assertion
   changed.
4. Wrote this record, appended INDEX / METRICS rows, and bumped the public PCR
   count to 157 in `README.md` and `docs/ARCHITECTURE.md`.
5. Did not touch `src/registry.mjs`, `adapters/pi/*`, `dropUnservedReadToolPairs`,
   `bench/packs/**`, `autoresearch/evaluate.mjs`, or `bench/empirical-verdict.mjs`.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0161-unresolved-no-inline.test.mjs` (before fix) | yes | 1 | `# tests 2` `# pass 0` `# fail 2` |
| `node --test test/pcr-0161-unresolved-no-inline.test.mjs` (after fix) | yes | 0 | `# tests 2` `# pass 2` `# fail 0` |
| `node --test test/pcr-0108-... test/adapter-request-prune.test.mjs test/pi-adapter.test.mjs test/pcr-0161-...` | yes | 0 | `# pass 21` `# fail 0` |
| `npm test` | yes | 0 | `# tests 722` `# pass 722` `# fail 0` `# skipped 0` (living suite on this stack: 715 base + 5 plan 002 + 2 here) |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; `payloadBytes.candidate` 8589, `baseline` 36701, `oracleRetention` 5/5; all hard gates pass |
| `npm run ctxbench` | no | n/a | run once at the top of the stack (`grok/plan-008a-ise-language-gate`) |
| `npm run demo` | no | n/a | not required by plan 003 |
| `npm run repos:verify` | no | n/a | not on this branch |
| `npm run ctxbench:smoke` | no | n/a | not on this branch |

## Metric snapshot

| metric | before (plan base) | after (this PCR) | delta |
|---|---|---|---|
| `npm run evaluate` verdict | PASS | PASS | none |
| `payloadBytes.candidate` (holdout-v0.3-apex) | 8589 | 8589 | 0 |
| `payloadBytes.baseline` (corvus-file) | 36701 | 36701 | 0 |
| required recall | 5/5 | 5/5 | 0 |
| unresolved unit inlined at read slot (synthetic fixture) | yes (`OLD BYTES` rendered) | no (marker preserved) | invariant now holds |
| door blob | `f8771c93…` | `f8771c93…` | 0 |

Label: `synthetic`. No apex path touched; the apex pack exercises official
reads whose units stay resolved.

## Comparison

No external comparison. Not a CORVUS claim, not a public-repo claim.

## Conflicts with constitutions

none observed. The change enforces `SOUL.md` "No stale injection" and
`AGENTS.md` "Never inject last-known content when current resolution fails".

## Limitations

The gate relies on `unit.state` being maintained by `FreshRegistry`; a caller
that hands the pass a unit-shaped object without `state` now gets the marker
rather than inlined bytes (fail closed). Only the Pi adapter calls this pass;
the Hermes bridge does not. `FreshRegistry.refresh()` still retains previous
`content` on unresolved units for recovery; a future type-level guarantee
(clearing `content` to `null`) would need its own invariant pass.

## Next measurement

Grep every `unit.content` use in `adapters/request-prune.mjs` on each change
and confirm each is behind a `state === "resolved"` gate or is a marker /
identity use.
