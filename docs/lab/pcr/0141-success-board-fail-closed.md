# PCR 0141 — Harness-only success board (fail-closed pass/fail)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0141-success-board-cb01` (draft)
- Base SHA: `dbfd044322570a03650c5f7f06dfacde36a1f63c`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `harness-only`; `synthetic`
- Decision: **review** (PR stays draft)

## Hypothesis or change

A later operator needs a small **task pass/fail** board from existing trial
asserts (`exact_current_bytes`, `stdout_current`) without inventing SWE
Pass@1. This leftover is that board only. Missing dump is **fail**, not
skip-as-pass. Official table stays **549/0/0/549**.
`measuredSweScores()` stays `null`.

## What we did

1. Added `docs/lab/success-board/` with pack, board scorer, run helper,
   SCOPE, and one tiny synthetic pack.
2. Arms are `nothing` / `freshctx-ts`, plus `freshctx-no-ts` because that
   arm is already in the host trial.
3. Pass requires later-turn `exact_current_bytes=yes` and `stdout_current=yes`.
4. Missing dump fail-closes. Turn-1 `n/a` alone is not a pass.
5. Added `test/pcr-0141-success-board.test.mjs`.
6. Did not edit `docs/lab/INDEX.md` (avoid colliding with PCR 0140),
   `docs/lab/METRICS.md`, README PCR counts, cost-ledger, `src/`, door, or lock.
7. Did not `--relock`. No apex or GHA work.
8. Did not include cost, provider token counts, or dollar figures.

## Arms

| arm | FreshCtx | Isolated Semantic Engine | scored asserts |
|---|---|---|---|
| `nothing` | no | n/a | `exact_current_bytes`, `stdout_current` |
| `freshctx-no-ts` | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off`) | same |
| `freshctx-ts` | yes | on (default factory; Tree-sitter when installed) | same |

Model remains `deepseek-v4-flash` only.
Host never exposes a Tree-sitter toggle.

## Benchmarks run

Canonical TAP from `node --test test/pcr-0141-success-board.test.mjs` on this HEAD:

```
1..10
# tests 10
# pass 10
# fail 0
# skipped 0
```

Living `npm test` TAP is recorded after this leftover's first full suite run.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0141-success-board.test.mjs` | yes | 0 | TAP above |
| `npm test` | pending | n/a | living suite after first commit |
| `npm run evaluate` | pending | n/a | harness-only; no policy, door, or lock edit |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |

## Metric snapshot

| metric | official `79958de` | PCR 0141 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0141 TAP `# tests` | n/a | **10** | leftover tests only |
| PCR 0141 TAP `# pass` | n/a | **10** | leftover tests only |
| PCR 0141 TAP `# fail` | n/a | **0** | leftover tests only |
| PCR 0141 TAP `# skipped` | n/a | **0** | `0` |
| SWE scores | n/a | `null` | do not invent |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

Synthetic board on this leftover (not a live host table):

```
host	arm	task	verdict	reason
pi	nothing	synthetic-mini-board-001	fail	assert-failed
pi	freshctx-no-ts	synthetic-mini-board-001	fail	missing-dump
pi	freshctx-ts	synthetic-mini-board-001	pass	exact-current-and-stdout
```

Do not invent `request_bytes` or Pass@1.

## Comparison

No Level 4 sentence.
Harness only.
Not a SWE-bench dump.
Not a CORVUS comparison.
Cited CORVUS SWE-PolyBench / SWE-Bench Pro numbers stay cited, not reproduced.

## Conflicts with constitutions

none observed.

## Limitations

`run.mjs` does not call a model.
The synthetic pack is labeled `synthetic` / `liveHost: false`.
A later live dump can feed the same asserts. Until that dump exists, missing
cells fail-close.
This leftover does not edit INDEX.
Official table is not replaced.
Not a paper result.

## Recommended next experiment

Feed a real later-turn dump into the same scorer.
Keep `measuredSweScores()` null until a measured SWE table exists.
Keep door and lock frozen. No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
