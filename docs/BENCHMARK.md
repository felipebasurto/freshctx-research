# Benchmark quick guide

The normative protocol is [EVALUATION.md](EVALUATION.md). This page explains the
current executable subset.

## Commands

```bash
node --test
node bench/run.mjs
node bench/ctxbench.mjs
node autoresearch/evaluate.mjs
```

`bench/run.mjs` compares four deterministic request shapes on one synthetic
interior-edit fixture:

- append-only without a re-read;
- append-only with a re-read;
- CORVUS-shaped whole-file synchronization;
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
```

The paper command generates `papers/papers.lock.json`. The repository command
resolves public refs and generates `bench/repos.lock.json`. Review and commit
both locks when freezing an experiment. Re-running with moving refs without a
new benchmark version invalidates comparison.

## Result labels

- `synthetic`: embedded files and mutations;
- `replay`: frozen host/message trace, no repository checkout;
- `public-repo`: trace over an immutable public repository commit.

No label implies that an agent solved a task better. CtxBench evaluates the
context payload only.
