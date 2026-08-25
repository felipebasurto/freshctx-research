# PCR 0072 — post-0070 evaluate + holdout bakeoff (measurement)

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0072-post-0070-evaluate-d80d` (draft PR)
- Commit: (this docs commit)
- Main HEAD measured: `e5576db1946b05d737255906e0ab1a1282450f8b` (PCR 0070 squash)
- Merge-base: `e5576db1946b05d737255906e0ab1a1282450f8b` (main @ PCR 0070)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `measurement`; `holdout-adapter-bakeoff`
- Decision: **review** (docs-only benchmark ledger; no product change)

## Hypothesis or change

PCR 0064–0070 landed on main through the Hermes pagination / exact-EOF clamp arc.
This PCR records the **post-0070 evaluate snapshot** on current main without retuning
the door, locks, or benchmark fixtures.

**Main now contains (0064–0070 arc):**

| PCR | Squash commit | Change vs door/lock/score hold |
|---|---|---|
| [0064](0064-hermes-default-limit-clamp.md) | `460ff944` | Adapter product: past-EOF default `limit=2000` promotes to file-scope; +6 tests |
| [0065](0065-observe-after-delete-repin.md) | `49f029ec` | Measurement: delete re-pin triad; +4 tests |
| [0067](0067-delete-repin-identity-leftover.md) | `a86b3848` | Measurement: delete-repin identity leftover; +2 tests |
| [0066](0066-in-bounds-exact-eof-region.md) | `9f906b5b` | Measurement: in-bounds exact-EOF page stays region; empty leftover; +10 tests |
| [0068](0068-header-1-1-delete-reobserve.md) | `feec8fc2` | Measurement: header 1–1 delete re-observe re-pin; +2 tests |
| [0069](0069-exact-eof-file-scope-clamp.md) | `5e6f4c3b` | Adapter product: `endLine >= fileLineCount` promotes to file-scope; +9 tests |
| [0071](0071-exact-eof-extra-boards.md) | `a7059be4` | Measurement: exact-EOF boards A/B/C; +7 tests |
| [0071](0071-exact-eof-extra-boards.md) | `a7769c51` | PR 65 Board C core `2–4` fail-close follow-up (not attributed to `a7059be4` alone) |
| [0070](0070-no-over-promote-guard.md) | `e5576db1` | Measurement: in-bounds non-whole-file pages stay region; +15 tests |

All rows above held `AUTORESEARCH_SCORE=89.107165`, ctxbench payload sha256, door blob,
and lock blob at their respective ledger entries. This PCR confirms **no drift** after
0070.

Not a paper result. Not SOTA.

## What we did

- Re-ran `npm test`, `npm run evaluate`, and `npm run ctxbench:holdout-adapter-bakeoff`
  on main @ `e5576db`.
- Recorded door and lock git blobs; confirmed unchanged from PCR 0070 baseline.
- Skipped `npm run ctxbench:holdout` — `bench/repos/` absent on this VM (no fetch/relock).
- Added this PCR and updated `docs/lab/INDEX.md` / `docs/lab/METRICS.md` only.
- Did **not** edit `src/anchors.mjs`, adapters, holdout traces/gold,
  `bench/repos.lock.json`, or benchmark score weights.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

Door blob matches last known (`f8771c93…`). Lock blob matches last known
(`79e29d09…`). Score matches last known (`89.107165`).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **196 pass**, **22 skip**, **0 fail** (218 total) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3…` confirmed |
| `npm run ctxbench:holdout-adapter-bakeoff` | yes | 0 | hermes-fresh matched region on all 10 cells |
| `npm run ctxbench:holdout` | **no** | — | skipped: `bench/repos/` not present |
| live Hermes confirm | no | — | synthetic + sealed-trace bakeoff only |

## Metric snapshot

| metric | before (0070 ledger) | after (main @ 0072) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 196/196 runnable | 196/196 runnable | 0 |
| npm test skip | 22 | 22 | 0 |
| npm test fail | 0 | 0 | 0 |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `79e29d09…` | `79e29d09…` | 0 |
| holdout bakeoff hermes-fresh vs region | matched (10/10) | matched (10/10) | 0 |

## Holdout adapter bake-off (10 cells)

`hermesFreshMatchesRegion: true`. Hermes native replayed native-no-op on all 10 cells
(below compress threshold; PCR 0038 baseline).

| repo | family | freshctx-region stale / recall / bytes | hermes-fresh stale / recall / bytes | hermes-native stale / recall / bytes |
|---|---|---|---|---|
| go-tools | append | 0 / 1.000 / 604 | 0 / 1.000 / 604 | 0 / 1.000 / 277 |
| go-tools | delete | 0 / 1.000 / 78 | 0 / 1.000 / 78 | 1 / 1.000 / 124 |
| go-tools | duplicate-boundary | 0 / 1.000 / 809 | 0 / 1.000 / 809 | 0 / 1.000 / 522 |
| go-tools | interior-edit | 0 / 1.000 / 562 | 0 / 1.000 / 562 | 1 / 0.000 / 185 |
| go-tools | move-in-file | 0 / 1.000 / 538 | 0 / 1.000 / 538 | 0 / 1.000 / 205 |
| neovim | append | 0 / 1.000 / 1029 | 0 / 1.000 / 1029 | 1 / 0.000 / 705 |
| neovim | delete | 0 / 1.000 / 78 | 0 / 1.000 / 78 | 1 / 1.000 / 127 |
| neovim | duplicate-boundary | 0 / 1.000 / 561 | 0 / 1.000 / 561 | 0 / 1.000 / 254 |
| neovim | interior-edit | 0 / 1.000 / 872 | 0 / 1.000 / 872 | 1 / 0.000 / 506 |
| neovim | move-in-file | 0 / 1.000 / 698 | 0 / 1.000 / 698 | 0 / 1.000 / 363 |

Full table: `bench/reports/holdout-adapter-bakeoff.md`.

## Comparison (0064–0070 vs this hold)

- PCR 0064: adapter clamp for past-EOF default page; score/door/lock unchanged; +6 tests.
- PCR 0065: delete re-pin triad measurement; score/door/lock unchanged; +4 tests.
- PCR 0066: in-bounds exact-EOF empty leftover (pre-0069); score/door/lock unchanged; +10 tests.
- PCR 0067: delete-repin identity leftover; score/door/lock unchanged; +2 tests.
- PCR 0068: header 1–1 delete re-observe; score/door/lock unchanged; +2 tests.
- PCR 0069: exact-EOF file-scope clamp (`endLine >= fileLineCount`); score/door/lock unchanged; +9 tests.
- PCR 0071: exact-EOF extra boards A/B/C; score/door/lock unchanged; +7 tests.
- PCR 0070: no-over-promote guard for in-bounds non-whole-file pages; score/door/lock unchanged; +15 tests.
- PCR 0072: ledger row after 0070; **no metric drift** on this VM.

Holdout adapter bake-off unchanged vs PCR 0038/0040 baseline: hermes-fresh 0-byte delta
vs freshctx-region on stale/recall/projection-bytes for all 10 cells.

## Conflicts with constitutions

none observed. Gold remains language-agnostic. No door retune. No benchmark fixture change.

## Limitations

- Evaluate score and ctxbench payload unchanged; 0064–0070 test additions are regression
  locks only (0064/0069 adapter product; remainder measurement).
- `ctxbench:holdout` not run — locked repos absent; honest skip, no fetch/relock.
- Holdout bakeoff uses sealed traces (not live repo checkout); native column replayed
  from PCR 0032 native-holdout report.
- Not a public performance claim.

## Protocol gap?

**No.** Holdout seal, door blob, and locks untouched. No score retune.

## Next measurement

Hold main at this ledger until the next product or protocol change. Re-run
`ctxbench:holdout` when `bench/repos/` is present without relock.
