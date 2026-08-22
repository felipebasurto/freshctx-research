# PCR 0038 — holdout v0.1 adapter bake-off after prune

- Date (UTC): 2026-08-22
- Author / agent: repository maintainers
- Branch / PR: `cursor/holdout-adapter-bakeoff-b25d`
- Commit: `0ea0d04`
- Merge-base vs PCR 0037 squash (`5efb5fd0`): `5efb5fd0375ab43e8e46313398a51c8ea632c3fe`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-holdout`; `holdout-adapter-bakeoff`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

PCR 0033–0037 validated adapter prune on six budget-pressure lab cells. Publishing needs the same story on the sealed 10-trace holdout v0.1 pack, not lab fillers.

**Hypothesis verified:** `hermes-fresh` (post-0037 always-on prune) matched `freshctx-region` on required-recall and stale-bytes for all 10 holdout cells with 0-byte projection delta. Hermes native stayed **native-no-op** on the holdout window (no compress; no Hermes quality claim). Native baselines remain stale or smaller where PCR 0032/0033 reported.

## What we did

- Added `bench/holdout-adapter-bakeoff.mjs` (`ctxbench:holdout-adapter-bakeoff`) and report [`bench/reports/holdout-adapter-bakeoff.md`](../../../bench/reports/holdout-adapter-bakeoff.md).
- Label: `holdout-adapter-bakeoff-dev-v0.1`; status candidate; `resultSetHash` null.
- Reused existing traces in `bench/traces/holdout/`; no holdout copy; gold unchanged.
- Baselines per cell: `freshctx-region`, `freshctx-file`, `hermes-fresh`, `hermes-native` (replayed from PCR 0032 native-holdout when host checkout absent), `pi-native`, `pi-fresh`.
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
| `npm test` | yes | 0 | **137/137** (+3 holdout bake-off tests; host tests skip without checkout) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run holdout:verify --pack=holdout-v0.1` | yes | 0 | `resultSetHash` null; trace-set hash unchanged |
| `npm run holdout:ci-guard` | yes | 0 | |
| `npm run ctxbench:holdout-adapter-bakeoff` | yes | 0 | hermes-fresh matched region; Hermes native-no-op |

## hermes-fresh vs freshctx-region (10 cells)

| check | result |
|---|---|
| stale-bytes match | yes — all 10 cells 0 delta |
| required-recall match | yes — all 10 cells |
| projection-bytes match | yes — 0 delta vs region on all cells |
| known holdout holes silently passed | no — native stale/recall gaps reproduced on delete/interior/append |

## Hermes native compression (holdout window)

All 10 cells: **native-no-op** (holdout assembled context below `should_compress`; metrics replayed from [`bench/reports/native-holdout.md`](../../../bench/reports/native-holdout.md) when `bench/hosts/hermes` absent). No Hermes quality number claimed.

## Raw bake-off table (from report)

| baseline | repo | family | exact-current | stale | stale-bytes | required-recall | projection-bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| freshctx-region | go-tools | append | 1.000 | 0.000 | 0 | 1.000 | 604 |
| hermes-fresh | go-tools | append | 1.000 | 0.000 | 0 | 1.000 | 604 |
| hermes-native | go-tools | append | 0.000 | 0.000 | 0 | 1.000 | 277 |
| pi-native | go-tools | append | 0.000 | 0.000 | 0 | 1.000 | 277 |
| freshctx-region | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 164 |
| hermes-fresh | go-tools | delete | 0.000 | 0.000 | 0 | 1.000 | 164 |
| hermes-native | go-tools | delete | 0.000 | 1.000 | 66 | 1.000 | 124 |
| freshctx-region | go-tools | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 562 |
| hermes-fresh | go-tools | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 562 |
| hermes-native | go-tools | interior-edit | 0.000 | 1.000 | 137 | 0.000 | 185 |
| freshctx-region | neovim | append | 1.000 | 0.000 | 0 | 1.000 | 1029 |
| hermes-fresh | neovim | append | 1.000 | 0.000 | 0 | 1.000 | 1029 |
| hermes-native | neovim | append | 0.000 | 1.000 | 645 | 0.000 | 705 |
| freshctx-region | neovim | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 872 |
| hermes-fresh | neovim | interior-edit | 1.000 | 0.000 | 0 | 1.000 | 872 |
| hermes-native | neovim | interior-edit | 0.000 | 1.000 | 444 | 0.000 | 506 |

Full 60-row table (including `freshctx-file`, `pi-fresh`, all families): see report.

## Limitations

- Publishable table only; not a SOTA or performance claim.
- `hermes-native` replayed from PCR 0032 report without live host checkout; live run preferred when `bench/hosts/hermes` present.
- Holdout window does not trigger Hermes compress; budget-pressure compress photo remains PCR 0033.
- `resultSetHash` null; holdout traces/gold untouched.

## Protocol gap?

**No.** Uses existing holdout v0.1 traces under candidate label; no seal state change.

## Next measurement

Live Hermes host re-run on holdout when checkout available; optional CORVUS column only if an honest runner already exists.
