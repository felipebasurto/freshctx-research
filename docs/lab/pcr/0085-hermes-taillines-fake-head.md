# PCR 0085 — Hermes tailLines first-inject stores and serves the real tail

- Date (UTC): 2026-08-27
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0085-hermes-taillines-d39d` (draft PR)
- Commit: (this commit)
- Merge-base: `a71d24f1155f37d897113d71859a33278e2ba96e` (`main` @ PCR 0082 base)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

Hermes `tailLines` region reads must be persisted and projected as the observed
tail span on first inject. The adapter must not mint a fake head identity
(`1-3`) for a tail payload that actually occupies the file tail (`3-5` in the
newline-counted fixture).

This is adapter-only. `DEFAULT_BUDGET_CHARS` stays `32768`. Dumps stay as-is.
Door and lock stay frozen. No `persist-38`, no `lastInjectedRevision`, no 0077
restore, no gold/weight/threshold edits.

Not a paper result. Not SOTA. Gold language-agnostic.

### Door / lock (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Test-first evidence

On the clean `a71d24f1` base, the new PCR 0085 replay failed in two ways:

1. `observeTurn()` persisted the `call-tail` read as `{ path, scope: "region" }`
   with no tail span, so later tracking minted the unit from a fake head range.
2. First inject projected the right bytes but under the fake-head unit ID
   `fc_8c0e0e75552d31d9` (`startLine=1`, `endLine=3`) instead of the true tail
   ID `fc_c1a65d7cd4ec406c` (`startLine=3`, `endLine=5`).

After the bridge change, the targeted PCR 0085 tests passed and the nearby
Hermes replay boards still passed unchanged.

## Change

`adapters/hermes/bridge.mjs` now:

- preserves `tailLines` metadata from Hermes read-tool arguments;
- resolves `tailLines` against the observed tool payload span plus current file
  line count before `trackRead()` mints the unit ID;
- exempts explicit `tailLines` tails from the offset/limit EOF whole-file clamp;
- persists normalized tail span metadata into both `state.calls` and
  `state.tracked` so later turns reuse the real tail identity.

No projector, policy, benchmark, dump, or door logic changed.

## Replay

Hermes tailLines first inject now stores and serves the tail as a tail:

```json
{
  "storedCall": {
    "path": "ws/tail.txt",
    "scope": "region",
    "startLine": 3,
    "endLine": 5,
    "tailLines": 2
  },
  "storedTracked": {
    "path": "ws/tail.txt",
    "content": "line3 tailA\nline4 tailB\n",
    "scope": "region",
    "startLine": 3,
    "endLine": 5,
    "tailLines": 2,
    "observedFileLineCount": 5
  },
  "projection": {
    "id": "fc_c1a65d7cd4ec406c",
    "path": "ws/tail.txt",
    "lines": "3-5"
  },
  "payloadHasHead": false,
  "payloadHasTail": true
}
```

The old fake-head ID `fc_8c0e0e75552d31d9` is absent from the fixed payload.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0085-hermes-taillines-fake-head.test.mjs` | yes | 0 | 2 passed, 0 failed |
| `node --test test/hermes-adapter.test.mjs test/hermes-bridge.test.mjs test/pcr-0070-no-over-promote.test.mjs test/pcr-0078-cat-tracked-read.test.mjs test/pcr-0082-truthful-omitted-dump-marker.test.mjs` | yes | 0 | 42 passed, 0 failed |
| `npm test` | yes | 0 | 270 total; 248 passed, 22 skipped, 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |

## Metric snapshot

| metric | PCR 0082 | PCR 0085 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| `npm test` total | 268 | 270 | +2 |
| `npm test` passed | 246 | 248 | +2 |
| `npm test` skipped | 22 | 22 | 0 |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | 0 |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | 0 |
| `DEFAULT_BUDGET_CHARS` | 32768 | 32768 | 0 |

## Scope and limits

This PCR fixes Hermes replay identity/state only. It does not widen the read
surface beyond explicit `tailLines`, and it does not alter Pi behavior, shell
dump handling, selection policy, or metric formulas.

The newline-counted tail span remains host-format-specific: the observed
payload's terminating newline still contributes the final `5` in `lines="3-5"`.
That is existing projector behavior, not a new rule in this PCR.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only. Door, lock, budget cap, dumps, score, and ctxbench
payload stayed fixed.

## Next measurement

Replay a Hermes `tailLines` tail after an interior mutation above the tail and
confirm the stored tail identity remains stable while refreshed bytes stay
current.
