# PCR 0092 — later-turn projection replay collapses to an already-served marker

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0092-later-turn-skip-b8d2` (draft PR #87)
- Commit: (this commit)
- Merge-base: `cd0aa1014ad2383359e1a0e70866b7674aea2235` (main @ PCR 0091)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

Once a Pi or Hermes request has already served one FreshCtx projection body, later
turns must not replay that earlier projection body from history. A later request
still needs one current body in its own tail projection (PCR 0079), but any older
FreshCtx projection snapshot in history may collapse to a short marker. If disk
bytes change again, the later request must serve the new current body again.

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

No live Pi or Hermes run. No `persist-38`. No `v0.2`. No `--relock`.

## Investigation conclusion

The user hypothesis was directionally right but not literally the PCR 0077 engine.

- PCR 0077's general "selected unit body becomes marker-only on the next unchanged
  request" path was intentionally removed by PCR 0079 because it broke the
  stateless byte-exact request invariant.
- PCR 0087 reintroduced only an apply-acknowledged delivery-state path
  (`lastInjectedRevision` / `pendingInjectedRevision`) for skip eligibility and
  omission truthfulness. That state was already correct and stayed wired.
- The later-turn replay hole was elsewhere: adapters rewrote old tool results, but
  they never rewrote older FreshCtx projection **user messages**. When a host
  replayed a prior WITH turn, the request could therefore contain:
  1. the earlier full `<freshctx-unit>` body from history; and
  2. the new current full `<freshctx-unit>` body appended for the present turn.

So the defect was not "0077 should have made the current tail projection bodyless."
The defect was "older projection snapshots were left unmasked in later request
history." The fix stays adapter-only and leaves PCR 0079's stateless full-body tail
projection intact.

## What changed

- `adapters/request-prune.mjs`
  - imports `decodeProjectionUnits()` from the existing projector surface;
  - detects historical user messages that are whole FreshCtx projection frames;
  - rewrites those historical frames to
    `[freshctx:already-served units=N] Historical FreshCtx projection omitted; see latest live projection below.`
- `adapters/pi/replay.mjs` and `adapters/pi/extension.ts`
  - apply that historical-projection rewrite after read-result masking and before
    request assembly.
- `adapters/hermes/bridge.mjs`
  - applies the same rewrite at the Hermes request-assembly seam.
- `test/pcr-0092-later-turn-projection-replay.test.mjs`
  - adds the failing replay board for Pi and Hermes:
    - turn 1 tool result is OLD while disk is already NEW;
    - turn 2 replays the prior transformed WITH turn while disk is unchanged;
    - turn 3 changes disk again and must serve NEWER.

No projector, engine, benchmark fixture, gold label, threshold, score function,
door blob, or repo lock changed.

## Test-first evidence

Before the fix, the new replay board failed red in both adapters on the same
assertion: later turn payload text contained the NEW body **twice** instead of
once.

```text
Expected values to be strictly equal:

2 !== 1
```

That is the exact failure the user reported in the longer Pi cost session: the
historical WITH-turn projection stayed inline and a second current projection was
appended on top of it.

## Replay proof

Measured from this branch with a synthetic three-turn replay board:

```json
{
  "pi": {
    "turn1ProjectionBytes": 746,
    "turn2ProjectionBytes": 746,
    "turn3ProjectionBytes": 762,
    "turn2NewCopies": 1,
    "turn2AlreadyServedMarkers": 1,
    "turn3NewerCopies": 1,
    "turn3OldNewCopies": 0
  },
  "hermes": {
    "turn1ProjectionBytes": 746,
    "turn2ProjectionBytes": 746,
    "turn3ProjectionBytes": 762,
    "turn2NewCopies": 1,
    "turn2AlreadyServedMarkers": 1,
    "turn3NewerCopies": 1,
    "turn3OldNewCopies": 0
  }
}
```

Interpretation:

- turn 1 serves NEW current bytes once;
- turn 2 keeps the tail projection body byte-exact (still 746 bytes) but the
  earlier historical projection body is gone, replaced by one already-served
  marker;
- turn 3 serves NEWER current bytes once and does not replay the earlier NEW body.

That is the intended fail-close shape after PCR 0079: one current body per
request, zero older full-body replays.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0092-later-turn-projection-replay.test.mjs` | yes | 0 | 2 passed, 0 failed |
| `node --test test/pcr-0087-skip-after-discard.test.mjs test/pcr-0089-omitted-reread-loop.test.mjs test/pcr-0092-later-turn-projection-replay.test.mjs test/adapter-request-prune.test.mjs` | yes | 0 | 16 passed, 0 failed |
| `npm test` | yes | 0 | 293 total; 271 passed; 22 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |
| `npm run papers:verify` | yes | 0 | required corpus verified after `npm run papers:fetch`; manifest sha256 `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89` |

## Metric snapshot

| metric | PCR 0091 | PCR 0092 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `0` |
| deterministic hash agreement | `1.0` | `1.0` | `0` |
| `npm test` total | `291` | `293` | `+2` |
| `npm test` passed | `269` | `271` | `+2` |
| `npm test` skipped | `22` | `22` | `0` |
| paper-manifest digest | `442cd9e2…` | `442cd9e2…` | `0` |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | `0` |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `0` |

## Scope and limits

This PCR does **not** restore PCR 0077's marker-only selected-unit body path.
Each current request still carries one full current body for each selected unit.
The savings are only in later-turn history replay, where older FreshCtx projection
snapshots are replaced by an already-served marker before the new current tail is
appended.

Because this is adapter-only:

- live core `freshctx-region` numbers stay unchanged;
- ctxbench payload hash stays unchanged;
- the current branch still has no live Pi/Hermes provider-cache measurement.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** The missing wire was at the adapter request-copy seam. Rewriting historical
projection snapshots closes the duplicate-body replay without reopening PCR 0077's
body-skipping projector behavior.

## Next experiment

Add one request-capture fixture that starts from a persisted WITH-turn transcript
instead of a synthetic replay builder, so the later-turn projection-history rewrite
is locked against the exact host-shaped message layout that triggered the Pi cost
observation, still without running live Pi or Hermes.
