# PCR 0075 — holdout adapter bake-off WITH vs WITHOUT (Hermes + Pi)

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0075-holdout-adapter-bakeoff-6a3c` (draft PR)
- Commit: (this docs commit)
- Main HEAD measured: `8cd3abed807867f540dcf4f919b81f3ad8bec3c5` (PCR 0074 squash)
- Merge-base: `8cd3abed807867f540dcf4f919b81f3ad8bec3c5` (main @ PCR 0074)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `pi-fresh`; `measurement`; `holdout-adapter-bakeoff`
- Decision: **review** (docs-only benchmark ledger; no product change)

## Scoreboard (holdout v0.1, 10 cells)

| | Hermes + FreshCtx | Hermes nativo | Pi + FreshCtx | Pi nativo |
|---|---|---|---|---|
| Texto viejo (N/10) | **0/10** | **5/10** | **0/10** | **5/10** |
| Recuerda (N/10) | **10/10** | **7/10** | **10/10** | **7/10** |

**Reading:** FreshCtx adapters (`hermes-fresh`, `pi-fresh`) matched `freshctx-region` on
every cell — zero stale bytes, full required-recall, 0-byte projection delta. Native hosts
(without FreshCtx) still serve old text on **5/10** cells and miss required gold on **3/10**
(delete and interior-edit families from PCR 0072; plus neovim append).

Hermes native stayed **native-no-op** (holdout window below compress threshold; no Hermes
quality claim).

Not a paper result. Not SOTA. Gold language-agnostic only.

## Hypothesis or change

PCR 0073 landed Pi offset/limit Hermes-parity on main through PCR 0074. This PCR re-runs
the sealed holdout v0.1 adapter bake-off at `8cd3abed` so the Pi column uses the 0073
mapper — and publishes a clean **WITH vs WITHOUT** scoreboard for Felipe.

**Expected score hold confirmed:** `AUTORESEARCH_SCORE=89.107165`, ctxbench payload
`697e74e3…`, door blob `f8771c93…`, lock blob `79e29d09…` — all unchanged.

Did **not** edit `src/anchors.mjs`, Hermes adapter, Pi mapper, holdout traces/gold,
`bench/repos.lock.json`, or benchmark score weights.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## What we did

- Re-ran `npm test`, `npm run evaluate`, and `npm run ctxbench:holdout-adapter-bakeoff`
  on main @ `8cd3abed`.
- Skipped `npm run ctxbench:holdout` — `bench/repos/` absent on this VM (honest skip,
  no fetch/relock).
- Cross-checked pi-fresh at pre-0073 main (`e5576db`, PCR 0072): **identical** stale /
  recall / projection-bytes on all 10 cells. Holdout sealed traces do not exercise
  offset/limit reads; PCR 0073 mapper does not change holdout bake-off numbers. The
  0073 story remains live-in-replay (PCR 0074), not holdout v0.1.
- Added this PCR and updated `docs/lab/INDEX.md` / `docs/lab/METRICS.md` only.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **210 pass**, **22 skip**, **0 fail** (232 total) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3…` confirmed |
| `npm run ctxbench:holdout-adapter-bakeoff` | yes | 0 | hermes-fresh + pi-fresh matched region (10/10) |
| `npm run ctxbench:holdout` | **no** | — | skipped: `bench/repos/` not present |

## Metric snapshot

| metric | before (0074 ledger) | after (main @ 0075) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| npm test pass | 210/210 runnable | 210/210 runnable | 0 |
| npm test skip | 22 | 22 | 0 |
| npm test fail | 0 | 0 | 0 |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `79e29d09…` | `79e29d09…` | 0 |
| holdout hermes-fresh vs region | 10/10 match | 10/10 match | 0 |
| holdout pi-fresh vs region | 10/10 match | 10/10 match | 0 |
| holdout pi-fresh vs e5576db | — | 0 delta all cells | 0 |

## Families stale without FreshCtx (native only)

Same gaps as PCR 0072 @ `e5576db`:

| family | repos affected | native stale | native recall miss |
|---|---|---|---|
| delete | go-tools, neovim | yes (66 / 69 stale-bytes) | no — recall held |
| interior-edit | go-tools, neovim | yes (137 / 444 stale-bytes) | yes — recall 0 |
| append | neovim only | yes (645 stale-bytes) | yes — recall 0 |

Append / duplicate-boundary / move-in-file on go-tools and duplicate-boundary /
move-in-file on neovim: native stays fresh on stale-bytes (recall held).

## Holdout adapter bake-off (10 cells × 5 baselines)

Per cell: `stale / required-recall / projection-bytes`.

| repo | family | freshctx-region | hermes-fresh | hermes-native | pi-fresh | pi-native |
|---|---|---|---|---|---|---|
| go-tools | append | 0 / 1.000 / 604 | 0 / 1.000 / 604 | 0 / 1.000 / 277 | 0 / 1.000 / 604 | 0 / 1.000 / 277 |
| go-tools | delete | 0 / 1.000 / 78 | 0 / 1.000 / 78 | 1 / 1.000 / 124 | 0 / 1.000 / 78 | 1 / 1.000 / 124 |
| go-tools | duplicate-boundary | 0 / 1.000 / 809 | 0 / 1.000 / 809 | 0 / 1.000 / 522 | 0 / 1.000 / 809 | 0 / 1.000 / 522 |
| go-tools | interior-edit | 0 / 1.000 / 562 | 0 / 1.000 / 562 | 1 / 0.000 / 185 | 0 / 1.000 / 562 | 1 / 0.000 / 185 |
| go-tools | move-in-file | 0 / 1.000 / 538 | 0 / 1.000 / 538 | 0 / 1.000 / 205 | 0 / 1.000 / 538 | 0 / 1.000 / 205 |
| neovim | append | 0 / 1.000 / 1029 | 0 / 1.000 / 1029 | 1 / 0.000 / 705 | 0 / 1.000 / 1029 | 1 / 0.000 / 705 |
| neovim | delete | 0 / 1.000 / 78 | 0 / 1.000 / 78 | 1 / 1.000 / 127 | 0 / 1.000 / 78 | 1 / 1.000 / 127 |
| neovim | duplicate-boundary | 0 / 1.000 / 561 | 0 / 1.000 / 561 | 0 / 1.000 / 254 | 0 / 1.000 / 561 | 0 / 1.000 / 254 |
| neovim | interior-edit | 0 / 1.000 / 872 | 0 / 1.000 / 872 | 1 / 0.000 / 506 | 0 / 1.000 / 872 | 1 / 0.000 / 506 |
| neovim | move-in-file | 0 / 1.000 / 698 | 0 / 1.000 / 698 | 0 / 1.000 / 363 | 0 / 1.000 / 698 | 0 / 1.000 / 363 |

Full 70-row table: [`bench/reports/holdout-adapter-bakeoff.md`](../../../bench/reports/holdout-adapter-bakeoff.md).

## Comparison vs PCR 0072 (@ `e5576db`)

- Hermes-fresh: unchanged — 10/10 region match, 0-byte delta (same as 0072).
- Pi-fresh: **unchanged vs 0072** — holdout traces use explicit region scope, not
  offset/limit; 0073 mapper does not move holdout numbers.
- Native columns: identical to 0072 (replayed Hermes native from PCR 0032 report;
  live pi-native run).
- Score / door / lock / ctxbench payload: no drift.

## Conflicts with constitutions

none observed. Gold remains language-agnostic. No door retune. No benchmark fixture change.

## Limitations

- Holdout bakeoff uses sealed traces (not live repo checkout); Hermes native replayed
  from PCR 0032 when host checkout absent.
- `ctxbench:holdout` not run — locked repos absent; honest skip, no fetch/relock.
- PCR 0073 Pi offset/limit parity is validated on synthetic/live boards (0073/0074),
  not on holdout v0.1 sealed traces.
- Not a public performance claim.

## Protocol gap?

**No.** Holdout seal, door blob, and locks untouched. No score retune.

## Next measurement

Hold main at this ledger until the next product or protocol change. Re-run
`ctxbench:holdout` when `bench/repos/` is present without relock.
