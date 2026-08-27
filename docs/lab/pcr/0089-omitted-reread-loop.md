# PCR 0089 — omitted official reread loop fails closed

- Date (UTC): 2026-08-27
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0089-omitted-read-loop-cb22` / draft PR #84
- Commit: (this commit)
- Merge-base: `f2dd29534e59b9b0969308ea77ffedb7b35dfac6` (`main` @ PCR 0088 squash of PR 83)
- Paper-manifest digest: n/a (`adapter-only`)
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

If turn 1 budget-omits an official `read`, that tool-result pair must stay an
honest omission. A later official reread of the same path is a new request: it
must not skip as already injected, must not replay stale tool-result bytes, and
must either serve the current file exactly once when it now fits or keep an
honest omitted marker when it still does not.

This must not regress PCR 0083:

- budget-only truthful omitted marker;
- no lie that the live projection supplied the file when it did not;
- no injection of omitted bytes.

Gold is language-agnostic: first/last, span, location, exact bytes. Not a paper
result. Not SOTA.

### Door / lock / budget (unchanged)

| artifact | value |
|---|---|
| Merge-base | `f2dd29534e59b9b0969308ea77ffedb7b35dfac6` |
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| `DEFAULT_BUDGET_CHARS` | `32768` |

## Test-first evidence

On the clean `f2dd29534e59b9b0969308ea77ffedb7b35dfac6` base, the new two-turn
replay board failed red in both adapters.

The hole was adapter-side:

- the turn-1 omitted official read stayed live in tracking;
- the turn-2 reread of the same file-scope path minted a second current unit
  identity after the file shrank;
- the request could then carry two current copies of the same path, and the
  turn-1 omitted read could be rewritten as though its content had been
  supplied.

That violates both truthfulness and the no-duplicate-current-copy rule.

## What changed

- `adapters/pi/replay.mjs` — treat the latest official read of a given adapter
  observation key as the active one, retire superseded official reads from the
  live registry before projection, and carry forward only already-delivered
  omitted-read dispositions.
- `adapters/hermes/bridge.mjs` — apply the same latest-official-read rule during
  request selection and persist/promote omitted-read dispositions only after the
  transformed request copy is actually delivered.
- `adapters/request-prune.mjs` — keep and marker-rewrite historically delivered
  omitted/unresolved official reads even after a later reread supersedes them.
- `test/pcr-0089-omitted-reread-loop.test.mjs` — add the fail-closed two-turn
  reread board for both Pi and Hermes.

No `src/anchors.mjs` edit. No lock edit. No `persist-38`. No `v0.2`. No
`--relock`. No benchmark, gold-label, threshold, or score-function change.

## Board

| board | setup | expected | observed |
|---|---|---|---|
| Pi omitted-then-reread fit board | turn 1 official read of `src/viajante/cli.py` at ~39 kB is over the default cap and must be budget-omitted; after that request is applied, shrink the file and issue a second official read of the same path on turn 2 | turn-1 result stays a truthful omitted marker; turn-2 result is treated as a fresh request; `skipEligibleSelections=0`; no `CL0`; one current `PCR_0089_FITS_NOW` body; no duplicate current copies | **pass** |
| Hermes omitted-then-reread fit board | same two-turn board under Hermes replay | turn-1 result stays a truthful omitted marker; turn-2 result is treated as a fresh request; `skipEligibleSelections=0`; no `CL0`; one current `PCR_0089_FITS_NOW` body; no duplicate current copies | **pass** |

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0089-omitted-reread-loop.test.mjs` | yes | 0 | 2 passed, 0 failed |
| `node --test test/pcr-0083-official-omitted-read-loop.test.mjs test/pcr-0087-skip-after-discard.test.mjs test/adapter-request-prune.test.mjs test/pcr-0078-cat-tracked-read.test.mjs` | yes | 0 | 24 passed, 0 failed |
| `npm test` | yes | 0 | 282 total; 260 passed; 22 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |

## Metric snapshot

| metric | PCR 0088 | PCR 0089 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `0` |
| deterministic hash agreement | `1.0` | `1.0` | `0` |
| `npm test` total | `280` | `282` | `+2` |
| `npm test` passed | `258` | `260` | `+2` |
| `npm test` skipped | `22` | `22` | `0` |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | `0` |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `0` |
| `DEFAULT_BUDGET_CHARS` | `32768` | `32768` | `0` |

## Scope and limits

This PCR closes the loop in the Pi and Hermes adapters. It does not change the
core stable-unit-id function, the projector contract, the benchmark fixtures, or
the score function.

That means the direct core identity churn for file-scope rereads is still not
reframed as a core PCR here; the adapters now retire superseded official reads
before projection so the replayed host payload fails closed without touching the
frozen door.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** The hole closed at the adapter seam. Door, lock, budget cap, score, and
ctxbench payload hash stayed fixed.

## Next measurement

Add the same-path reread board for the still-over-budget branch as an explicit
adapter replay guard, still without touching `src/anchors.mjs` or benchmark
data.
