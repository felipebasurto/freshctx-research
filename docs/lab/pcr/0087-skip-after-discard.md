# PCR 0087 — skip-after-discard regression lock

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
0077's general skip-unchanged behavior, does **not** reopen `persist-38`, does
**not** add `lastInjectedRevision`, and does **not** touch `src/anchors.mjs`.
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

PCR 0079 already made provider requests stateless and byte-exact. If that rule
is truly enforced at the adapter boundary, then a discarded turn-1 NEW
projection cannot authorize a turn-2 skip. The smallest way to close the hole is
to lock that board in replay for both Pi and Hermes.

## Change

Added one regression suite:

- `test/pcr-0087-skip-after-discard.test.mjs`

No adapter or core behavior changed. The current base already satisfied the
invariant; this PCR makes the missing two-turn discard board executable so the
hole cannot re-enter silently.

## Two-turn discard board

Board shape:

1. persisted transcript contains one official whole-file read whose tool-result
   body is OLD;
2. workspace bytes are already NEW before `context` / `select_context`;
3. turn 1 produces a request-only projection containing NEW;
4. that transformed request is intentionally discarded, so turn 2 reuses the
   same stale persisted transcript;
5. turn 2 must still inject NEW, must inject it exactly once, and must not show
   OLD or `unchanged="true"`.

Measured result:

```json
{
  "pi": {
    "turn1NewCopies": 1,
    "turn2NewCopies": 1,
    "turn2OldCopies": 0,
    "turn2ProjectionBytes": 1299,
    "turn2UnchangedAttr": false
  },
  "hermes": {
    "stateUnchangedAcrossSelect": true,
    "turn1NewCopies": 1,
    "turn2NewCopies": 1,
    "turn2OldCopies": 0,
    "turn2ProjectionBytes": 1299,
    "turn2UnchangedAttr": false
  }
}
```

That board is the regression lock: a discarded turn-1 inject does not grant a
turn-2 skip, and the request does not fall back to the old tool-result bytes.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0087-skip-after-discard.test.mjs` | yes | 0 | 1 passed, 0 failed |
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

This PCR does not try to detect whether a host actually delivered a transformed
request. It enforces the smaller invariant that FreshCtx request assembly stays
stateless, so a discarded request cannot mutate future request content. If a
host discards turn 1, turn 2 still carries the selected current bytes.

No projector, policy, benchmark fixture, gold label, score weight, threshold,
holdout split, or lock file changed.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only regression lock. Door, lock, budget cap, score, and
ctxbench payload hash stayed fixed.

## Next measurement

Run the same discard board against one real host capture path that preserves the
original persisted transcript, to confirm the replayed invariant matches the
live adapter seam without changing the product files from PCR 0086 / PR 81.
