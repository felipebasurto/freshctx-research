# PCR 0114 — File/region Isolated Semantic Engine refresh for Python, JavaScript, and TypeScript

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/file-region-Isolated Semantic Engine-fd3b` (draft PR #109)
- Base SHA: `15c573e74f7dd84ab36f2a63bd49b53cfc61b19e` (PCR 0113 squash)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `replay`; `adapter-only`; `measurement`
- Decision: **review**

## Hypothesis or change

PCR 0112 injected `Isolated Semantic EngineRunner` into Pi/Hermes adapters but `engine.refresh` only
called Tree-sitter when `scope === "symbol"`.
Normal whole-file Pi/Hermes reads on `.py`/`.js`/`.ts` never reached `parseSource`.
PCR 0113 added the three-arm Pi TypeScript measure harness (`nothing` /
`freshctx-no-ts` / `freshctx-ts`) with `FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off` for arm B.
This PCR routes file-scope and region refresh through the injected Isolated Semantic Engine on
Tree-sitter languages when a runner is present.
Region grain matches by `selector` and relocates the named unit.
Arm B stays `Isolated Semantic EngineRunner: null` via the existing harness knob, not a new host
flag.

## What we did

1. Extended `src/registry.mjs` refresh for `.py`/`.js`/`.mjs`/`.cjs`/`.ts`/`.tsx`
   when `Isolated Semantic EngineRunner` is injected.
2. File scope calls the Isolated Semantic Engine and resolves with `resolutionMethod: "Isolated Semantic Engine"`
   when parse is not broken (including unit-less parses).
3. Region scope calls the Isolated Semantic Engine, matches units by `selector`/`qualifiedSelector`,
   and relocates the named unit to its current span.
   No selector match falls through to anchors.
   `stored-line-span` still applies only when the Isolated Semantic Engine path did not fail on
   `parse-broken`.
4. Fail closed on missing runner, spawn error, or `parse-broken`.
   Ambiguous or unit-less file parses still resolve whole-file via Isolated Semantic Engine gate.
5. Added `test/pcr-0114-file-region-ise-refresh.test.mjs` (7 tests).
6. Relaxed Pi/Hermes smoke parity checks to compare recall instead of projection
   bytes when Isolated Semantic Engine resolution labels differ from core-only refresh.
7. Reused PCR 0113 `FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off` in `adapters/pi/extension.ts`.
   Did not edit door, lock, holdout gold, weights, or thresholds.

## Reviewer no-merge (`9386700` vs `15c573e7`)

Hole — region refresh matched only stored `startLine`/`endLine`.
A different unit occupying the old span was accepted and anchors never ran.
Fix — region Isolated Semantic Engine match uses `selector`/`qualifiedSelector` like symbol grain.
Relocate follows the named unit when the span moves.
`parse-broken` on an injected Isolated Semantic Engine region skips `stored-line-span` rescue.
Tests pin relocation when `beta` occupies `alpha`'s old lines and parse-broken
fail-closed vs null-runner legacy resolve.

## Benchmarks run

Canonical TAP from this post-review run on branch HEAD (base `15c573e`).

```
1..419
# tests 419
# suites 0
# pass 393
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

Official accepted TAP on merge-base `4e4a930` remains **388 pass / 0 fail /
17 skipped / 405 total** until Bench prints `15c573e7`, then again after squash.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above |
| `npm run check` | yes | 0 | includes registry + Isolated Semantic Engine paths |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Metric snapshot

| metric | base `15c573e` | PCR 0114 (this run) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` (hold) | `697e74e3…` (hold) | `0` |
| `npm test` TAP `# tests` | 412 | **419** | **+7** |
| `npm test` TAP `# pass` | 386 | **393** | **+7** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

## Comparison

No Level 4 sentence.
Synthetic adapter replay only.
Measured: Pi file-scope `.ts` refresh with default Isolated Semantic Engine yields
`resolutionMethod: "Isolated Semantic Engine"` without host `scope=symbol`.
Measured: same read with `Isolated Semantic EngineRunner: null` stays `whole-file`.
Measured: Python region refresh by `selector` relocates when another unit
occupies the old line span.
Measured: parse-broken region with injected Isolated Semantic Engine stays unresolved while
null-runner legacy refresh still resolves.

## Conflicts with constitutions

none observed.

## Limitations

Region reads without `selector` still use anchors only after the Isolated Semantic Engine gate.
Live Pi three-arm rerun on Mac is still pending after this lands.
Hermes extension does not yet read `FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off` (Pi harness only).

## Recommended next experiment

Rerun PCR 0113 three-arm battery on Mac.
Compare arm `freshctx-ts` `resolution=Isolated Semantic Engine` vs arm `freshctx-no-ts`
`resolution=whole-file` on the same whole-file prompts.
