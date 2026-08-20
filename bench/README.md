# CtxBench implementation

This directory contains the executable part of the deterministic evaluation
contract in `docs/EVALUATION.md`.

- `fixture.mjs`: current synthetic before/after source.
- `run.mjs`: baseline comparison.
- `ctxbench.mjs`: repeated correctness, determinism, and latency measurement.
- `trace.schema.json`: versioned trace data contract.
- `repos.manifest.json`: public source corpus before commit resolution.
- `repos.lock.json`: generated freeze file; absent until repositories are
  fetched and deliberately locked.
- `repos/`: ignored local detached checkouts.

Benchmark code, gold data, trace schemas, and score logic are protected from the
autoresearch search surface. Changing any of them requires a benchmark version
bump or a documented compatibility-preserving correction.
