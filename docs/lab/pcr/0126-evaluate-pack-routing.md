# PCR 0126 — Bind evaluate `--pack` to a pack runner

- Date (UTC): 2026-08-30
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/evaluate-pack-routing-0710`
- Merge-base: `936ddf8` (origin/main, PCR 0124 / PR 121)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

## Hypothesis or change

`npm run evaluate -- --pack=<id>` ignored the flag and always printed the
synthetic `AUTORESEARCH_SCORE`. The CLI now parses `--pack` and routes it to
`bench/evaluate-pack.mjs`. No pack keeps `bench/run.mjs`.

## What we did

`parseEvaluateArgs` reads `--pack=<id>`. `runEvaluateBenchmark` calls
`runBenchmark()` when the flag is absent. A pack id goes to
`runPackEvaluation`. `symbol-scope-dev-v0.1` runs `runSymbolPack` with
`skipReportWrite: true`. Any other id loads `bench/packs/<id>/traces/` through
`runTrace` and does not write reports.

Pack results keep `score`, `label`, and `hardGates`. The pack `label` is never
`synthetic`. Pack `AUTORESEARCH_SCORE` is the cell pass rate. The synthetic
score formula and its weights were not edited.

Evaluate does not import the holdout freeze/run writer. A remasure cannot
rewrite sealed provenance.

No edit to `src/anchors.mjs`, `src/policy.mjs`, `src/projector.mjs`, or Isolated
Semantic Engine parse logic.

## Architectural boundary

Harness only. `src/` still does not import tree-sitter. Sealed
`holdout-v0.2` cells were not opened.

## Benchmarks run

Filled after the verification commands on this dest.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/evaluate-pack.test.mjs` | yes | 0 | `--pack` binds. Unknown pack throws. Default label `synthetic` |
| `npm test` | pending | | |
| `npm run evaluate` | pending | | must stay `AUTORESEARCH_SCORE=89.107165` |
| `npm run evaluate -- --pack=symbol-scope-dev-v0.1` | pending | | must not print label `synthetic` |
| `holdout-v0.2` cells | no | n/a | disposable pack only |

## Metric snapshot

| metric | origin/main `936ddf8` | this PCR | delta |
|---|---|---|---|
| default evaluate `AUTORESEARCH_SCORE` | `89.107165` | pending | |
| `--pack=symbol-scope-dev-v0.1` label | `synthetic` (flag ignored) | pending | |
| `src/policy.mjs` / evaluate weights / holdout gold | untouched | untouched | 0 |

## Comparison

This is a harness routing fix. It is not a Level 4 claim and not a sealed
holdout remasure.

## Conflicts with constitutions

none observed.

## Limitations

- Pack `AUTORESEARCH_SCORE` is a pass-rate scalar. It is not comparable to the
  synthetic 89.107165 formula.
- On-disk packs run `freshctx-region` only. Isolated Semantic Engine versus
  CORVUS stays the registered `symbol-scope-dev-v0.1` runner.
- Latency and RSS are stripped before the determinism compare on pack runs.
- `holdout-v0.2` routing exists as a traces directory load. This PCR did not
  execute those cells.

## Next measurement

A later one-shot may call `npm run evaluate -- --pack=holdout-v0.2` now that
the flag binds. Do not hill-climb `src/` against that pack.
