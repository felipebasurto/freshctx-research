# PCR 0033 — budget-pressure native bake-off

- Date (UTC): 2026-08-22
- Author / agent: repository maintainers
- Branch / PR: `cursor/pcr-0033-budget-pressure-bakeoff-8ee7`
- Commit: (see final report HEAD)
- Merge-base vs PCR 0032 squash: `a62c9153c1c9892a480061e29b3d3125a7de1d45`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `budget-pressure-dev`; `native-host`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

PCR 0032 measured Hermes as `native-no-op` because the runner set `contextLength = max(32000, budgetChars*8)`, so `should_compress` never fired on holdout-sized traces. This pack is the first honest compress photo: holdout-derived gold with filler reads and `budgetChars=4000`, Hermes window derived from assembled tokens (`rough * 1.1`), live summarization via `FRESHCTX_CAPTURE_OK` + capture-provider stub.

**Hypothesis verified:** the inflated window was the blocker. All six Hermes cells reached **`compress`** mode (not merge-ready as a performance claim — still `review`).

## What we did

- Added lab pack `budget-pressure-dev-v0.1` under `bench/traces/lab/budget-pressure-dev-v0.1/` (6 cells: go-tools + neovim × append/interior-edit/delete).
- Locked `go-tools` / `neovim` bytes from holdout v0.1; language-agnostic gold unchanged; filler files are byte-only `.dat` blobs (no parsers).
- Fixed Hermes window for budget-pressure: `budgetPressure` flag → bridge sets `contextLength = max(256, rough_tokens * 1.1)` so assembled messages exceed the 50% threshold.
- Added `bench/native-budget-pressure.mjs` (`ctxbench:native-budget-pressure`) and report [`bench/reports/budget-pressure-native.md`](../../../bench/reports/budget-pressure-native.md).
- Did **not** edit `src/` resolver, holdout v0.1 traces/gold, `bench/repos.lock.json`, benchmark weights, or seal state.

## Host lock SHAs (unchanged)

| host | commit |
|---|---|
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` |
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` |

`bench/repos.lock.json` blob unchanged (`79e29d09…` / sha256 `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **120/120** (+6 budget-pressure tests; hermes tests skip without checkout) |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run holdout:verify --pack=holdout-v0.1` | yes | 0 | `resultSetHash` null; trace-set hash unchanged |
| `npm run holdout:ci-guard` | yes | 0 | |
| `npm run ctxbench:native-budget-pressure` | yes | 0 | all Hermes cells `compress` |

## Hermes mode summary

| repo | family | hermes-mode (final capture) |
|---|---|---|
| go-tools | append | **compress** |
| go-tools | delete | **compress** |
| go-tools | interior-edit | **compress** |
| neovim | append | **compress** |
| neovim | delete | **compress** |
| neovim | interior-edit | **compress** |

No cell remained `native-no-op`. Pack is **not fail-closed** on Hermes compression — still **draft / review** (lossy summarization recall vs region-grain FreshCtx not a merge gate).

## Raw bake-off table (from report)

### Per-cell metrics (final capture)

| baseline | repo | family | hermes-mode | exact-current | stale | stale-bytes | duplicate | required-recall | projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| freshctx-region | go-tools | append | n/a | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 604 |
| freshctx-file | go-tools | append | n/a | 0.000 | 0.000 | 0 | 0.0 | 0.000 | 164 |
| pi-native | go-tools | append | n/a | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 19053 |
| hermes-native | go-tools | append | compress | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 4039 |
| freshctx-region | go-tools | delete | n/a | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| freshctx-file | go-tools | delete | n/a | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| pi-native | go-tools | delete | n/a | 0.000 | 0.200 | 66 | 0.0 | 1.000 | 18900 |
| hermes-native | go-tools | delete | compress | 0.000 | 0.200 | 66 | 0.0 | 1.000 | 3886 |
| freshctx-region | go-tools | interior-edit | n/a | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 562 |
| freshctx-file | go-tools | interior-edit | n/a | 0.000 | 0.000 | 0 | 0.0 | 0.000 | 164 |
| pi-native | go-tools | interior-edit | n/a | 0.000 | 0.200 | 137 | 0.0 | 0.000 | 18961 |
| hermes-native | go-tools | interior-edit | compress | 0.000 | 0.200 | 137 | 0.0 | 0.000 | 3947 |
| freshctx-region | neovim | append | n/a | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 1029 |
| freshctx-file | neovim | append | n/a | 0.000 | 0.000 | 0 | 0.0 | 0.000 | 164 |
| pi-native | neovim | append | n/a | 0.000 | 0.200 | 645 | 0.0 | 0.000 | 19481 |
| hermes-native | neovim | append | compress | 0.000 | 0.200 | 645 | 0.0 | 0.000 | 4467 |
| freshctx-region | neovim | delete | n/a | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| freshctx-file | neovim | delete | n/a | 0.000 | 0.000 | 0 | 0.0 | 1.000 | 164 |
| pi-native | neovim | delete | n/a | 0.000 | 0.200 | 69 | 0.0 | 1.000 | 18903 |
| hermes-native | neovim | delete | compress | 0.000 | 0.200 | 69 | 0.0 | 1.000 | 3889 |
| freshctx-region | neovim | interior-edit | n/a | 1.000 | 0.000 | 0 | 0.0 | 1.000 | 872 |
| freshctx-file | neovim | interior-edit | n/a | 0.000 | 0.000 | 0 | 0.0 | 0.000 | 164 |
| pi-native | neovim | interior-edit | n/a | 0.000 | 0.200 | 444 | 0.0 | 0.000 | 19282 |
| hermes-native | neovim | interior-edit | compress | 0.000 | 0.200 | 444 | 0.0 | 0.000 | 4268 |

### Delta vs `freshctx-region`

| repo | family | baseline | hermes-mode | recall | exact-current | stale | stale-bytes | projection-bytes | delta-bytes vs region |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| go-tools | append | freshctx-region | n/a | 1.000 | 1.000 | 0.000 | 0 | 604 | 0 |
| go-tools | append | pi-native | n/a | 1.000 | 0.000 | 0.000 | 0 | 19053 | 18449 |
| go-tools | append | hermes-native | compress | 1.000 | 0.000 | 0.000 | 0 | 4039 | 3435 |
| go-tools | delete | freshctx-region | n/a | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| go-tools | delete | pi-native | n/a | 1.000 | 0.000 | 0.200 | 66 | 18900 | 18736 |
| go-tools | delete | hermes-native | compress | 1.000 | 0.000 | 0.200 | 66 | 3886 | 3722 |
| go-tools | interior-edit | freshctx-region | n/a | 1.000 | 1.000 | 0.000 | 0 | 562 | 0 |
| go-tools | interior-edit | pi-native | n/a | 0.000 | 0.000 | 0.200 | 137 | 18961 | 18399 |
| go-tools | interior-edit | hermes-native | compress | 0.000 | 0.000 | 0.200 | 137 | 3947 | 3385 |
| neovim | append | freshctx-region | n/a | 1.000 | 1.000 | 0.000 | 0 | 1029 | 0 |
| neovim | append | pi-native | n/a | 0.000 | 0.000 | 0.200 | 645 | 19481 | 18452 |
| neovim | append | hermes-native | compress | 0.000 | 0.000 | 0.200 | 645 | 4467 | 3438 |
| neovim | delete | freshctx-region | n/a | 1.000 | 0.000 | 0.000 | 0 | 164 | 0 |
| neovim | delete | pi-native | n/a | 1.000 | 0.000 | 0.200 | 69 | 18903 | 18739 |
| neovim | delete | hermes-native | compress | 1.000 | 0.000 | 0.200 | 69 | 3889 | 3725 |
| neovim | interior-edit | freshctx-region | n/a | 1.000 | 1.000 | 0.000 | 0 | 872 | 0 |
| neovim | interior-edit | pi-native | n/a | 0.000 | 0.000 | 0.200 | 444 | 19282 | 18410 |
| neovim | interior-edit | hermes-native | compress | 0.000 | 0.000 | 0.200 | 444 | 4268 | 3396 |

FreshCtx region-grain keeps required recall on gold units under budget; pi-native ships full filler history (~19k bytes); Hermes compresses to ~4k bytes but loses exact-current (summarization stub).

## Limitations

- Capture stub returns `FRESHCTX_CAPTURE_OK` — not real summarization quality.
- Filler reads inflate pi-native payloads; not a fair byte comparison without pi-side pruning.
- Lab pack only; holdout v0.1 untouched; `resultSetHash` null.
- Host checkouts gitignored; Hermes compress tests skip when `bench/hosts/hermes` absent.

## Protocol gap?

**No.** Budget-pressure dev pack is intentionally outside holdout v0.1.

## Next measurement

Compare Hermes compress recall under real auxiliary-model summarization vs FreshCtx region projection on held-out budget-pressure cells; add adapter columns optional bake-off.
