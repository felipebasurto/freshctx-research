# PCR 0093 — live re-project fail-close after an already-served unchanged turn

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0093-live-reproject-fail-close-e4a0` (draft PR #88)
- Commit: (this commit)
- Merge-base: `45c27698d268af2cc915bc0dece652167e88e57c` (main @ PCR 0092)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

After Pi or Hermes has already served NEW current bytes on a request-only path, a
later unchanged live re-project must not send that same full current envelope
again when the host did not persist the earlier `<freshctx>` frame. A short
already-served marker is enough. If disk changes, the next re-project must serve
NEW again.

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

No live Pi or Hermes run. No `persist-38`. No `v0.2`. No `--relock`.

## Investigation conclusion

The user hypothesis was right about the missing seam.

- PCR 0092 only collapses **historical** `<freshctx>` frames already present in the
  incoming request messages.
- Official Pi RPC is request-only. It does **not** persist the transformed
  request copy that contained the prior live projection.
- So the later live turn that triggered the cost report did not replay a
  historical `<freshctx>` user message at all. It replayed only the original
  transcript, plus later assistant and user text.
- Because no historical frame was present, PCR 0092 had nothing to rewrite.
  `replaceHistoricalProjectionMessages()` never fired, `already-served` stayed 0,
  and the adapter appended one more full live projection on the unchanged turn.

That means 0092 did not fail inside its own path. It targeted the wrong path for
the official Pi cost observation. The missing wire was the request-only
re-project path that already had 0087's apply-acknowledged `lastInjectedRevision`
state but still treated skip eligibility as telemetry only.

## What changed

- `adapters/request-prune.mjs`
  - exports a current-turn already-served marker;
  - detects whether the incoming messages already contain a historical full
    `<freshctx>` frame;
  - gates the new collapse path to true later turns only: more than one user
    message, no historical FreshCtx frame, no omissions, and every selected unit
    already acknowledged in `lastInjectedRevision`.
- `adapters/pi/replay.mjs` and `adapters/pi/extension.ts`
  - reuse the existing apply-acknowledged delivery state from PCR 0087;
  - emit the short current already-served marker instead of a full live envelope
    on the unchanged request-only re-project path;
  - keep the full body when a historical `<freshctx>` frame is already present,
    so PCR 0092 still owns that path;
  - keep the full body again after disk changes.
- `adapters/hermes/bridge.mjs`
  - applies the same request-only collapse rule on Hermes' `select_context()`
    path.
- `test/pcr-0093-live-reproject-failclose.test.mjs`
  - adds the failing official-shape replay board for Pi and Hermes:
    1. turn 1 tool result is OLD while disk is already NEW;
    2. the applied turn serves NEW once;
    3. turn 2 re-projects from the original request-only transcript while disk is
       unchanged and must emit only an already-served marker;
    4. turn 3 changes disk again and must serve NEWER once.

No core projector, engine, metrics, benchmark fixture, gold label, score weight,
door blob, or repo lock changed.

## Test-first evidence

Before the fix, the new Pi and Hermes boards both failed red on the same check:
turn 2 still emitted the full NEW body instead of the already-served marker.

Pi failure:

```text
The input did not match the regular expression /\[freshctx:already-served units=1\]/u.
```

Hermes failed on the same assertion in the same new test file.

## Replay proof

Measured on this branch from the same three-turn request-only replay board locked
in `test/pcr-0093-live-reproject-failclose.test.mjs`:

```json
{
  "pi": {
    "turn1ProjectionBytes": 746,
    "turn2ProjectionBytes": 99,
    "turn3ProjectionBytes": 762,
    "turn2SkipEligibleSelections": 1,
    "turn2AlreadyServedMarkers": 1,
    "turn2NewCopies": 0,
    "turn3NewerCopies": 1,
    "turn3OldNewCopies": 0
  },
  "hermes": {
    "turn1ProjectionBytes": 746,
    "turn2ProjectionBytes": 99,
    "turn3ProjectionBytes": 762,
    "turn2SkipEligibleSelections": 1,
    "turn2AlreadyServedMarkers": 1,
    "turn2NewCopies": 0,
    "turn3NewerCopies": 1,
    "turn3OldNewCopies": 0
  }
}
```

Interpretation:

- turn 1 serves NEW current bytes once;
- turn 2 is the missing official-shape path: no replayed historical `<freshctx>`
  frame, disk unchanged, one already-served marker, zero full NEW copies, 746 B
  down to 99 B;
- turn 3 changes disk again and serves NEWER once, with no replay of the older
  NEW body.

That is the fail-close shape the user asked for.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0079-stateless-request-bodies.test.mjs test/pcr-0087-skip-after-discard.test.mjs test/pcr-0092-later-turn-projection-replay.test.mjs test/pcr-0093-live-reproject-failclose.test.mjs` | yes | 0 | 9 passed, 0 failed |
| `npm test` | yes | 0 | 295 total; 273 passed; 22 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |
| `npm run papers:verify` | no (first try) | 1 | cache absent: missing `papers/cache/corvus-2026.pdf` |
| `npm run papers:fetch && npm run papers:verify` | yes | 0 | required corpus fetched and verified; manifest sha256 `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89` |

## Metric snapshot

| metric | PCR 0092 | PCR 0093 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `0` |
| deterministic hash agreement | `1.0` | `1.0` | `0` |
| `npm test` total | `293` | `295` | `+2` |
| `npm test` passed | `271` | `273` | `+2` |
| `npm test` skipped | `22` | `22` | `0` |
| paper-manifest digest | `442cd9e2…` | `442cd9e2…` | `0` |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | `0` |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `0` |

## Scope and limits

This change is adapter-only and narrower than the old PCR 0077 path.

- It does **not** change core rendering or the ctxbench metric surface.
- It does **not** fire when the incoming messages already replay a historical full
  `<freshctx>` frame. That path remains PCR 0092.
- It does **not** fire on the first request, on discarded requests, or on the
  single-user-message stateless boards from PCR 0079 and PCR 0087.
- It does **not** include a live Pi or Hermes measurement on this branch. The
  branch proves the official-shape replay board locally and leaves live provider
  cost as a separate measurement step.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only live re-project repair. The missing wire was a request-only
later-turn seam that 0092 could not see because the host did not replay the
earlier transformed frame.

## Next experiment

Run one official Pi request capture on the exact later-turn cost board that
motivated this PCR, but still without live Hermes, to confirm the local replayed
99 B already-served envelope matches the host-shaped request JSON on the wire.
