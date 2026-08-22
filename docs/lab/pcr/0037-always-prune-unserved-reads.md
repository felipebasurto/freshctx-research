# PCR 0037 — always prune unserved read pairs on projection

- Date (UTC): 2026-08-22
- Author / agent: repository maintainers
- Branch / PR: `cursor/pcr-0037-drop-unserved-reads-e838`
- Commit: `b469759c4c90cf7388c2edda524e3791e63e8625`
- Merge-base vs PCR 0036 squash (`bfb9bb20`): `bfb9bb20d6aaeb378c0b4052942792288a75f357`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `budget-pressure-dev`; `adapter-prune`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

PCR 0036 dropped unserved read tool-call/result pairs path-agnostically but only when `budgetChars <= 4000`. Real Hermes/Pi sessions at 8k–24k still shipped unserved read bodies in the transcript.

**Hypothesis verified:** whenever FreshCtx assembles a projection, adapter request assembly drops read pairs that are untracked or budget-omitted from `projection.selected`, keeps gold/served markers (including unresolved tracked reads) plus region projection. The 4k gate is removed. hermes-fresh and pi-fresh still match freshctx-region on stale-bytes (0) and required-recall (1.000) for all 6 budget-pressure cells; projection-bytes match region (0 delta). Unit tests at 12k drop budget-omitted unserved normal-path reads and keep gold.

## What we did

- Removed `BUDGET_PRUNE_CHARS_THRESHOLD` / `shouldPruneAdapterRequest` gate from `adapters/request-prune.mjs`.
- Hermes (`bridge.mjs`) and Pi (`replay.mjs`, `extension.ts`) always call `dropUnservedReadToolPairs` after projection.
- `servedReadCallIds*` treats `projection.selected` plus unresolved tracked units as served (marker kept; holdout parity preserved).
- Replaced PCR 0036 “keep unserved transcript above 4k” Pi test with Hermes/Pi 12k drop tests (budget-omitted filler).
- Re-ran `ctxbench:budget-pressure-adapter-prune` on existing 6 cells; report updated.
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
| `npm test` | yes | 0 | **134/134** (112 pass + 22 host skip); 12k drop tests added |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run holdout:verify --pack=holdout-v0.1` | yes | 0 | `resultSetHash` null; trace-set hash unchanged |
| `npm run holdout:ci-guard` | yes | 0 | |
| `npm run ctxbench:budget-pressure-adapter-prune` | yes | 0 | freshness held; bytes match region on 6 cells |

## Freshness and bytes vs PCR 0036

| check | result |
|---|---|
| 4k gate removed (`shouldPruneAdapterRequest`) | yes — gone from adapters |
| 12k drops budget-omitted unserved normal-path read | yes — Hermes + Pi unit tests |
| hermes-fresh stale-bytes vs region (6 cells) | all 0 / match |
| hermes-fresh required-recall vs region (6 cells) | all 1.000 / match |
| projection-bytes vs region (hermes-fresh, pi-fresh) | 0 delta all cells |
| holdout adapter parity | pass (unresolved markers kept) |

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

- Prune drops untracked reads and budget-omitted tracked reads; unresolved tracked reads keep markers only.
- Budget-pressure lab pack uses 4k trace budgets; always-on prune is verified at 12k via unit tests, not yet on live 24k host sessions.
- Lab pack only; holdout v0.1 untouched; `resultSetHash` null.
- No door edit; no v0.2; no retune.

## Protocol gap?

**No.** Budget-pressure dev pack is intentionally outside holdout v0.1.

## Next measurement

Live Hermes/Pi session at default 24k budget with mixed served/unserved reads; confirm transcript bytes drop without recall regression.
