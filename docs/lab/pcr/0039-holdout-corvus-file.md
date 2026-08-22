# PCR 0039 — holdout v0.1 corvus-file column on adapter bake-off

- Date (UTC): 2026-08-22
- Author / agent: repository maintainers
- Branch / PR: `cursor/pcr-0039-corvus-file-holdout-800d`
- Commit: `abdbbb6`
- Merge-base vs PCR 0038 squash (`e45b2cdb`): `e45b2cdbf15aec2b4133e232e5b005dd832f49cb`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-holdout`; `holdout-adapter-bakeoff`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

PCR 0038 compared region/file/hermes-fresh/hermes-native/pi-native/pi-fresh on the sealed 10-trace holdout v0.1 pack and left CORVUS off the table. This PCR adds the missing **corvus-file** column using the existing documented whole-file reproduction (`bench/corvus.mjs`, ADR 0003) — not a door change, not a new CORVUS invention.

**Hypothesis verified:** `corvus-file` is a live-run whole-file baseline on the same 10 cells. It matched `freshctx-region` on required-recall and stale-bytes for all 10 holdout cells. Whole-file projection-bytes exceed region on append/duplicate-boundary/interior-edit/move-in-file cells (expected whole-file cost); delete cells are smaller than region due to `[corvus-file …]` serialization vs region units.

## What we did

- Extended `bench/holdout-adapter-bakeoff.mjs` to run `corvus-file` via `runTrace(trace, "corvus-file")` (live; not replayed).
- Refreshed [`bench/reports/holdout-adapter-bakeoff.md`](../../../bench/reports/holdout-adapter-bakeoff.md) with corvus-file rows, stale/recall finding, and delta-vs-region table.
- Added `corvusFileStaleRecallVsRegion` helper and report section; updated merge-base anchor to PCR 0038 squash (`e45b2cdb`).
- Did **not** edit `src/anchors.mjs`, holdout v0.1 traces/gold, `bench/repos.lock.json`, `bench/hosts.lock.json`, benchmark weights, or door state.
- Did **not** truncate \(C_t\), add desync, or set `FRESHCTX_CAPTURE_OK`.

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
| `npm test` | yes | 0 | **137/137** (115 pass, 22 skip host-clone-free); holdout bake-off tests updated |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run holdout:verify --pack=holdout-v0.1` | yes | 0 | `resultSetHash` null; trace-set hash unchanged |
| `npm run holdout:ci-guard` | yes | 0 | |
| `npm run ctxbench:holdout-adapter-bakeoff` | yes | 0 | 70 records (7 baselines × 10 traces); corvus-file live-run |

## corvus-file vs freshctx-region (10 cells)

| check | result |
|---|---|
| live-run (not replayed) | yes — `bench/corvus.mjs` via trace-runner |
| stale-bytes match | yes — all 10 cells 0 delta |
| required-recall match | yes — all 10 cells |
| projection-bytes match | no — whole-file cells +5335…+6606 vs region; delete cells −91…−96 vs region |
| exact-current match | no — corvus 0.000 on whole-file scope cells (same as freshctx-file) |

## corvus-file projection delta vs region (per cell)

| repo | family | corvus bytes | region bytes | delta (corvus − region) |
|---|---|---|---|---|
| go-tools | append | 5939 | 604 | +5335 |
| go-tools | delete | 68 | 164 | −96 |
| go-tools | duplicate-boundary | 6150 | 809 | +5341 |
| go-tools | interior-edit | 5938 | 562 | +5376 |
| go-tools | move-in-file | 5914 | 538 | +5376 |
| neovim | append | 7133 | 1029 | +6104 |
| neovim | delete | 73 | 164 | −91 |
| neovim | duplicate-boundary | 7167 | 561 | +6606 |
| neovim | interior-edit | 7132 | 872 | +6260 |
| neovim | move-in-file | 7106 | 698 | +6408 |

Full 70-row table (all baselines): see report.

## Limitations

- Publishable table only; not a SOTA or performance claim.
- `corvus-file` whole-file scope: exact-current 0 on cells where region is 1 (append/interior-edit/move-in-file on both repos).
- `hermes-native` still replayed from PCR 0032 when host checkout absent.
- Holdout window does not trigger Hermes compress.
- `resultSetHash` null; holdout traces/gold untouched.

## Protocol gap?

**No.** Uses existing holdout v0.1 traces under candidate label; no seal state change.

## Next measurement

Compare corvus-file vs freshctx-file byte deltas on holdout (serialization framing only); live Hermes host re-run when checkout available.
