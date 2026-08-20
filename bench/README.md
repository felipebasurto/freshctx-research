# CtxBench implementation

This directory contains the executable part of the deterministic evaluation
contract in `docs/EVALUATION.md`.

- `fixture.mjs`: current synthetic before/after source.
- `run.mjs`: baseline comparison.
- `ctxbench.mjs`: repeated correctness, determinism, and latency measurement.
- `smoke.mjs`: public-repo smoke control board (`npm run ctxbench:smoke`).
- `pi-smoke.mjs`, `pi-trace-runner.mjs`: Pi adapter replay board (`npm run ctxbench:pi-smoke`).
- `hermes-smoke.mjs`, `hermes-trace-runner.mjs`: Hermes adapter replay board (`npm run ctxbench:hermes-smoke`).
- `trace-runner.mjs`, `baselines.mjs`, `corvus.mjs`, `oracle.mjs`, `workspace.mjs`: deterministic trace replay.
- `traces/smoke/`: frozen Flask and Express smoke traces pinned to `repos.lock.json`.
- `reports/latest.md`: generated baseline comparison table (`public-repo-smoke` label).
- `trace.schema.json`: versioned trace data contract.
- `repos.manifest.json`: public source corpus before commit resolution.
- `repos.lock.json`: generated freeze file; absent until repositories are
  fetched and deliberately locked.
- `repos/`: ignored local detached checkouts.

Benchmark code, gold data, trace schemas, and score logic are protected from the
autoresearch search surface. Changing any of them requires a benchmark version
bump or a documented compatibility-preserving correction.
