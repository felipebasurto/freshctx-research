# PCR 0127 — On-disk evaluate pass checks required recall

- Date (UTC): 2026-08-30
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/evaluate-ondisk-recall-gate-0710`
- Merge-base: `fbdbc56` (origin/main, PCR 0125 / PR 122 after PCR 0126 / PR 123)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

## Hypothesis or change

PR 123 bound `--pack` and judged on-disk cells by `staleBytes === 0` only.
A pack that never projects required gold still printed `pass` when stale
bytes were zero. `bench/holdout.mjs` `hardGateFailures` already fails that
shape. The evaluate on-disk path did not.

`judgeOnDiskCapture` now fails on no capture, stale bytes, duplicate units,
or `requiredRecall < 1` when `requiredUnits.length > 0`. That is the same
order and the same conditions as `hardGateFailures`.

PR 123 is already on `main`. This PCR does not revert it. It patches the
judge. The pull request stays open for review and is not merged from this
session.

## What we did

Red test first: a temp pack reads `src/tracked.ts` and requires
`src/required.ts` (`REQUIRED_GOLD_SENTINEL`). Capture has `staleBytes` 0 and
`requiredRecall` below 1. Before the judge change that cell is `pass`.
After, verdict is `fail`, reason `required-recall`, and
`hardGates.fullRequiredRecall` is false.

No edit to `src/anchors.mjs`, `src/policy.mjs`, `src/projector.mjs`, Isolated
Semantic Engine parse logic, score weights, gold labels, or sealed pack
bytes.

## Architectural boundary

Harness only. `evaluate-pack.mjs` still does not import the holdout protocol
writer. Sealed `holdout-v0.2` cells were not opened.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test --test-name-pattern='on-disk pack pass requires required-current recall' test/evaluate-pack.test.mjs` | yes | 0 | isolated GREEN after the judge change |
| `node --test test/evaluate-pack.test.mjs test/evaluate.test.mjs` | yes | 0 | 6 evaluate-pack tests |
| `npm test` | pending in this PCR write | | TAP filled after the full run |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; label `synthetic` |
| `holdout-v0.2` cells | no | n/a | not a remasure |

## Metric snapshot

| metric | origin/main `fbdbc56` | this PCR | delta |
|---|---|---|---|
| default evaluate `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | 0 |
| default evaluate label | `synthetic` | `synthetic` | 0 |
| on-disk recall-miss verdict | `pass` | **`fail` / `required-recall`** | judge now matches holdout |
| `src/policy.mjs` / evaluate weights / holdout gold | untouched | untouched | 0 |

## Comparison

This is a harness judge fix. It is not a Level 4 claim and not a sealed
holdout remasure.

## Conflicts with constitutions

none observed.

## Limitations

- The registered symbol pack still judges through `goldInPayload` / Isolated
  Semantic Engine rows, not `judgeOnDiskCapture`.
- Pack split `requiredRecallMin` is still unused here. The judge follows
  `hardGateFailures`, not the lab split floor. Many lab packs list
  `requiredRecallMin: 0`.
- `npm run evaluate -- --pack=holdout-v0.2` was not run. Cells that used to
  go green on stale-only pass may now fail. That is the hole the reviewer
  named.
- GHA on this host may still be blocked by account spend limits.

## Next measurement

One shot of `npm run evaluate -- --pack=holdout-v0.2` after this lands, to
see whether the sealed pack is green or red under the holdout-aligned judge.
Do not hill-climb `src/` against that pack.
