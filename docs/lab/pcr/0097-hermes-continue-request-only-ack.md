# PCR 0097 — Hermes `--continue` later turn apply-ack without persisted projection text

- Date (UTC): 2026-08-28
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0097-hermes-continue-76a4` (draft PR, this branch)
- Commit: (this commit)
- Merge-base: `7ee568f65ed2c947fce9c9cbbad7580593fefece` (PCR 0096 squash)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `hermes-fresh`; `adapter-only`; `host-contract`
- Decision: **review** (stay draft; do not merge)

## Invariant

On the official Hermes installed path (`hermes chat --continue SESSION` class),
when disk stays unchanged after a prior turn already served live bytes, later
turns must collapse to the short `[freshctx:already-served units=1]` marker
instead of re-sending the full `<freshctx>` envelope.

Hermes `select_context()` output is request-only: the projection user message is
not persisted in the session transcript. Apply-ack promotion must therefore
recognize delivery when the persisted transcript shows an assistant follow-through
after the tracked read, not only when the projection text appears in
`on_turn_complete()` messages.

Single-user fail-closed boards stay full-body:

- PCR 0079 still requires one current body in every stateless request.
- PCR 0087 still refuses to mint skip authority from a discarded turn.
- PCR 0089 omitted-read reread loops stay honest.

Door and lock stay frozen:

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

No live Pi or Hermes run. No `persist-38`. No `v0.2`. No `--relock`.

## Investigation conclusion

The user's `conversation_messages` hypothesis did **not** survive file-level
inspection as the primary root cause on the locked host at
`999703fd43ab6d75c4a5c7bc8b610dd73ecece76`:

- `_apply_context_engine_selection()` always passes full persisted `messages`
  as `conversation_messages` into `engine.select_context(...)`.
- PCR 0095 and PCR 0096 already wired that host field through the plugin.

The live leftover named in scope is narrower:

- Hermes never persists request-only projection text in the transcript.
- PCR 0087 promotion in `observeTurn()` only fired when
  `pendingProjectionText` was still present in the finalized messages.
- On a real completed turn, persisted history is `read + user + assistant`
  without the projection frame.
- That left `lastInjectedRevision` empty, so 0093/0095 skip eligibility stayed
  at `0` and later turns re-sent the full envelope even though the provider had
  already seen the live bytes.

Measured live cost board (0096 install path, unchanged disk, user-reported):

| arm | t2+ bytes/chars | later proj | already-served markers |
|---|---|---|---|
| WITH FreshCtx | 75517 / 17776 | 547 | 0 |
| WITHOUT | 73156 / 17137 | n/a | n/a |

That pattern matches “bridge runs on turn 1, skip never arms on later turns,”
not a silent no-op.

First-pass 0097 request-only ack used `assistantFollowsTrackedRead()`, which
matched any tool result plus a later assistant anywhere in the transcript.
That reopened PCR 0087 on `--continue`: leftover `pendingInjectedRevision`
could commit from prior-session tool+assistant even when **this** turn's
projection was discarded. Reviewer no-merge correctly flagged the hole; the
scoped `pendingAckAfterUserIndex` gate closes it.

## What changed

- `adapters/hermes/bridge.mjs`
  - adds request-only apply-ack via `assistantCompletesUserTurn()` scoped to
    `pendingAckAfterUserIndex` recorded at `selectContext()` time;
  - promotes `pendingInjectedRevision` only when an assistant completes **this
    pending user turn**, not when older history already contains tool+assistant;
  - keeps projection-text ack (PCR 0087) and omitted-read disposition promotion
    on projection-text ack (PCR 0089);
  - re-runs promotion at `selectContext()` start using `conversationMessages`.
- `test/pcr-0097-hermes-continue-request-only.test.mjs`
  - replay board: turn 1 apply-ack via assistant only (no projection in observe);
  - official-loader board: locked host loader + `_apply_context_engine_selection()`;
  - continue-leftover board: prior tool+assistant plus undelivered pending must
    not promote (`skipEligible=0`, full body on retry).

No Pi path changed. No second skip engine. No door or lock retune.

## Test-first evidence

Before the fix, a direct replay probe of the live ack shape failed:

```text
live ack path: skipEligible 0 collapsed false NEW copies 1
```

After the fix on the same probe:

```text
live ack path: skipEligible 1 collapsed true NEW copies 0
```

Continue-leftover board (would have been red on first-pass 0097):

```text
prior tool+assistant + undelivered pending + observe discard
→ retry skipEligible 0, full <freshctx> body, no already-served marker
```

## Host-contract proof

Measured on this branch from the official-loader board (Python host hook):

```json
{
  "turn1ProjectionBytes": 746,
  "turn2HostProjectionBytes": 99,
  "turn2RequestOnlyProjectionBytes": 746,
  "turn2HostNewCopies": 0,
  "turn2RequestOnlyNewCopies": 1,
  "hostCollapsed": true,
  "requestOnlyCollapsed": false
}
```

Interpretation:

- with full host history + request-only apply ack, later unchanged turn
  collapses from 746 bytes to 99 bytes;
- bare `engine.select_context(request_messages)` without conversation history
  still stays full-body by design (0095 gate);
- no full `PCR_0097_NEW_ON_DISK` body reappears on the host seam.

## Scope guard

Focused regression run:

- `test/pcr-0079-stateless-request-bodies.test.mjs`
- `test/pcr-0087-skip-after-discard.test.mjs`
- `test/pcr-0089-omitted-reread-loop.test.mjs`
- `test/pcr-0093-live-reproject-failclose.test.mjs`
- `test/pcr-0094-hermes-collapsed-ack.test.mjs`
- `test/pcr-0095-hermes-conversation-history.test.mjs`
- `test/pcr-0096-hermes-official-loader.test.mjs`
- `test/pcr-0097-hermes-continue-request-only.test.mjs`
- `test/hermes-plugin-layout.test.mjs`

Result: 15 passed, 0 failed.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0097-hermes-continue-request-only.test.mjs` | yes | 0 | red before fix on live ack replay probe |
| focused Hermes regression (0079/0087/0089/0093–0097/layout) | yes | 0 | 14 passed, 0 failed |
| `python3 -m py_compile adapters/hermes/__init__.py` | yes | 0 | plugin syntax ok |
| `npm run papers:verify` | yes | 0 | manifest sha256 `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89` |
| `npm test` | yes | 0 | 301 total; 284 passed; 17 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |
| `git hash-object src/anchors.mjs bench/repos.lock.json` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| live Pi / Hermes | skipped | n/a | explicitly out of scope; live cost numbers cited from user REPORT, not re-run here |

## Metric snapshot

| metric | PCR 0096 | PCR 0097 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| deterministic hash agreement | `1.0` | `1.0` | `0` |
| `npm test` total | `298` | `301` | `+3` |
| `npm test` passed | `281` | `284` | `+3` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |
| official host seam projection bytes | `746 -> 99` | `746 -> 99` | held |
| live WITH arm already-served (user) | `0` | not re-run | cited only |

## Scope and limits

This branch fixes adapter-side apply-ack for Hermes request-only projection
delivery. It does **not**:

- run a live `hermes chat --continue` session on this branch;
- change Pi behavior;
- change core policy, benchmark fixtures, gold labels, or score weights;
- claim live cost savings beyond the host-contract byte proof above.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only Hermes delivery-state repair on the existing continue /
request-only seam.

## Next experiment

When live Hermes is back in scope, re-run the original unchanged-disk cost board
and confirm WITH arm later turns report `already-served=1` and proj bytes drop
from ~547 to ~99 on unchanged post-apply turns.
