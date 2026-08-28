# PCR 0091 — mixed tracked+untracked multi-path dumps fail closed

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0091-mixed-dumps-d1f7` / draft PR #86
- Commit: (this commit)
- Merge-base: `d0f6a1ac195c302e71299e651572ed17a8da71ac` (`main`, PCR 0090 squash of PR 85)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

If a recognized multi-path dump names at least one already-tracked path, the
request copy must not keep stale tracked bytes. Marker-replace the dump body and
describe only the tracked paths truthfully. Named paths that are not exact
tracked matches must be called out as not supplied. Path matching stays
fail-closed exact: `docs/README.md` is not tracked `README.md`.

Gold is language-agnostic: first/last, span, location, exact bytes. This is an
adapter-only replay change, not a paper result, and not a SOTA claim.

### Frozen values checked in this run

| artifact | value |
|---|---|
| Merge-base | `d0f6a1ac195c302e71299e651572ed17a8da71ac` |
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| `DEFAULT_BUDGET_CHARS` | `32768` |
| `AUTORESEARCH_SCORE` | `89.107165` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` |

## Test-first evidence

Before the adapter change, the mixed-path boards failed red:

- command: `node --test test/pcr-0081-stale-shell-dump.test.mjs test/pcr-0084-multi-path-tracked-dumps.test.mjs test/pcr-0090-multi-path-beyond-cat.test.mjs`
- failing boards:
  - `PCR 0091: five-file cat dump with one untracked path marker-replaces stale tracked bytes`
  - `PCR 0091: one-untracked-path multi-path cat marker-replaces stale tracked bytes`
  - `PCR 0091: suffix path alias stays exact while tracked peer bytes are marker-replaced`
  - `PCR 0091: mixed tracked and untracked multi-path python dump marker-replaces stale tracked bytes`
- representative failure:
  `Expected values to be strictly deep-equal: actual [] vs expected ['call-one-untracked']`

Root cause: `trackedDumpPathsForCommand()` required every named path in a
recognized multi-path dump to match a tracked path. Mixed dumps therefore fell
through as if they had no tracked content, so the request copy kept the stale
concat body even when one or more tracked paths were already covered by the live
projection.

## Change

- `adapters/request-prune.mjs`
  - kept dump-shape recognition unchanged;
  - split recognized multi-path dump names into exact tracked matches and
    unmatched names;
  - marker-replaces the dump body whenever at least one exact tracked path is
    present;
  - appends an explicit "not supplied" note for unmatched named paths;
  - preserves the existing exact-path rule for what counts as tracked.
- `test/pcr-0081-stale-shell-dump.test.mjs`
  - replaces the old mixed five-file cat board with a fail-closed stale-byte
    board.
- `test/pcr-0084-multi-path-tracked-dumps.test.mjs`
  - replaces the old one-untracked and suffix-alias untouched boards with
    fail-closed marker boards.
- `test/pcr-0090-multi-path-beyond-cat.test.mjs`
  - replaces the old mixed Python untouched board with a fail-closed marker
    board;
  - keeps the all-tracked Python / pipe / `xargs` boards green.
- `adapters/pi/README.md`, `adapters/hermes/README.md`, `docs/ARCHITECTURE.md`
  - update product-facing adapter behavior to the new mixed-path rule.

Did **not** edit `src/anchors.mjs`. Did **not** touch the projector. Did **not**
change `DEFAULT_BUDGET_CHARS`, `AUTORESEARCH_SCORE`, ctxbench payload logic,
`persist-38`, `v0.2`, `--relock`, coverage/latency/treesitter policy, or any
benchmark fixture, gold label, score weight, threshold, or held-out split.

## Boards

| board | command shape | expected request-copy behavior | observed |
|---|---|---|---|
| all-tracked Python argv dump | `python3 -c "... pathlib.Path(path).read_text() ..." README.md src/viajante/cli.py src/viajante/models.py` | keep pair; replace dump body with `freshctx:stale-dump`; no huge concat body | pass |
| all-tracked piped cat dump | `cat README.md src/viajante/cli.py src/viajante/models.py | base64` | keep pair; replace dump body with `freshctx:stale-dump`; no huge concat body | pass |
| all-tracked xargs cat dump | `printf '%s\n' README.md src/viajante/cli.py src/viajante/models.py | xargs cat` | keep pair; replace dump body with `freshctx:stale-dump`; no huge concat body | pass |
| mixed tracked/untracked Python dump | `python3 -c "... pathlib.Path(path).read_text() ..." README.md src/viajante/cli.py notes/freshctx-todo.md` | keep pair; replace stale dump body; tracked paths named in marker; `notes/freshctx-todo.md` called out as not supplied | pass |
| mixed tracked/untracked cat dump | `cat README.md src/viajante/cli.py src/viajante/models.py notes/freshctx-todo.md` | keep pair; replace stale dump body; tracked paths named in marker; `notes/freshctx-todo.md` called out as not supplied | pass |
| five-file mixed cat dump | `cat README.md src/viajante/cli.py src/viajante/models.py src/viajante/flights.py notes/freshctx-todo.md` | keep pair; replace stale dump body; tracked paths named in marker; `notes/freshctx-todo.md` called out as not supplied | pass |
| exact-path fail-closed regression | `cat docs/README.md src/viajante/cli.py` with tracked `README.md` and `src/viajante/cli.py` | keep pair; replace stale tracked peer bytes; `docs/README.md` called out as not supplied; do not claim tracked `README.md` | pass |

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run papers:fetch && npm run papers:verify` | yes | 0 | fetched missing corpus; verified manifest sha256 `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89` |
| `node --test test/pcr-0081-stale-shell-dump.test.mjs test/pcr-0084-multi-path-tracked-dumps.test.mjs test/pcr-0090-multi-path-beyond-cat.test.mjs` | yes | 1 before fix | 10 passed, 4 failed; failures were the four new mixed-path boards above |
| `node --test test/pcr-0081-stale-shell-dump.test.mjs test/pcr-0084-multi-path-tracked-dumps.test.mjs test/pcr-0090-multi-path-beyond-cat.test.mjs` | yes | 0 after fix | 14 passed, 0 failed |
| `npm test` | yes | 0 | 291 total; 269 passed; 22 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |

## Metric snapshot

| metric | PCR 0090 | PCR 0091 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `0` |
| deterministic hash agreement | `1.0` | `1.0` | `0` |
| `npm test` total | `291` | `291` | `0` |
| `npm test` passed | `269` | `269` | `0` |
| `npm test` skipped | `22` | `22` | `0` |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | `0` |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `0` |

## Limitations

- The matcher still stays intentionally narrow and fail-closed. It only
  marker-replaces dump bodies for command shapes it can read directly from
  command text.
- `parseShellFileRead()` is unchanged and still refuses pipes for live tracking;
  this PCR only changes request-copy stale-dump replacement.
- Unmatched named paths are reported as not supplied, not resolved, and not
  silently promoted to tracked.
- Exact-path matching still does not suffix-match aliases such as
  `docs/README.md` vs tracked `README.md`.

## Protocol gap?

**No.** The adapter-only hole is closed without moving merge-base, door, lock,
budget cap, score, or payload hash.

## Next measurement

Drive one live Pi or Hermes inventory-style capture that uses a mixed tracked +
untracked multi-path dump and confirm the request copy drops the stale concat
body while explicitly naming the unmatched path as not supplied. That would
still be a live-host check, not a paper result.
