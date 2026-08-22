# PCR 0036 — budget-pressure adapter request prune

- Date (UTC): 2026-08-22
- Author / agent: repository maintainers
- Branch / PR: `cursor/pcr-0036-adapter-prune-f274`
- Commit: `9d046b2`
- Merge-base vs PCR 0035 squash (`7b02a1db`): `7b02a1dba0a2bb7536a4a4106eb31b540df9caff`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `budget-pressure-dev`; `adapter-prune`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

PCR 0035 showed hermes-fresh / pi-fresh refresh gold (stale-bytes 0, required-recall 1.000) but shipped the full tool transcript (~20k projection-bytes, constant +19696 vs region). The remaining hole was bytes, not freshness.

**Hypothesis verified:** under 4k budget, adapter request assembly drops read tool-call/result pairs that FreshCtx is not serving (untracked or omitted from the current projection), keeps gold read markers plus region projection, and passes capture `budgetChars` through to projection. hermes-fresh and pi-fresh match freshctx-region on stale-bytes (0) and required-recall (1.000) for all 6 cells; projection-bytes match region (0 delta). Path-agnostic: verified with non-`lab/filler/` paths (`src/unused.go`, `cmd/legacy.c`) in unit tests.

## What we did

- Added `adapters/request-prune.mjs` path-agnostic prune helpers (`dropUnservedReadToolPairs` keyed off projection selection, not fixture paths); wired Hermes (`bridge.mjs`) and Pi (`replay.mjs`, `extension.ts`).
- Trace runners pass capture `budgetChars` to adapter hooks.
- Added `bench/budget-pressure-adapter-prune.mjs` (`ctxbench:budget-pressure-adapter-prune`) and report [`bench/reports/budget-pressure-adapter-prune.md`](../../../bench/reports/budget-pressure-adapter-prune.md).
- Reused existing traces in `bench/traces/lab/budget-pressure-dev-v0.1/`; no holdout copy; gold unchanged.
- Did **not** edit `src/anchors.mjs`, holdout v0.1 traces/gold, `bench/repos.lock.json`, benchmark weights, or door state.
- Did **not** set `FRESHCTX_CAPTURE_OK` for quality claims on the adapter path.

## Host lock SHAs (unchanged)

| host | commit |
|---|---|
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` |
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` |

Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6`.  
`bench/repos.lock.json` blob unchanged (`79e29d09…` / sha256 `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **134/134** (+9 prune tests; host tests skip without checkout) |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run holdout:verify --pack=holdout-v0.1` | yes | 0 | `resultSetHash` null; trace-set hash unchanged |
| `npm run holdout:ci-guard` | yes | 0 | |
| `npm run ctxbench:budget-pressure-adapter-prune` | yes | 0 | freshness held; bytes dropped vs PCR 0035 |

## Freshness and bytes vs PCR 0035

| check | result |
|---|---|
| hermes-fresh stale-bytes vs region (6 cells) | all 0 / match |
| hermes-fresh required-recall vs region (6 cells) | all 1.000 / match |
| projection-bytes vs region (hermes-fresh, pi-fresh) | 0 delta all cells |
| projection-bytes vs PCR 0035 ~20k | dropped ~19696/cell → region size |

## Raw bake-off table (from report)

| baseline | repo | family | exact-current | stale | stale-bytes | required-recall | projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| freshctx-region | go-tools | append | 1.000 | 0.000 | 0 | 1.000 | 604 |
| hermes-native | go-tools | append | 0.000 | 0.000 | 0 | 1.000 | 4039 |
| hermes-fresh | go-tools | append | 1.000 | 0.000 | 0 | 1.000 | 604 |
| freshctx-region | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 164 |
| hermes-native | go-tools | delete | 0.000 | 0.200 | 66 | 1.000 | 3886 |
| hermes-fresh | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 164 |
| freshctx-region | go-tools | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 562 |
| hermes-native | go-tools | interior-edit | 0.000 | 0.200 | 137 | 0.000 | 3947 |
| hermes-fresh | go-tools | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 562 |
| freshctx-region | neovim | append | 1.000 | 0.000 | 0 | 1.000 | 1029 |
| hermes-native | neovim | append | 0.000 | 0.200 | 645 | 0.000 | 4467 |
| hermes-fresh | neovim | append | 1.000 | 0.000 | 0 | 1.000 | 1029 |
| freshctx-region | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 164 |
| hermes-native | neovim | delete | 0.000 | 0.200 | 69 | 1.000 | 3889 |
| hermes-fresh | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 164 |
| freshctx-region | neovim | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 872 |
| hermes-native | neovim | interior-edit | 0.000 | 0.200 | 444 | 0.000 | 4268 |
| hermes-fresh | neovim | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 872 |

`pi-fresh` matches hermes-fresh on all columns (see full report).

## Limitations

- Prune activates at budget ≤ 4k chars; drops read pairs FreshCtx is not serving in the current projection, not a general transcript compressor above that threshold.
- `hermes-native` replayed from PCR 0033 report when `bench/hosts/hermes` absent.
- Lab pack only; holdout v0.1 untouched; `resultSetHash` null.
- No door edit; no v0.2; no retune.

## Protocol gap?

**No.** Budget-pressure dev pack is intentionally outside holdout v0.1.

## Next measurement

Optional live `hermes-native` re-run when host checkout present; holdout adapter parity unchanged by this lab-only prune.
