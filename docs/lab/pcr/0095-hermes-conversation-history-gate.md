# PCR 0095 — Hermes later-turn collapse must count conversation history, not only the narrowed request slice

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0095-hermes-conversation-gate-c9f6` (draft PR #90)
- Commit: (this commit)
- Merge-base: `0344570ac77c064eeeeb38d7d473f14b8a3d5138` (main @ PCR 0094)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

When Hermes later turns narrow `request_messages` to a one-user request slice but
still provide full `conversation_messages`, an unchanged already-applied
projection must still collapse to the short
`[freshctx:already-served units=1]` marker instead of re-sending the full live
envelope.

The request-slice check stays strict:

- if the actual rewritten request already contains a historical `<freshctx>`
  frame, PCR 0092 still owns that path;
- if the board is single-user/stateless, PCR 0079 and PCR 0087 still require the
  full current body.

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

No live Pi or Hermes run. No `persist-38`. No `v0.2`. No `--relock`.

## Investigation conclusion

The user hypothesis was directionally right, with a narrower root cause than the
0094 apply-ack hole:

- PCR 0094 already fixed the emitted-vs-pending marker mismatch.
- The remaining Hermes leftover was that the official plugin signature accepts
  both `request_messages` and `conversation_messages`, but
  `adapters/hermes/__init__.py` forwarded only `request_messages` into the Node
  bridge.
- On later unchanged turns, the narrowed request slice can still contain the
  tracked read pair and therefore keep `selected.length === skipEligible`, while
  still failing the shared 0093 gate because `userCount(request_messages) === 1`.
- That makes Hermes re-send the full 746-byte `<freshctx>` body even though the
  full conversation history already proves the earlier projection was applied.

So the leftover was **not** “0093 can never arm because `lastInjectedRevision`
is missing.” The leftover was that Hermes dropped the only host-supplied history
field that could satisfy the multi-user gate on narrowed later turns.

## What changed

- `adapters/hermes/__init__.py`
  - passes host `conversation_messages` through to the Node bridge on
    `select_context()`.
- `adapters/hermes/replay.mjs`
  - lets the replay adapter forward `conversationMessages` so the official seam
    can be tested locally.
- `adapters/hermes/bridge.mjs`
  - counts users from `conversationMessages` when Hermes provides them;
  - still checks for an already-present historical `<freshctx>` frame on the
    actual request slice only.
- `adapters/request-prune.mjs`
  - widens `shouldCollapseCurrentProjection()` with an optional
    `userCountMessages` source while preserving its existing request-slice
    default for Pi and other callers.
- `test/pcr-0095-hermes-conversation-history.test.mjs`
  - adds the failing Hermes narrowed-request board:
    1. turn 1 serves NEW once from OLD tool-result bytes with NEW already on
       disk;
    2. turn 2 passes a one-user request slice but a two-user conversation
       history and must collapse to `already-served`;
    3. turn 3 repeats the same narrowed later-turn shape and must stay
       collapsed.

No Pi code path changed. No second Pi engine was added. No door or lock retune.

## Test-first evidence

Before the fix, the new Hermes narrowed-request board failed red on the exact
leftover:

```text
The input did not match the regular expression /\[freshctx:already-served units=1\]/u. Input:

'<freshctx turn="0" selected="1" unresolved="0" budget-omitted="0">...'
```

That proved the later request slice still re-served the full live body even
though `skipEligibleSelections` was already `1`.

## Replay proof

Measured on this branch from the focused Hermes narrowed-request board:

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

- turn 2 is the official leftover shape: narrowed request slice, multi-user
  conversation history, disk unchanged;
- the full 746-byte body collapses to the 99-byte current `already-served`
  marker;
- the next unchanged later turn stays collapsed at 99 bytes;
- no full `PCR_0095_NEW_ON_DISK` body reappears on either later turn.

## Scope guard

The single-user/stateless boards stay full-body:

- PCR 0079 Hermes still sends one current body in every stateless request.
- PCR 0087 Hermes still refuses to mint skip authority from a discarded turn.

The existing later-turn Hermes boards also remained green:

- PCR 0093 request-only re-project collapse still holds;
- PCR 0094 collapsed-turn apply-ack still tracks the emitted marker text.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0095-hermes-conversation-history.test.mjs` | yes | 1 then 0 | red before fix on full-body replay; green after fix |
| `node --test test/pcr-0095-hermes-conversation-history.test.mjs test/pcr-0094-hermes-collapsed-ack.test.mjs test/pcr-0093-live-reproject-failclose.test.mjs test/pcr-0087-skip-after-discard.test.mjs test/pcr-0079-stateless-request-bodies.test.mjs` | yes | 0 | 9 passed, 0 failed |
| `python3 -m py_compile adapters/hermes/__init__.py` | yes | 0 | Hermes plugin syntax ok |
| `npm run papers:verify` | no (first try) | 1 | cache absent: missing `papers/cache/corvus-2026.pdf` |
| `npm run papers:fetch && npm run papers:verify` | yes | 0 | required corpus fetched and verified; manifest sha256 `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89` |
| `npm test` | yes | 0 | 297 total; 275 passed; 22 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |
| `git hash-object src/anchors.mjs bench/repos.lock.json` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| live Pi / Hermes | skipped | n/a | explicitly out of scope for PCR 0095 |

## Metric snapshot

| metric | PCR 0094 | PCR 0095 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `0` |
| deterministic hash agreement | `1.0` | `1.0` | `0` |
| `npm test` total | `296` | `297` | `+1` |
| `npm test` passed | `274` | `275` | `+1` |
| `npm test` skipped | `22` | `22` | `0` |
| paper-manifest digest | `442cd9e2…` | `442cd9e2…` | `0` |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | `0` |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `0` |
| narrowed Hermes replay projection bytes | `n/a` | `746 -> 99 -> 99` | new board |

## Scope and limits

This change is adapter-only and Hermes-only in behavior:

- it does **not** reopen Pi;
- it does **not** retune the door or repo lock;
- it does **not** change core projector metrics or benchmark fixtures;
- it does **not** run or claim a live-host Hermes result on this branch;
- it does **not** prove anything about provider cost beyond the local replayed
  request bytes.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only Hermes host-boundary repair using the official
`conversation_messages` field the host already provides.

## Next experiment

When live Hermes is back in scope, re-run only the original later-turn cost
board and check that the official WITH arm now drops from a full-body later
projection to the short `already-served` marker on unchanged post-apply turns.
That measurement was intentionally **not** run here.
