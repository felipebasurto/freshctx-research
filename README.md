# FreshCtx

**Never send stale code to an agent.**

FreshCtx is an experimental, local-first context engine for coding agents. It
replaces immutable file snapshots in an append-only transcript with stable
markers, then injects one current, bounded view of the code that matters before
each model call.

The project starts from a simple observation: source code is mutable state, not
conversation history. An agent that read `auth.ts` ten turns ago should not keep
reasoning over that old snapshot after the file has changed.

FreshCtx aims to be a reusable context layer for open agent harnesses. Pi and
Hermes Agent have working adapters in this repository. Oh My Pi does not yet.
FreshCtx is not another coding agent, another vector database, or another set of
prompting rules.

> Status: research prototype. The included MVP is dependency-free and
> demonstrates the central invariant on deterministic fixtures. It does not yet
> claim state of the art.

## The invariant

For every tracked code region in a model request:

1. At most one full version of that region is present.
2. The version is derived from the current workspace state.
3. Historical read results are represented by stable, cache-friendly markers.
4. If a region cannot be resolved safely, FreshCtx omits it and reports the
   uncertainty instead of injecting stale code.

## The stateless rule

A provider request is stateless. If FreshCtx selects a unit, that unit's current
bytes must be present in the request that selects it, on every request, whether
or not the file changed since the last one. A revision digest, an
`unchanged` marker, or an earlier request is a reference to the bytes and not the
bytes themselves. Selecting a unit and then sending zero bytes for it is a
correctness failure, and no byte saving redeems it.

FreshCtx broke this rule in PCR 0077 and repaired it in
[PCR 0079](docs/lab/pcr/0079-stateless-byte-exact-requests.md). The repair makes
repeated requests larger on purpose.

## Why this project

Modern harnesses already have excellent search, editing, verification, and
compaction primitives:

- Cursor has indexed search, Instant Grep, and an Explore subagent.
- Claude Code has ripgrep, optional LSP intelligence, subagents, and guarded
  exact edits.
- Pi exposes a minimal toolset and a per-request context transformation hook.
- Hermes has fuzzy patching, verification, lossless-context plugins, and a
  pluggable context engine.
- Oh My Pi adds hash-anchored edits, summarized reads, LSP, debugging, and a
  metaharness.

Yet file contents usually enter the trajectory as immutable observations. When
the workspace changes, those observations do not. FreshCtx targets this layer.

The closest published baseline is
[CORVUS](https://arxiv.org/abs/2607.22711), which synchronizes whole files and
reports 9-50% lower input-token use and up to 37% fewer reasoning cycles while
preserving comparable task success. FreshCtx's research target is to outperform
that file-level design through symbol-level synchronization, automatic working
set eviction, and cache-aware layout.

FreshCtx does **not** use “the agent programs better” as its primary outcome.
Model behavior is stochastic and would confound a systems benchmark. The core
claim is narrower and directly measurable: given a versioned workspace and a
fixed trace, does FreshCtx produce the correct request context, how many bytes
does it move, and how long does the transformation take? `CtxBench` evaluates
that function without making a model call. An autoresearch coding agent may
still consume its own harness tokens while proposing changes; those tokens are
controller cost, never benchmark input.

## Quick start

Requirements: Node.js 22 or newer. The prototype has no runtime dependencies.

```bash
npm test
npm run bench
npm run ctxbench
npm run evaluate
npm run demo
```

Before research work, download and verify the required reading corpus:

```bash
npm run papers:fetch
npm run papers:verify
```

Public repository fixtures are declared separately and become immutable through
a generated commit lock before a benchmark freeze:

```bash
npm run repos:fetch
```

`npm run bench` runs the physical EmpiricalVerdict board once and prints
the verdict. It does not enforce it. `npm run ctxbench` is the synthetic
in-memory latency board. `npm run evaluate` runs the tests, then the
physical board twice, and throws unless the verdict is `PASS`. Default
target is the highest apex pack on disk. The printer names the judge
(`pack-on-disk` or `empirical-verdict`) before `EVALUATE_VERDICT`.

## What already works

These behaviors are in the core:

- Stable IDs for observed code regions.
- Content-addressed revisions using SHA-256.
- Exact and anchor-based region relocation after a file changes.
- Conservative failure when relocation is ambiguous.
- Deterministic working-set selection under a character budget.
- Stable historical markers that do not change with file revisions.
- Cache-aware ordering of selected units.
- Exact local recovery of previously observed revisions.

These behaviors are in both the Pi extension and the Hermes context engine:

- Whole-file and line-region units, including pagination that promotes to file
  scope under shared end-of-file rules.
- Cat-class shell reads (`cat`, `head`, `tail`, `sed -n`, `nl`) tracked through
  the same workspace guard as official read tools.
- Request-only rewriting. The persisted host transcript is not modified.
- Unserved read pairs pruned from the request instead of left as stale bodies.
- Fail open. Adapter failure sends the untouched host request.
- Projection bytes equal to the core `freshctx-region` baseline, asserted for
  equality in the test suite.

These evaluation tools exist:

- Synthetic ctxbench, regression tests, and an EmpiricalVerdict evaluate contract.
- Loopback OpenAI-compatible request recorder that returns a fixed, zero-model
  response for adapter tests.
- Frozen public-repo and host commit locks, a JSON trace runner, an independent
  byte oracle, and five comparison baselines.

## Product shape

```text
Pi extension          ┐
Hermes context engine ├──> FreshCtx core ──> synchronized request projection
OMP extension         ┘
```

The Pi extension and the Hermes context engine exist. The OMP extension does
not. The core stays harness-agnostic, and adapters translate native read events
and per-request message arrays into the FreshCtx contract.

An MCP server may be offered for explicit retrieval, but MCP alone cannot
deliver the full product: a tool server can return new observations, while the
host's context middleware must replace or mask old observations.

## Repository map

```text
THESIS.md                 Research thesis and falsifiable claims
SOUL.md                   Operating contract for the autoresearch agent
AGENTS.md                 Instructions for coding agents working in this repo
src/                      Dependency-free prototype core
test/                     Invariant and policy tests
bench/                    Deterministic replay benchmark
capture/                  No-model provider payload recorder
autoresearch/             Search contract, EmpiricalVerdict, and experiment ledger
adapters/pi/              Pi extension, replay harness, and adapter notes
adapters/hermes/          Hermes ContextEngine plugin, Node bridge, and installer
docs/ARCHITECTURE.md      Runtime architecture and data model
docs/BENCHMARK.md         Evaluation methodology
docs/EVALUATION.md        Normative CtxBench protocol and metric definitions
papers/manifest.json      Required and adjacent research corpus
bench/repos.manifest.json Public repository corpus and frozen refs
docs/ROADMAP.md           Priority bands and release gates
docs/LAUNCH.md            GitHub, paper, and LinkedIn launch plan
docs/RESUMEN_ES.md        Short Spanish project brief
docs/explainer/           Interactive Spanish explainer, single file, unpublished
docs/lab/                 Public Change Records and per-iteration metric ledger
```

## Research gates

FreshCtx will only claim an improvement over the state of the art if it meets
all of these conditions on held-out, deterministic repository traces:

1. Zero stale injected units and zero duplicate current units.
2. Byte-exact recovery of every masked observation.
3. Required-set recall at or above the frozen floor.
4. Lower projection bytes or transformation latency than a faithful CORVUS
   reproduction, with the full Pareto frontier reported.
5. Deterministic, byte-identical output across repeated runs.
6. Reproduction on pinned commits from multiple public repositories and through
   request-capture adapters for at least Pi and Hermes.

Until then, every result is labeled either `synthetic`, `replay`, or
`public-repo`. Agent task success may be studied separately, but it is never a
gate for the context-transformer claim.

## Contributing

Read [THESIS.md](THESIS.md), [SOUL.md](SOUL.md), and the normative
[docs/EVALUATION.md](docs/EVALUATION.md) before changing selection or rendering
behavior. Contributions must include an invariant test and a benchmark result.

## License

MIT. See [LICENSE](LICENSE).
