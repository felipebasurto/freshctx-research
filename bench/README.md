# CtxBench implementation

This directory contains the executable part of the deterministic evaluation
contract in `docs/EVALUATION.md`.

- `run.mjs`: `npm run bench` entry. Runs the physical EmpiricalVerdict
  board once and prints the verdict without enforcing it. Not the default
  `npm run evaluate` gate.
- `ctxbench.mjs`: synthetic in-memory region-refresh fixture plus the
  100-repetition latency board. There is no `fixture.mjs`.
- `empirical-verdict.mjs`: physical-pack evaluate record (ISE vs CORVUS).
- `smoke.mjs`: public-repo smoke control board (`npm run ctxbench:smoke`).
- `holdout.mjs`: public-repo holdout slice board (`npm run ctxbench:holdout`).
- `pi-smoke.mjs`, `pi-holdout.mjs`, `pi-trace-runner.mjs`: Pi adapter replay boards (`npm run ctxbench:pi-smoke`, `npm run ctxbench:pi-holdout`).
- `hermes-smoke.mjs`, `hermes-holdout.mjs`, `hermes-trace-runner.mjs`: Hermes adapter replay boards (`npm run ctxbench:hermes-smoke`, `npm run ctxbench:hermes-holdout`).
- Combined adapter holdout: `npm run ctxbench:adapters-holdout` (`bench/adapters-holdout.mjs`).
- `trace-runner.mjs`, `baselines.mjs`, `corvus.mjs`, `oracle.mjs`, `workspace.mjs`: deterministic trace replay.
- `traces/smoke/`: frozen Flask and Express smoke traces pinned to `repos.lock.json`.
- `traces/holdout/`: first holdout v0.1 slice (go-tools + neovim); unsealed on commit.
- `traces/lab/`: development-pack traces live under `bench/traces/lab`.
- `generate-symbol-pack.mjs`: disposable symbol-scope development pack (`npm run ctxbench:symbol-pack`). Gold spans come from `independent-symbols.mjs`. Not a holdout pack.
- `corpus-split.json`: preregistered smoke/train vs holdout split.
- `reports/latest.md`: generated baseline comparison table (`public-repo-smoke` label).
- `trace.schema.json`: versioned trace data contract.
- `repos.manifest.json`: public source corpus before commit resolution.
- `repos.lock.json`: generated freeze file; absent until repositories are
  fetched and deliberately locked.
- `repos/`: ignored local detached checkouts.

Benchmark code, gold data, trace schemas, and score logic are protected from the
autoresearch search surface. Changing any of them requires a benchmark version
bump or a documented compatibility-preserving correction.
