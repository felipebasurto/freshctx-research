# PCR 0094 — Hermes collapsed-turn apply-ack tracks the emitted marker text

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/hermes-collapsed-ack-e07c` (draft PR #89)
- Commit: (this commit)
- Merge-base: `bb8f075371cb2ad235880e2707340f01b0b11987` (main @ PCR 0093)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

When Hermes collapses an unchanged request-only turn to the short
`[freshctx:already-served ...]` marker, the pending apply-ack target must be the
exact emitted marker text rather than the un-emitted full `<freshctx>` envelope.

That keeps delivery-state bookkeeping truthful at the host boundary and preserves
the stateless full-body rule for single-user-message boards.

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

No live Pi or Hermes run. No `persist-38`. No `v0.2`. No `--relock`.

## Investigation conclusion

The narrow mismatch named by the reviewer was real in `adapters/hermes/bridge.mjs`:

- `selectContext()` decided whether to emit the full projection or the collapsed
  already-served marker.
- Hermes persisted `state.pendingProjectionText = projection.text` before that
  emit decision took effect.
- On a collapsed turn, the emitted request text was the 99-byte marker while the
  pending ack target remained the 746-byte full `<freshctx>` body.

The broader follow-on hypothesis did **not** reproduce on the current replay
path: an unchanged later turn did not automatically fall back to re-serving the
full body, because `lastInjectedRevision` was already valid from the prior
applied full-body turn. So the hole was real, but narrower than “next turn
re-serves the full envelope.”

## What changed

- `adapters/hermes/bridge.mjs`
  - computes `projectionText` before persisting pending delivery state;
  - stores the emitted request text as `pendingProjectionText`;
  - leaves selection, projection bytes on non-collapsed turns, and read pruning
    unchanged.
- `test/pcr-0094-hermes-collapsed-ack.test.mjs`
  - adds a focused Hermes replay board:
    1. turn 1 serves NEW current bytes once;
    2. turn 2 is unchanged and collapses to the already-served marker;
    3. the persisted pending ack target must equal the emitted marker text;
    4. turn 3 unchanged stays collapsed;
    5. zero full NEW copies reappear on turns 2-3.

No Pi code, core projector code, benchmark fixture, gold label, score weight,
door blob, or repo lock changed.

## Test-first evidence

Before the fix, the new Hermes board failed red on the pending/emitted equality
check:

```text
Expected values to be strictly equal:
+ actual - expected

+ '<freshctx turn="0" selected="1" unresolved="0" budget-omitted="0">...'
- '[freshctx:already-served units=1] Current tracked content was already served and disk is unchanged.'
```

That proved the stored apply-ack target differed from the request text Hermes
actually emitted on the collapsed turn.

## Replay proof

Measured on this branch from the focused Hermes replay board and a direct state
inspection script:

```json
{
  "hermes": {
    "turn1ProjectionBytes": 746,
    "turn2ProjectionBytes": 99,
    "turn3ProjectionBytes": 99,
    "turn2SkipEligibleSelections": 1,
    "turn3SkipEligibleSelections": 1,
    "turn2PendingMatchesEmitted": true,
    "turn2AlreadyServedMarkers": 1,
    "turn3AlreadyServedMarkers": 1,
    "turn2NewCopies": 0,
    "turn3NewCopies": 0
  }
}
```

Interpretation:

- turn 2 collapses to the short marker and the pending ack target matches it;
- the later unchanged turn stays collapsed at the same 99-byte projection size;
- no full `PCR_0094_NEW_ON_DISK` body is re-served on either collapsed turn.

## Scope guard

The stateless single-user-message boards stay full-body:

- PCR 0079 Hermes still sends one current body in every stateless request.
- PCR 0087 Hermes still refuses to mint skip authority from a discarded turn.

Those boards remained green in the focused regression run.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0079-stateless-request-bodies.test.mjs test/pcr-0087-skip-after-discard.test.mjs test/pcr-0093-live-reproject-failclose.test.mjs test/pcr-0094-hermes-collapsed-ack.test.mjs` | yes | 0 | 8 passed, 0 failed |
| `npm run papers:verify` | no (first try) | 1 | cache absent: missing `papers/cache/corvus-2026.pdf` |
| `npm run papers:fetch && npm run papers:verify` | yes | 0 | required corpus fetched and verified; manifest sha256 `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89` |
| `npm test` | yes | 0 | 296 total; 274 passed; 22 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |
| `git hash-object src/anchors.mjs bench/repos.lock.json` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| live Pi / Hermes | skipped | n/a | explicitly out of scope for PCR 0094 |

## Metric snapshot

| metric | PCR 0093 | PCR 0094 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `0` |
| deterministic hash agreement | `1.0` | `1.0` | `0` |
| `npm test` total | `295` | `296` | `+1` |
| `npm test` passed | `273` | `274` | `+1` |
| `npm test` skipped | `22` | `22` | `0` |
| paper-manifest digest | `442cd9e2…` | `442cd9e2…` | `0` |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | `0` |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `0` |

## Scope and limits

This change is adapter-only and Hermes-only.

- It does **not** change core rendering, selection, or the metric surface.
- It does **not** reopen Pi.
- It does **not** retune the door or rewrite the repo lock.
- It does **not** claim a live-host result.
- It does **not** show the broader “next turn re-serves full body” failure on the
  current replay harness; that part of the leftover was discarded as not
  reproduced here.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only delivery-state correction at the Hermes host boundary.

## Next experiment

If this leftover needs any follow-up, it should be limited to checking whether
Hermes should also promote or clear applied read-disposition state differently
on collapsed turns. No evidence from PCR 0094 requires broader request or core
changes.
