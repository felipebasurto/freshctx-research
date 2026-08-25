# PCR 0082 truthful omitted dump marker

- Date: 2026-08-25
- Branch: `pcr/0082-honest-dump-marker`
- Base: `e00c3249`
- Result labels: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: review

## Invariant

A single-path shell dump keeps its assistant call and tool result when FreshCtx
tracks that path. The result marker states whether the live projection selected
the current content, omitted it for budget, or could not resolve it. The marker
does not claim that omitted, unresolved, or absent content was supplied.

Official unserved `read` pairs still drop. The core projector, transcript,
protocol records, policy, parser, benchmark inputs, and locks do not change.

## Test-first evidence

On the clean `e00c3249` base, Board 1 failed at line 98 with
`ERR_ASSERTION`, `false !== true`. The expected `call-cat` call ID was absent
because unserved tracked-pair deletion outranked shell marker replacement.
Board 2 passed on the same red run.

After the adapter change, the targeted command passed all 12 tests in the full
PCR 0080, PCR 0081, and PCR 0082 files.

## Change

The Pi replay adapter, Pi extension, and Hermes bridge pass their existing
projection to `dropUnservedReadToolPairs`.

`request-prune.mjs` derives one ephemeral map from `projection.selected` and
`projection.omitted`. Each tracked path has a `selected`, `budget`, or
`unresolved` disposition. Shell marker replacement removes its call ID from
the unserved deletion set before request assembly.

## Boards

Board 1 tracks a 39 kB `src/viajante/cli.py` body marked CL0 at cap 32,768.
The conversation contains an official `read` and a one-path `cat`. With no disk
change, the projection omits the file for budget. The assembled request has no
CL0 or CL1. It keeps the `call-cat` pair and replaces the result with a marker
that names the path and states that budget omitted the current content.

Board 2 starts from the same state and writes CL1 before the same-turn context
refresh. The projection selects the refreshed unit over the cap. The assembled
request contains the full CL1 body exactly once, contains no CL0, and keeps the
`call-cat` pair.

The third regression board gives the tracked path an `unresolved` disposition.
The pair remains, the old CL0 body is absent, and the marker does not claim
that the projection supplied current content.

The tests use Python source only as fixture text. The gold condition is
language-agnostic.

## Verification

- `node --test test/pcr-0080-refresh-over-budget.test.mjs test/pcr-0081-stale-shell-dump.test.mjs test/pcr-0082-truthful-omitted-dump-marker.test.mjs`: 12 passed, 0 failed.
- `npm test`: 246 passed, 22 skipped, 0 failed, 268 total.
- `npm run evaluate`: `AUTORESEARCH_SCORE=89.107165`.
- `src/anchors.mjs`: `f8771c93894095348185ef3453a3c2498355b3c6`.
- `bench/repos.lock.json`: `79e29d09a9ec12b1128617f683f50a35a3c8809e`.

The score delta is 0. Both frozen blobs are unchanged.

## Scope and limits

This PCR changes adapter request assembly only. It adds no omission protocol
record and makes no core behavior claim. It is not a paper result or a SOTA
claim.

The rule still rewrites only shell calls that name exactly one tracked path.
Commands that name several tracked paths remain outside this PCR.

## Next experiment

Cross the cold omitted board with a one-path pipe in both replay adapters.
Keep multi-path dumps, shell parsing, policy, and benchmark data unchanged.
