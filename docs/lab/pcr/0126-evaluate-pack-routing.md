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

```
1..500
# tests 500
# pass 474
# fail 0
# skipped 26
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/evaluate-pack.test.mjs` | yes | 0 | `--pack` binds. Unknown pack throws. Default label `synthetic` |
| `npm test` | yes | 0 | TAP above. +5 vs PCR 0124 |
| `npm run check` | yes | 0 | includes `bench/evaluate-pack.mjs` |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; label `synthetic`; four hard gates true |
| `npm run evaluate -- --pack=symbol-scope-dev-v0.1` | yes | 0 | `AUTORESEARCH_SCORE=100.000000`; label `symbol-scope-dev`; `tracesExecuted` 2; `payloadBytesDelta` −5114 |
| `holdout-v0.2` cells | no | n/a | disposable pack only |

## Metric snapshot

| metric | origin/main `936ddf8` | this PCR | delta |
|---|---|---|---|
| `npm test` TAP `# tests` | 495 | **500** | **+5** |
| `npm test` TAP `# pass` | 469 | **474** | **+5** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| default evaluate `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | 0 |
| default evaluate label | `synthetic` | `synthetic` | 0 |
| `--pack=symbol-scope-dev-v0.1` label | `synthetic` (flag ignored) | **`symbol-scope-dev`** | flag binds |
| `--pack=symbol-scope-dev-v0.1` `AUTORESEARCH_SCORE` | `89.107165` (wrong fixture) | **`100.000000`** (pass rate) | not the synthetic formula |
| `--pack=symbol-scope-dev-v0.1` `tracesExecuted` | 0 | **2** | pack ran |
| ISE vs CORVUS `payloadBytesDelta` | −5114 (ctxbench:symbol-pack) | **−5114** | 0 |
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
