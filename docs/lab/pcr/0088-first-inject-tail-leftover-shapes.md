# PCR 0088 — Hermes first-inject tail identity fail-closes leftover tail shapes

- Date (UTC): 2026-08-27
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0088-first-inject-tail-identity-8aaf` (draft PR #83)
- Commit: (this commit)
- Merge-base: `da817941bd84e061b95f1bf105e47e225f04050b` (`main` @ PCR 0087 squash of PR 82)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

Hermes `tailLines` first inject must assign `startLine` / `endLine` only when
the observed bytes exactly equal the current EOF slice implied by the requested
`tailLines` count. Leftover shapes that merely fit somewhere near EOF must fail
closed and must not mint an EOF tail identity.

This closes the residual left by PCR 0086 for:

- undersized tail payloads;
- middle slices that still end at EOF;
- extra-newline tail payloads.

It must not regress:

- the correct-size first-inject `3-5` tail board from PCR 0085;
- the PCR 0086 wrong-sized first-inject fail-close;
- the PCR 0085 insert-above later-turn fail-close.

Gold is language-agnostic: first/last, span, location, exact bytes. Not a
paper result. Not SOTA.

### Door / lock (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Hypothesis

PCR 0086 already proved that a wrong-sized first-inject tail payload must not
mint the EOF `3-5` identity, but the bridge still inferred the candidate tail
span from the observed payload's own line count. If Hermes instead derives the
candidate EOF span only from the requested `tailLines` count, and then compares
the observed bytes against that exact current EOF slice, undersized, middle, and
extra-newline leftovers will fail closed while the correct-size `3-5` tail
board and the later-turn insert-above fail-close remain green.

## Test-first evidence

The new failing board used the existing `tailLines: 2` request and replayed
three malformed first-inject payloads:

```text
undersized:
line4 tailB

middle:
line2 middle
line3 tailA
line4 tailB

extra-NL:
line3 tailA
line4 tailB

```

Before the fix, the undersized payload still minted a resolved current unit:

```text
<freshctx-unit ... lines="4-5" resolution="exact">
line4 tailB
```

That is the hole: the adapter accepted a leftover EOF-adjacent slice as though
it were the requested `tailLines: 2` tail.

## Change

`adapters/hermes/bridge.mjs` now derives the candidate EOF span for a
`tailLines` first-inject observation from the requested `tailLines` count alone:

- requested `tailLines: 2` on the fixture still points only at `lines="3-5"`;
- the bridge compares the observed bytes against that exact current EOF slice
  before assigning `startLine` / `endLine`;
- on mismatch, the observation is marked invalid and later forced unresolved,
  so it cannot mint any fake `3-5`, `4-5`, or `2-5` EOF identity;
- `src/anchors.mjs` stays untouched.

`test/pcr-0085-hermes-taillines-fake-head.test.mjs` adds one new fail-closed
board covering undersized, middle, and extra-NL leftovers in a single replay.

## Replay

### Board 1 — correct-size first inject still serves the real `3-5` tail

Observe:

```text
line3 tailA
line4 tailB
```

with `tailLines: 2`. Measured result stays:

```json
{
  "projection": {
    "path": "ws/tail.txt",
    "lines": "3-5"
  },
  "forbidden": {
    "fakeHeadIdentityMinted": false
  }
}
```

### Board 2 — wrong-sized first inject from PCR 0086 stays fail-closed

Observe:

```text
line1 head
line2 middle
line3 tailA
```

Measured result stays:

```json
{
  "projection": {
    "selected": 0,
    "unresolved": 1
  },
  "forbidden": {
    "tailIdentityLines": "3-5",
    "tailIdentityMinted": false
  }
}
```

### Board 3 — undersized, middle, and extra-NL first inject leftovers all fail closed

Measured result for all three malformed payloads:

```json
{
  "undersized": {
    "selected": 0,
    "unresolved": 1,
    "mintedTailIdentity": false
  },
  "middle": {
    "selected": 0,
    "unresolved": 1,
    "mintedTailIdentity": false
  },
  "extraNl": {
    "selected": 0,
    "unresolved": 1,
    "mintedTailIdentity": false
  }
}
```

No malformed first-inject leftover minted the EOF identity or served current
tail bytes.

### Board 4 — PCR 0085 insert-above later-turn fail-close stays green

Observe the original `3-5` tail, then mutate the file so the original tail
changes and an exact-copy decoy appears later at `6-8`. Measured result stays:

```json
{
  "projection": {
    "selected": 0,
    "unresolved": 1
  },
  "forbidden": {
    "laterDecoyLines": "6-8",
    "laterDecoyContentAccepted": false
  }
}
```

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0085-hermes-taillines-fake-head.test.mjs` | yes | 0 | 5 passed, 0 failed |
| `node --test test/hermes-adapter.test.mjs test/hermes-bridge.test.mjs test/pcr-0070-no-over-promote.test.mjs test/pcr-0082-truthful-omitted-dump-marker.test.mjs test/pcr-0083-official-omitted-read-loop.test.mjs test/pcr-0085-hermes-taillines-fake-head.test.mjs` | yes | 0 | 34 passed, 0 failed |
| `npm test` | yes | 0 | 280 total; 258 passed; 22 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |

## Metric snapshot

| metric | PCR 0087 before-row | PCR 0088 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| deterministic hash agreement | 1.0 | 1.0 | 0 |
| `npm test` total | 279 | 280 | +1 |
| `npm test` passed | 257 | 258 | +1 |
| `npm test` skipped | 22 | 22 | 0 |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | 0 |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | 0 |
| `DEFAULT_BUDGET_CHARS` | 32768 | 32768 | 0 |

## Scope and limits

This PCR is adapter-only and Hermes-only. It does not change Pi behavior,
`src/anchors.mjs`, benchmark fixtures, gold labels, score weights, thresholds,
held-out splits, `persist-38`, `v0.2`, or any `--relock` flow.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** The hole closed at the adapter seam. Door, lock, budget cap, score, and
ctxbench payload hash stayed fixed.

## Next measurement

Run the same leftover-shape board through one live host capture path to confirm
the replayed first-inject fail-close is identical at the adapter boundary, not
just in the pure-Node Hermes replay.
