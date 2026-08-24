# PCR 0059 — Hermes offset/limit region mapping and delete fail-close

- Date (UTC): 2026-08-24
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0059-offset-region-delete-failclose-3b2c` (draft PR)
- Commit: (this docs commit)
- Merge-base: `afd97d3732589073dfbc14d4d2a8393262c9bf4d` (main; PCR 0055 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`
- Decision: **review** (product change + regression tests; live box confirm pending)

## Hypothesis or change

PCR 0055 added `stored-line-span` for single-line region refresh after the frozen
door misses. Two leftovers remained after live measurement (0047/0058):

1. **Hermes offset/limit is not a FreshCtx region.** Live CLI `read_file` with
   `{"offset":2,"limit":1,"path":"…"}` carries no `scope`/`startLine`/`endLine`.
   The adapter stored `scope=file` and projected `resolution=whole-file`, so the
   0055 `stored-line-span` path never fired on real Hermes pagination args.

2. **Delete of the tracked line serves the neighbor.** On a 3-line file with a
   region on line 2, deleting line 2 left 2 lines; `stored-line-span` served
   `line3 footer` at lines 2–2. PCR 0058 (draft PR 51) locked that behavior as
   observed; this PCR **changes** it to fail-closed.

**Fix (hole 1):** in `adapters/hermes/bridge.mjs`, map finite `offset`/`limit`
on observe/track to `scope=region`, `startLine=offset`, `endLine=offset+limit-1`
(Hermes offset is 1-indexed). Missing offset/limit stays whole-file. Persist
`observedFileLineCount` at observe time from the workspace file.

**Fix (hole 2):** in `src/registry.mjs`, `stored-line-span` runs only when
`observedFileLineCount` is present and equals the current file line count (same
`lineCount()` helper). Line count down (delete) or up (insert-above) skips the
fallback → unresolved, empty projection for that unit, no neighbor bytes. Single-line
**replace** with unchanged line count keeps the 0055 `BETA_NEW_INTERIOR` path.

Draft PR 51 board A expected behavior (neighbor serve) is **superseded** by this
fail-close rule.

Not a paper result. Not SOTA. Live Hermes confirm on the research box after review.

## What we did

- `readScopeFromHermesArgs()` maps Hermes pagination to region span metadata.
- `observeTurn` enriches tracked calls with `observedFileLineCount`; merge preserves
  observe-time counts across select.
- `FreshRegistry.trackRead` stores `observedFileLineCount`; refresh gate on
  `stored-line-span`.
- Added `test/pcr-0059-offset-region-delete-failclose.test.mjs` (offset/limit →
  region + interior replace, delete fail-close core/Hermes, past-EOF, insert-above).
- Updated `test/region-interior-line-refresh.test.mjs` core path to pass explicit
  `observedFileLineCount`.
- Did **not** edit `src/anchors.mjs` (door), holdout traces/gold, or lock files.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 128 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes offset/limit + delete confirm | no | — | box-side after review |

## Metric snapshot

| metric | before (0055 main) | after (this PR) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `resultSetHash` | null | null | — |
| npm test pass | 122/122 runnable | 128/128 runnable | +6 tests |
| Hermes offset=2 limit=1 → region 2–2 (synthetic) | whole-file | `stored-line-span` | fixed |
| delete tracked line (synthetic) | neighbor serve | unresolved | fixed |
| 0055 interior replace (line count unchanged) | pass | pass | 0 |

## Comparison

- PCR 0047: measured live B-interior region miss; Hermes args lacked explicit region.
- PCR 0055: `stored-line-span` for single-line interior replace when door misses.
- PCR 0058 (draft PR 51): locked delete-neighbor serve as observed; **superseded** here.
- PCR 0059: closes Hermes pagination mapping + line-count-shift fail-close.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (lines, span, exact bytes).

## Limitations

- `observedFileLineCount` uses the same trailing-newline-sensitive `lineCount()` as
  refresh; observe and refresh must agree on file bytes (normal workspace reads).
- Multi-line Hermes pagination (`limit>1`) maps to a multi-line region but does not
  use `stored-line-span` (single-line only).
- Without `observedFileLineCount`, `stored-line-span` fail-closes (no neighbor serve).
- n=1 live Hermes confirm not run in this VM.
- Not holdout / not public performance claim.

## Protocol gap?

**No.** Holdout seal, door blob, and locks untouched.

## Next measurement

On the research box: repeat live `read_file` with `offset=2`, `limit=1` on
`region_b.txt`; confirm region unit lines 2–2 and `BETA_NEW_INTERIOR` after
interior replace. Repeat delete-line-2 cell; confirm projection does **not** contain
`line3 footer` as the region unit (unresolved / empty block).
