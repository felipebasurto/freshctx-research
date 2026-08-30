# PCR 0128 — Empirical evaluate pass checks required recall

- Date (UTC): 2026-08-30
- Author / agent: Cursor Grok 4.6
- Branch / PR: `feat/empirical-evaluate-verdict` / [125](https://github.com/felipebasurto/freshctx/pull/125) (draft)
- Merge-base: `ca72e033` (origin/main, PCR 0127 / PR 124)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `79e29d09a9ec12b1128617f683f50a35a3c8809e` (hold)
- Result labels used: `public-repo-smoke`; `measurement`
- Decision: **review** (draft, no merge)

## Hypothesis or change

PR 125 replaced `AUTORESEARCH_SCORE` with `EVALUATE_VERDICT`. The default
judge was `forensicHold && payloadDelta < 0`. `oracleRetention.recall` was
recorded and the test only asserted `recall > 0`. CI could go green with
broken required-current recall. Same class as PR 123's stale-bytes-only
hole, which PCR 0127 / PR 124 closed on the `--pack` path only.

`decideEmpiricalVerdict` now fails `required-recall` when
`requiredCount > 0` and `recall < 1`. PASS still also needs the other
forensic gates and a negative Isolated Semantic Engine vs CORVUS payload
delta.

PR 125 stays draft. This PCR does not merge it.

## What we did

Red test first: `decideEmpiricalVerdict` with `payloadDelta` −27440,
`recall` 0, `requiredCount` 1. Before the judge change that record is
PASS. After, `required-recall` is fail and the verdict is FAIL.

No edit to `src/anchors.mjs`, `src/policy.mjs`, `src/projector.mjs`, gold
labels, score weights, or sealed pack bytes.

## Architectural boundary

Harness only. `--pack` still uses `judgeOnDiskCapture` from PCR 0127.
Sealed `holdout-v0.2` cells were not opened.

## Benchmarks run

```
1..506
# tests 506
# pass 480
# fail 0
# skipped 26
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test --test-name-pattern='empirical PASS fails when required recall' test/empirical-evaluate.test.mjs` | yes | 0 | isolated GREEN after the judge change |
| `node --test test/empirical-evaluate.test.mjs` | yes | 0 | 5/5 |
| `npm test` | yes | 0 | TAP above. +5 vs PCR 0127 |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`; `public-repo-smoke`; recall 1; `required-recall` pass; payload delta −27440 |
| `holdout-v0.2` cells | no | n/a | not a remasure |

## Metric snapshot

| metric | origin/main `ca72e033` | this PCR | delta |
|---|---|---|---|
| `npm test` TAP `# tests` | 501 | **506** | **+5** |
| `npm test` TAP `# pass` | 475 | **480** | **+5** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| default evaluate printer | `AUTORESEARCH_SCORE=89.107165` | **`EVALUATE_VERDICT=PASS`** | scalar retired |
| default evaluate recall gate | unused (`> 0` only) | **`required-recall` must hold** | hole closed |
| recall-miss + negative delta | PASS | **FAIL** | judge now matches `--pack` |
| `src/anchors.mjs` / `repos.lock` | `f8771c93` / `79e29d09` | hold | 0 |

## Comparison

This is a harness judge fix on the default evaluate path. It is not a
Level 4 claim and not a sealed holdout remasure.

## Conflicts with constitutions

none observed.

## Limitations

- `requiredCount === 0` still holds `required-recall`. That matches
  `judgeOnDiskCapture` when `requiredUnits.length === 0`.
- GHA on this host may still be blocked by account spend limits.
- PR 125 remains draft.

## Next measurement

Do not merge 125 from this session. After review, one scheduled remasure
only. Do not hill-climb `src/` against holdout v0.2.
