# Roadmap and Release Gates

The roadmap is ordered by evidence, not feature count. A milestone is complete
only when its exit gates pass and its limitations are documented.

## M0 — Invariant prototype

Status: included in this starter.

Deliverables:

- dependency-free Node core;
- stable unit and revision identity;
- whole-file and anchored-region refresh;
- conservative ambiguity behavior;
- deterministic budgeted selection and cache-aware order;
- exact in-memory revision recovery;
- synthetic benchmark, repeated timing runner, and autoresearch contract;
- Pi and Hermes integration scaffolds.

Exit gates:

- all local tests pass;
- current synthetic trace has zero stale bytes, exactly one current copy, full
  required recall, and deterministic hashes;
- README says prototype, not SOTA.

## M1 — CtxBench 0.1 corpus

Deliverables:

- fetch and freeze required paper corpus;
- fetch and lock Flask and Express smoke repositories;
- implement trace runner for `trace.schema.json`;
- generate at least eight mutation families over ten units per repository;
- independent byte oracle and raw JSONL result schema;
- append-only, observation-mask, whole-file CORVUS, FreshCtx-file, and
  FreshCtx-region baselines;
- disposable network-off sandbox recipe.

Exit gates:

- repo, trace, policy, code, paper, and environment digests reproduce;
- correctness metrics recompute from released raw data;
- no model SDK, API key, or sampled output is needed;
- benchmark/gold code is outside the autoresearch write surface.

## M2 — Production Pi adapter

Deliverables:

- package pinned to a tested Pi release range;
- persistent tool-call/unit mappings across session resume and branch;
- partial-read and truncation fidelity;
- final post-sanitizer request capture through a fake provider;
- failure injection for core crash, deleted file, path escape, and archive loss;
- adapter telemetry and status command.

Exit gates:

- persisted Pi transcript is byte-identical with and without FreshCtx;
- request payload passes every satisfiable CtxBench gate;
- forcing adapter failure sends the untouched native request;
- native assistant/tool/result protocol remains valid.

## M3 — Structural unit providers

Deliverables:

- Tree-sitter provider interface and at least Python, TypeScript/JavaScript,
  Rust, and Go providers;
- qualified structural selectors and independent gold extractors;
- rename, move, delete, overload, duplicate, macro, parse-error, and generated
  code traces;
- content/anchor fallback with explicit confidence evidence;
- coherent workspace generation and bounded retry.

Exit gates:

- zero wrong-symbol resolution on the frozen validation suite;
- ambiguous cases fail closed;
- exact required recall on budget-satisfiable traces;
- public comparison against whole-file CORVUS scope.

## M4 — Hermes and OMP portability

Deliverables:

- packaged Hermes engine composed with built-in compression;
- per-session locking and persistent archive lifecycle;
- pinned Hermes request-capture suite;
- Oh My Pi adapter or an upstream-compatible patch using its strongest native
  context seam;
- cross-host canonical trace mapping.

Exit gates:

- Pi and Hermes transform the same semantic trace into equivalent live-unit
  sets;
- host-specific payload differences are explained and captured;
- exact compatibility matrix is published;
- no fork is required for the two primary hosts.

## M5 — Autoresearch campaign

Deliverables:

- frozen train/validation split and sealed holdout traces;
- paper-lock digest recorded in every experiment;
- automated single-hypothesis experiment runner;
- protected evaluator and append-only results ledger;
- Pareto tracking over correctness, bytes, latency, memory, and prefix reuse;
- negative-result and complexity-cost accounting.

Exit gates:

- all accepted changes satisfy hard gates;
- candidate selection uses no holdout feedback;
- five-run stagnation rule and human review are enforced;
- winning policy is frozen before the holdout is opened.

## M6 — CtxBench 1.0 and research release

Deliverables:

- six pinned public repositories across language families;
- complete mutation/read-pattern matrix;
- reviewed CORVUS reproduction;
- sealed holdout result;
- raw results, trace pack, locks, analysis notebook/script, and environment;
- technical report or preprint;
- stable library/sidecar API and two production adapters.

Level 4 exit gates:

- every correctness and safety gate passes;
- pre-registered material Pareto improvement over CORVUS whole-file sync;
- result reproduces through Pi and Hermes request capture;
- maintainers unaffiliated with the optimization reproduce the headline table;
- wording remains “context transformer,” never “best coding agent.”

## Recommended first five issues

1. Implement the v1 JSON trace runner and oracle.
2. Freeze Flask/Express commits and generate smoke traces.
3. Build the exact observation-masking and CORVUS file baselines.
4. Pin Pi and create a no-model provider recorder.
5. Add Tree-sitter Python unit extraction with an independent offset oracle.
