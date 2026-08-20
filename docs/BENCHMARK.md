# Benchmark quick guide

The normative protocol is [EVALUATION.md](EVALUATION.md). This page explains the
current executable subset.

## Commands

```bash
node --test test/*.test.mjs
node bench/run.mjs
node bench/ctxbench.mjs
node autoresearch/evaluate.mjs
```

`bench/run.mjs` compares four deterministic request shapes on one synthetic
interior-edit fixture:

- append-only without a re-read;
- append-only with a re-read;
- documented CORVUS whole-file synchronization (deviations in ADR 0003);
- FreshCtx region synchronization.

It reports freshness, duplication, current-code recall, estimated prompt size,
and a cache-prefix proxy. The result is labeled `synthetic`; it is useful for
regression and cannot support a public-repository or SOTA claim.

`bench/ctxbench.mjs` performs ten warmups and one hundred measured identical
runs. It reports exact-current correctness, payload hashes, projection bytes,
delta amplification proxy, prefix reuse, and p50/p95/p99 for refresh, rewrite,
projection, serialization, and total transformation. It makes no model call.

`autoresearch/evaluate.mjs` runs tests, executes the synthetic comparison twice,
requires byte-identical metrics, enforces hard correctness gates, and emits one
`AUTORESEARCH_SCORE=` value. That scalar exists only to sort cheap local
experiments; public reports use the Pareto metrics in `EVALUATION.md`.

## Corpus bootstrap

```bash
npm run papers:fetch
npm run papers:verify
npm run repos:fetch:smoke
npm run repos:verify
npm run ctxbench:smoke
npm run ctxbench:pi-smoke
```

The paper command generates `papers/papers.lock.json`. The repository command
resolves public refs and generates `bench/repos.lock.json`. Review and commit
both locks when freezing an experiment. Re-running with moving refs without a
new benchmark version invalidates comparison.

`npm run ctxbench:smoke` replays frozen Flask/Express traces across append-only,
observation-mask, the documented CORVUS whole-file reproduction (`corvus-file`),
FreshCtx file, and FreshCtx region baselines. It writes
`bench/reports/public-repo-smoke.jsonl`, `bench/reports/latest.md`, and appends
one measurement row to `autoresearch/results.tsv`. Results are labeled
`public-repo-smoke`; they are measurement infrastructure, not a performance
claim. The CORVUS baseline is not a reviewed paper reproduction; see
`docs/decisions/0003-corvus-reproduction-deviations.md`.

`npm run ctxbench:pi-smoke` replays the same traces through the Pi extension
replay harness (`adapters/pi/replay.mjs`) and writes `bench/reports/pi-smoke.md`.
See `docs/lab/pcr/0003-pi-smoke-capture.md`.

`npm run ctxbench:holdout` replays the first holdout slice (go-tools + neovim)
through the same five baselines as smoke and writes
`bench/reports/holdout.md`. Results are labeled `public-repo-holdout`.
Status: **unsealed-regression-development-pack** (legacy; predates freeze protocol).
See `docs/lab/pcr/0007-sealed-holdout-protocol.md` and PCR 0009.

New holdout packs MUST use the ordered pipeline:

```bash
npm run holdout:freeze -- --manifest=bench/splits/<pack>.json ...
# commit manifest
npm run holdout:generate -- --manifest=bench/splits/<pack>.json
npm run holdout:run -- --manifest=bench/splits/<pack>.json
npm run holdout:report -- --manifest=bench/splits/<pack>.json
```

## Result labels

- `synthetic`: embedded files and mutations;
- `replay`: frozen host/message trace, no repository checkout;
- `public-repo`: trace over an immutable public repository commit;
- `public-repo-smoke`: smoke control board (Flask/Express);
- `public-repo-holdout`: holdout slice board (go-tools/neovim); measurement only.

No label implies that an agent solved a task better. CtxBench evaluates the
context payload only.
