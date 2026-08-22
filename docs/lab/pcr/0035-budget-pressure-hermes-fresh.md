# PCR 0035 — budget-pressure Hermes FreshCtx adapter

- Date (UTC): 2026-08-22
- Author / agent: repository maintainers
- Branch / PR: `cursor/pcr-0035-hermes-fresh-826e`
- Commit: `a8c5a74`
- Merge-base vs PCR 0033 squash: `fa6e2011d08b2f5f0ace283d866c0ea6a416b8af`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `budget-pressure-dev`; `hermes-fresh`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

PCR 0034 live DeepSeek compress kept stale gold because summarization does not re-read the file. This pack is the first photo of FreshCtx region on the Hermes **request path** (adapter / `hermes-fresh`), on the same six `budget-pressure-dev-v0.1` cells from PCR 0033.

**Hypothesis verified:** `hermes-fresh` matched `freshctx-region` on required-recall (1.000 on all 6 cells) and stale-bytes (0 on all 6 cells). Native Hermes (`hermes-native`, replayed from PCR 0033) remains stale on delete/interior/neovim-append as expected.

## What we did

- Added `bench/budget-pressure-hermes-fresh.mjs` (`ctxbench:budget-pressure-hermes-fresh`) and report [`bench/reports/budget-pressure-hermes-fresh.md`](../../../bench/reports/budget-pressure-hermes-fresh.md).
- Reused existing traces in `bench/traces/lab/budget-pressure-dev-v0.1/`; no holdout copy; gold unchanged.
- Baselines per cell: `freshctx-region` (control), `hermes-native` (replayed from PCR 0033 when host checkout absent), `hermes-fresh` (Hermes adapter / FreshCtx region grain), optional `pi-fresh`.
- Did **not** edit `src/` resolver, holdout v0.1 traces/gold, `bench/repos.lock.json`, benchmark weights, or door state.
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
| `npm test` | yes | 0 | **125/125** (+5 hermes-fresh tests; hermes-host tests skip without checkout) |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run holdout:verify --pack=holdout-v0.1` | yes | 0 | `resultSetHash` null; trace-set hash unchanged |
| `npm run holdout:ci-guard` | yes | 0 | |
| `npm run ctxbench:budget-pressure-hermes-fresh` | yes | 0 | hermes-fresh matched region on stale/recall |

## hermes-fresh vs freshctx-region

| repo | family | region recall | hermes-fresh recall | region stale-bytes | hermes-fresh stale-bytes | match |
|---|---|---|---|---|---|---|
| go-tools | append | 1.000 | 1.000 | 0 | 0 | yes |
| go-tools | delete | 1.000 | 1.000 | 0 | 0 | yes |
| go-tools | interior-edit | 1.000 | 1.000 | 0 | 0 | yes |
| neovim | append | 1.000 | 1.000 | 0 | 0 | yes |
| neovim | delete | 1.000 | 1.000 | 0 | 0 | yes |
| neovim | interior-edit | 1.000 | 1.000 | 0 | 0 | yes |

**Finding:** adapter path preserves gold recall and freshness under budget pressure; native Hermes compression does not.

## Raw bake-off table (from report)

| baseline | repo | family | exact-current | stale | stale-bytes | required-recall | projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| freshctx-region | go-tools | append | 1.000 | 0.000 | 0 | 1.000 | 604 |
| hermes-native | go-tools | append | 0.000 | 0.000 | 0 | 1.000 | 4039 |
| hermes-fresh | go-tools | append | 0.200 | 0.000 | 0 | 1.000 | 20300 |
| freshctx-region | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 164 |
| hermes-native | go-tools | delete | 0.000 | 0.200 | 66 | 1.000 | 3886 |
| hermes-fresh | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 19860 |
| freshctx-region | go-tools | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 562 |
| hermes-native | go-tools | interior-edit | 0.000 | 0.200 | 137 | 0.000 | 3947 |
| hermes-fresh | go-tools | interior-edit | 0.200 | 0.000 | 0 | 1.000 | 20258 |
| freshctx-region | neovim | append | 1.000 | 0.000 | 0 | 1.000 | 1029 |
| hermes-native | neovim | append | 0.000 | 0.200 | 645 | 0.000 | 4467 |
| hermes-fresh | neovim | append | 0.200 | 0.000 | 0 | 1.000 | 20725 |
| freshctx-region | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 164 |
| hermes-native | neovim | delete | 0.000 | 0.200 | 69 | 1.000 | 3889 |
| hermes-fresh | neovim | delete | 0.000 | 0.000 | 0 | 1.000 | 19860 |
| freshctx-region | neovim | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 872 |
| hermes-native | neovim | interior-edit | 0.000 | 0.200 | 444 | 0.000 | 4268 |
| hermes-fresh | neovim | interior-edit | 0.200 | 0.000 | 0 | 1.000 | 20568 |

`hermes-fresh` / `pi-fresh` projection-bytes include full tool history plus FreshCtx projection (~20k from filler reads); not byte-comparable to region-only core projection without adapter-side pruning.

## Limitations

- Adapter path ships full Hermes tool transcript + projection; byte budget not yet pruned to region-only size.
- `hermes-native` replayed from PCR 0033 report when `bench/hosts/hermes` absent; live run preferred when checkout available.
- Lab pack only; holdout v0.1 untouched; `resultSetHash` null.
- No door edit; no v0.2; no retune.

## Protocol gap?

**No.** Budget-pressure dev pack is intentionally outside holdout v0.1.

## Next measurement

Prune adapter request assembly under budget (drop filler tool bodies, keep markers + projection) and re-measure projection-bytes vs region; optional live `hermes-native` re-run when host checkout present.
