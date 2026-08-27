# PCR 0086 — Hermes first-inject tail identity fail-closes wrong-sized tail payloads

- Date (UTC): 2026-08-27
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0086-first-inject-tail-identity-2602` (draft PR #81)
- Commit: (this commit)
- Merge-base: `48309b20b0e1dd2025c963c313ffe5bce85b093d` (`main` @ 0083 + 0084 + 0085 base)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (stay draft; do not merge)

## Invariant

Hermes `tailLines` first inject must not assign `endLine=fileLineCount` unless
the observed payload exactly matches that EOF tail span. A wrong-sized first-
inject payload must fail closed and must not mint an EOF tail unit identity.

This PCR is adapter-only and Hermes-only. It does **not** weaken the existing
0085 later-turn fail-close on line-count-shifted tail units. Dumps stay as-is.
`DEFAULT_BUDGET_CHARS` stays `32768`. `AUTORESEARCH_SCORE` must stay
`89.107165`. The ctxbench payload digest must stay
`697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`.

Gold is language-agnostic: first/last, span, location, exact bytes. Not a paper
result. Not SOTA.

### Door / lock (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| Lock (`bench/repos.lock.json`) | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Hypothesis

If Hermes verifies a `tailLines` observation against the actual file tail before
assigning an EOF span, then a wrong-sized first-inject payload will fail closed
instead of minting an EOF identity, while a correct-size tail payload will still
track and serve as the real `3-5` tail and 0085's later-turn line-count-shift
guard will stay green.

## Test-first evidence

The new failing board used the same `tailLines: 2` request as PCR 0085 but fed a
wrong-sized first-inject payload:

```text
line1 head
line2 middle
line3 tailA
```

Before the fix, Hermes projected that payload as a resolved unit on first
inject, matching it at the file head and selecting:

```text
lines="1-4" resolution="exact"
```

That board failed because the adapter minted and served a current unit from a
payload that was not the file tail requested by `tailLines`.

## Change

`adapters/hermes/bridge.mjs` now:

- verifies a `tailLines` observation against the exact current EOF slice before
  assigning `startLine`/`endLine`;
- marks wrong-sized first-inject `tailLines` observations as invalid rather than
  minting an EOF tail span from line counts alone;
- fail-closes those invalid observations after refresh so first inject produces
  `selected="0"` and `unresolved="1"` instead of serving a fake current unit;
- preserves previously normalized stored tail spans when raw replay messages are
  re-enriched, so the existing 0085 later-turn `failClosedTailLineShiftedUnits`
  check still sees the original stored identity.

No projector, policy, benchmark, dump, or door logic changed. `src/anchors.mjs`
is untouched.

## Replay

### Board 1 — correct-size first inject still stores and serves the real tail

Observe:

```text
line1 head
line2 middle
line3 tailA
line4 tailB
```

with `tailLines: 2` and tool payload:

```text
line3 tailA
line4 tailB
```

Measured result:

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
    "path": "ws/tail.txt",
    "lines": "3-5"
  }
}
```

The fake-head identity derived from `1-3` remains absent.

### Board 2 — wrong-sized first inject fails closed and does not mint an EOF tail identity

Observe the same file with `tailLines: 2`, but return the wrong-sized payload:

```text
line1 head
line2 middle
line3 tailA
```

Measured result:

```json
{
  "projection": {
    "selected": 0,
    "unresolved": 1
  },
  "forbidden": {
    "tailIdentityLines": "3-5",
    "tailIdentityMinted": false,
    "headContentServed": false
  }
}
```

The first-inject request contains no EOF tail unit ID and serves no current body
from that wrong-sized payload.

### Board 3 — existing 0085 insert-above later-turn fail-close stays green

Observe the original `3-5` tail, then mutate the file so the original tail
changes and an exact-copy decoy appears later at `6-8`. Measured result remains:

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

PCR 0086 does not weaken the 0085 later-turn fail-close.

## Verification

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0085-hermes-taillines-fake-head.test.mjs` | yes | 0 | 4 passed, 0 failed |
| `node --test test/hermes-adapter.test.mjs test/hermes-bridge.test.mjs test/pcr-0070-no-over-promote.test.mjs test/pcr-0082-truthful-omitted-dump-marker.test.mjs test/pcr-0083-official-omitted-read-loop.test.mjs test/pcr-0085-hermes-taillines-fake-head.test.mjs` | yes | 0 | 33 passed, 0 failed |
| `npm test` | yes | 0 | 278 total; 256 passed; 22 skipped; 0 failed |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; hard gates all true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; deterministic hash agreement `1` |

## Metric snapshot

| metric | PCR 0085 before-row | PCR 0086 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| deterministic hash agreement | 1.0 | 1.0 | 0 |
| `npm test` total | 277 | 278 | +1 |
| `npm test` passed | 255 | 256 | +1 |
| `npm test` skipped | 22 | 22 | 0 |
| door blob | `f8771c93894095348185ef3453a3c2498355b3c6` | `f8771c93894095348185ef3453a3c2498355b3c6` | 0 |
| lock blob | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` | 0 |
| `DEFAULT_BUDGET_CHARS` | 32768 | 32768 | 0 |

## Scope and limits

This PCR only closes the first-inject Hermes tail-identity hole for wrong-sized
payloads. It does not change Pi behavior, shell dump handling, selection policy,
metric formulas, benchmark fixtures, gold labels, score weights, or holdout
data.

The newline-counted `3-5` tail span remains the existing host-format behavior
for this fixture. PCR 0086 only requires the observed bytes to actually match
that tail span before the adapter mints the EOF identity.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only. Door, lock, budget cap, score, and ctxbench payload hash
stayed fixed.

## Next measurement

Replay additional malformed `tailLines` payload shapes (undersized tail, middle
slice, duplicated trailing newline) and confirm they all fail closed without
minting an EOF identity while the real-tail first-inject board remains `3-5`.
