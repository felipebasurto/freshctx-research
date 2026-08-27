# PCR 0087 — fail-closed apply promotion and skip check

- Date (UTC): 2026-08-27
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0087-skip-after-discard-01a1` (draft PR #82)
- Commit: (this commit)
- Merge-base: `7c57380476e3344d0cffdcd41fa77d0488b307f8` (`origin/main` @ PCR 0086 squash of PR 81)
- Paper-manifest digest: unchanged (not a research change)
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

If turn 1 would inject NEW current bytes but the host discards that request-only
projection or otherwise continues on the original fail-open path, turn 2 must
not treat that attempted inject as delivered. It must send the selected current
bytes again, and it must not leave the model on the old tool-result bytes.

This PCR scopes only that skip-after-discard hole. It does **not** restore PCR
0077's general skip-unchanged behavior, does **not** reopen `persist-38`, and
does **not** touch `src/anchors.mjs`.
`DEFAULT_BUDGET_CHARS` stays `32768`. `AUTORESEARCH_SCORE` stays `89.107165`.
The ctxbench payload digest stays
`697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`.

Gold is language-agnostic: first/last, span, location, exact bytes. Not a
paper result. Not SOTA.

### Door / lock (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Hypothesis

PCR 0079 made provider requests stateless and byte-exact, but it also deleted
the runtime `lastInjectedRevision` state entirely. Review required a product
closure for the original write-before-apply hole, plus proof that the state is
actually consulted on the next turn without restoring 0077 body-skipping. The
smallest adapter-only fix is to reintroduce that state behind an explicit
apply acknowledgement:

- Pi may promote only from the actual `before_provider_request` payload;
- Hermes may promote only from the next `on_turn_complete` write after a
  successful `select_context`, and only when the projection text is still in
  the turn-complete messages.

A discarded or fail-open turn-1 NEW projection must therefore leave
`lastInjectedRevision` empty on turn 2, keep Hermes promotion fail-closed on
OLD persisted messages, and make the turn-2 skip check read `0` rather than
`1`, while the request itself still carries the NEW bytes.

## Change

`adapters/pi/replay.mjs` and `adapters/pi/extension.ts` now:

- keep `pendingInjectedRevision` separate from `lastInjectedRevision`;
- record pending selected revisions during `context`;
- promote to `lastInjectedRevision` only when the actual outgoing Pi payload
  still contains the FreshCtx projection in `before_provider_request`.
- compute a check-only `skipEligibleSelections` count from
  `lastInjectedRevision`, but still send full bytes even when the count is nonzero.

`adapters/hermes/bridge.mjs` now:

- preserves a versioned delivery state for this PCR only;
- writes `pendingInjectedRevision` during `selectContext`;
- promotes `pendingInjectedRevision` to `lastInjectedRevision` only inside
  `observeTurn`, which Hermes reaches after the prior request actually ran, and
  only when the pending projection text is still present in the messages;
- clears pending fail-closed when `on_turn_complete` receives OLD persisted
  messages without the projection, so OLD bytes cannot mint `lastInjectedRevision`;
- computes the same check-only `skipEligibleSelections` count from
  `lastInjectedRevision`.
- still drops legacy unversioned `lastInjectedRevision` state from PCR 0077.

Tests:

- `test/pcr-0087-skip-after-discard.test.mjs` now exercises the write-before-
  apply state transition directly;
- `test/pcr-0079-stateless-request-bodies.test.mjs` now expects Hermes to keep
  bodies stateless while persisting only a pending, not applied, revision map.

No projector or core rendering logic changed. There is still no general
skip-unchanged path.

## Two-turn discard board

Board shape:

1. persisted transcript contains one official whole-file read whose tool-result
   body is OLD;
2. workspace bytes are already NEW before `context` / `select_context`;
3. turn 1 produces a request-only projection containing NEW;
4. that transformed request is intentionally discarded, so turn 2 reuses the
   same stale persisted transcript;
5. before apply acknowledgement, `lastInjectedRevision` must still be empty and
   a pending map must exist;
6. on Hermes, `on_turn_complete` fed only OLD persisted messages must not mint
   `lastInjectedRevision`;
7. turn 2 must still inject NEW, must inject it exactly once, and must not show
   OLD or `unchanged="true"`;
8. the turn-2 skip check must read `0`, proving discarded NEW did not
   authorize a skip;
9. after an apply acknowledgement, `lastInjectedRevision` may move from `0` to
   `1`, and the turn-3 skip check may read `1` while full NEW bytes are still
   sent.

Measured result:

```json
{
  "pi": {
    "turn1SkipEligible": 0,
    "turn2SkipEligible": 0,
    "turn3SkipEligible": 1,
    "lastInjectedBeforeApply": 0,
    "pendingBeforeApply": 1,
    "lastInjectedAfterApply": 1,
    "turn2NewCopies": 1,
    "turn2OldCopies": 0,
    "turn2ProjectionBytes": 1299,
    "turn3NewCopies": 1,
    "turn3UnchangedAttr": false
  },
  "hermes": {
    "turn1SkipEligible": 0,
    "turn2SkipEligible": 0,
    "turn3SkipEligible": 1,
    "lastInjectedAfterOldPersistedTurnComplete": 0,
    "pendingAfterOldPersistedTurnComplete": 0,
    "lastInjectedAfterAppliedTurn": 1,
    "pendingAfterAppliedTurn": 0,
    "turn2NewCopies": 1,
    "turn2OldCopies": 0,
    "turn2ProjectionBytes": 1299,
    "turn3NewCopies": 1,
    "turn3UnchangedAttr": false
  }
}
```

That board closes the runtime hole: turn 1 may stage one pending injected
revision, but it does not mint an applied `lastInjectedRevision` until the host
acknowledges the transformed request. Hermes now requires the projection text in
the turn-complete messages before promoting. A discarded turn-1 inject
therefore does not grant a turn-2 skip, OLD persisted messages do not mint
`lastInjectedRevision`, and the request does not fall back to the old
tool-result bytes.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0079-stateless-request-bodies.test.mjs test/pcr-0087-skip-after-discard.test.mjs` | yes | 0 | 5 passed, 0 failed |
| `npm test` | yes | 0 | 279 total; 257 passed; 22 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |

## Metric snapshot

| metric | PCR 0086 before-row | PCR 0087 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| deterministic hash agreement | 1.0 | 1.0 | 0 |
| `npm test` total | 278 | 279 | +1 |
| `npm test` passed | 256 | 257 | +1 |
| `npm test` skipped | 22 | 22 | 0 |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | 0 |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | 0 |
| `DEFAULT_BUDGET_CHARS` | 32768 | 32768 | 0 |

## Scope and limits

This PCR does not restore 0077's body-skipping projector path. It restores only
an apply-acknowledged delivery-state path plus a check-only skip predicate.
Even when `skipEligibleSelections` becomes `1` after an acknowledged apply, the
projection still sends full current bytes.

No projector, policy, benchmark fixture, gold label, score weight, threshold,
holdout split, or lock file changed.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only runtime fix. Door, lock, budget cap, score, and ctxbench
payload hash stayed fixed.

## Next measurement

Run the same discard board against one real host capture path that preserves the
original persisted transcript, to confirm the replayed invariant matches the
live adapter seam without changing the product files from PCR 0086 / PR 81.
