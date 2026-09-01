# PCR 0141 — Harness-only success board (fail-closed pass/fail)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0141-success-board-cb01` / [143](https://github.com/felipebasurto/freshctx/pull/143) (draft)
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
6. Appended INDEX and METRICS 0141 rows after PCR 0139 only. Did not rewrite
   0139. Did not add PCR 0140. Did not touch cost-ledger, `src/`, door, or lock.
7. Bumped public PCR count to 136 so living-docs matches on-disk PCR files.
8. Did not `--relock`. No apex or GHA work.
9. Did not include cost, provider token counts, or dollar figures.

## Arms

| arm | FreshCtx | Isolated Semantic Engine | scored asserts |
|---|---|---|---|
| `nothing` | no | n/a | `exact_current_bytes`, `stdout_current` |
| `freshctx-no-ts` | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off`) | same |
| `freshctx-ts` | yes | on (default factory; Tree-sitter when installed) | same |

Model remains `deepseek-v4-flash` only.
Host never exposes a Tree-sitter toggle.

## Benchmarks run

Canonical TAP from this HEAD after `npm test`.

```
1..617
# tests 617
# pass 574
# fail 43
# skipped 0
```

`node --test test/pcr-0141-success-board.test.mjs` on this HEAD:

```
1..10
# tests 10
# pass 10
# fail 0
# skipped 0
```

Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.
This-run living suite on `f99950e` is **617 / 574 / 43 / 0**. That print is
this Cloud Agent checkout, **not GHA**. Isolated Semantic Engine WASM is
missing here, so 42 fails print `isolated-semantic-engine-missing`.
The 43rd fail on `f99950e` was living-docs `136 !== 135` before INDEX/METRICS
and the public PCR count were appended. Official table is not replaced.

All 10 PCR 0141 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |

## Metric snapshot

| metric | official `79958de` | PCR 0141 (this-run) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP `# tests` | 549 | **617** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **574** | this checkout Isolated Semantic Engine WASM missing |
| `npm test` TAP `# fail` | 0 | **43** | this-run Cloud Agent; 42 `isolated-semantic-engine-missing` (WASM missing); 1 living-docs hold on `f99950e`; not GHA |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| evaluate | n/a on official table | hard gate failed on this-run TAP | official table not replaced |
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
This Cloud Agent checkout has no Isolated Semantic Engine WASM (Tree-sitter).
`npm test` on `f99950e` therefore printed `# pass 574` `# fail 43`.
That TAP is this-run Cloud Agent, not GHA.
INDEX and METRICS now have 0141 rows after 0139. Public PCR count is 136.
0139 rows were not rewritten. Cost-ledger was not touched.
Official table is not replaced.
Not a paper result.

## Recommended next experiment

Feed a real later-turn dump into the same scorer.
Keep `measuredSweScores()` null until a measured SWE table exists.
Keep door and lock frozen. No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
