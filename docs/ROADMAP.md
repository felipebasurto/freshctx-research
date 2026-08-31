# Roadmap and release gates

Work is ordered by priority band, and each band is ordered by evidence rather
than feature count. An item is done when its exit gate passes and its
limitations are written down in a Public Change Record under `docs/lab/pcr/`.

What this repository can show today is byte-level correctness on unsealed
regression traces plus one sealed pack, measured through request capture in two
hosts. It cannot show a comparison against a reviewed CORVUS reproduction, a
sampled public-repo corpus across every declared language family, or any
published raw result set. The wording ladder lives in `docs/EVALUATION.md` §13
and this file does not widen it.

Autoresearch is paused. The campaign stays paused until every P1 item closes,
because a search loop over unsealed traces with an incomplete attestation path
would produce numbers nobody can check.

## What is implemented today

- Dependency-free Node core with stable unit identity, SHA-256 content identity,
  exact and anchor-based region relocation, and fail-closed ambiguity handling.
- Deterministic budgeted selection with separate selection order and render
  order, and explicit unresolved and budget-omitted counts.
- Stateless projection. Every selected unit carries its current bytes in every
  provider request. See P0 below.
- Pi extension and replay harness, and a Hermes `ContextEngine` plugin with a
  Node bridge. Both track whole files, line regions, and symbol units, track
  cat-class shell reads, prune unserved read pairs, and fail open to the
  untouched host request. Symbol refresh runs in an out-of-process Tree-sitter
  sidecar that no module under `src/` imports.
- Frozen public-repo locks (`bench/repos.lock.json`), pinned host commits
  (`bench/hosts.lock.json`), a JSON trace runner over `bench/trace.schema.json`,
  an independent byte oracle, and append-only, observation-mask, whole-file
  CORVUS, FreshCtx-file, and FreshCtx-region baselines.
- Loopback OpenAI-compatible capture provider that returns a fixed response and
  makes zero inference calls.
- Holdout freeze, generate, run, report, and verify commands with negative tests
  for the protocol invariant.
- Public Change Records under `docs/lab/pcr/`
  (`ls docs/lab/pcr/*.md | wc -l`).

Holdout v0.1 is an unsealed regression pack that predates the freeze protocol.
Treat it as regression evidence. It is not sealed and it is not a result.

## P0: stateless byte correctness

**Resolved by [PCR 0079](lab/pcr/0079-stateless-byte-exact-requests.md).**

A provider request is stateless, so the selected current bytes must be present
in the request itself. PCR 0077 sent marker-only frames for units whose revision
matched a prior inject, and changed `bench/metrics.mjs` to score the revision
attribute as if it were the bytes. PCR 0079 removed the cross-turn state, made
`renderUnit` always emit `unit.content`, and restored content-only comparison in
the metric path.

Exit gate, held at the current branch head:

- every selected unit carries current bytes, and `content-bytes` is the UTF-8
  length of the rendered body;
- Pi and Hermes projection bytes equal live core `freshctx-region`, asserted for
  equality rather than an upper bound;
- a marker-only frame scores zero recall and zero exact-current;
- `EVALUATE_VERDICT=PASS` on the physical board, and the ctxbench payload hash is unchanged.

Nothing else is open at P0. A regression that puts a digest, a summary, or a
prior request in place of selected current bytes returns here ahead of every
other item.

## P1: research readiness

These gate the autoresearch campaign and the first sealed holdout.

**Remote freeze attestation and live verification.** `scripts/holdout-attest-stub.mjs`
and `.github/workflows/holdout-freeze-attest.yml` exist, and production
attestation consumption does not. Wire `holdout:verify` to consume a real remote
attestation and exercise the whole path end to end on a protocol fixture rather
than on holdout seeds. Exit gate: a fixture pack verifies from a remote
attestation, and a tampered attestation fails closed with a distinct error.

**Deterministic unit sampler for `docs/EVALUATION.md` §5.1.** Trace units are
still authored per pack. Implement `sha256(commit + selector + scenario)`
ordering, the exclusion rules, and the rejected-candidate record. Exit gate: two
runs on the same commit produce identical candidate lists, and every rejection
carries a reason.

**Disposable canary pack.** Run freeze, generate, run, report, and verify over
sampler output on a throwaway pack id. Exit gate: the canary completes and is
deleted, and no holdout-v0.2 artifact is created by it.

**First sealed holdout v0.2.** Landed in PCR 0110 / PR-S. `classification` is
`sealed` against production attest run `33201069400`. The pack is **not a
tuning set**. Do not reopen this item as a hill-climb. One scheduled
remeasure only.

**Seal `holdout-v0.3-apex` via production GHA attestation once billing permits.**
Local classify stays `locally-frozen` until then. Do not hand-edit `status` or
`classification`.

**Pinned host compatibility and request capture.** `bench/hosts.lock.json` pins
Pi at `c49906ec` and a Hermes commit for the native bake-off, and neither
adapter has a test pinned to a released host package. Add pinned-release
integration tests and post-sanitizer request capture through the loopback
provider for both hosts. Exit gate: the persisted host transcript is
byte-identical with and without FreshCtx, forcing adapter failure sends the
untouched native request, and the captured payload passes every satisfiable
CtxBench gate.

**Full timing and memory evidence.** `npm run ctxbench` reports repeated
transformation latency. Nothing reports peak resident memory or per-stage
timing inside the adapters, so `docs/EVALUATION.md` §9.2 and §9.5 cannot be
filled from this repository. Exit gate: refresh, resolve, select, render, and
serialize timings plus peak memory land in the result rows for core and both
adapters.

**Fail cleanly when a checkout is absent.** `npm run repos:verify` and
`npm run hosts:verify` currently crash with an unhandled `spawnSync git ENOENT`
when the vendored checkout directory does not exist, which is the normal state
of a fresh clone. Exit gate: both commands report the missing checkout and the
command to create it, and exit non-zero without a stack trace.

**Root-confined source provider in the core.** `FreshCtxEngine.refresh()` takes
a caller-supplied provider, and every path guard lives in the adapters
(`safeWorkspaceFile` and the shell-read parser). A core-side provider that takes
one workspace root, canonicalizes paths, refuses escaping symlinks by default,
and enforces the binary and size limits removes the chance that a future host
integration forgets one guard. Exit gate: the core provider passes the escape,
symlink, binary, and oversize cases, and both adapters use it instead of their
own copy.

## P2: benchmark and product depth

**Structural unit providers.** Tree-sitter provider interface with Python,
TypeScript and JavaScript, Rust, and Go, qualified structural selectors, and
independent gold extractors. Exit gate: zero wrong-symbol resolution on the
frozen validation suite, ambiguous cases fail closed, and exact required recall
on budget-satisfiable traces.

Partly shipped. `sidecar/treesitter/` runs Tree-sitter WASM grammars for Python,
JavaScript, TypeScript, Go, and Rust behind a stdin/stdout contract, and
`docs/decisions/0004-treesitter-sidecar.md` keeps parsers out of `src/`. Two
gaps remain. `src/registry.mjs` routes file and region refresh through the
sidecar for six Python, JavaScript, and TypeScript extensions only, so Go and
Rust reach it for symbol scope alone. The zero-wrong-symbol and
fail-closed-ambiguity gates are measured on `holdout-v0.3-apex` and the dev
packs, not on a frozen validation suite.

**Optional LSP/SCIP identity providers per language family.** Slot them into the
resolution hierarchy after Tree-sitter validation gates pass. The prototype has
no LSP integration.

**Reviewed CORVUS reproduction.** `bench/corvus.mjs` is a documented
whole-file baseline written from the paper, not a reviewed reproduction. Exit
gate: a second maintainer signs off that the baseline is faithful on the same
traces and budget, and the deviation table names every difference.

**Broader corpus and the full matrix.** Six pinned public repositories across
language families, and the complete mutation and read-pattern matrix from
`docs/EVALUATION.md` §5.2 and §5.3 at the full sample target. Exit gate: repo,
trace, policy, code, paper, and environment digests reproduce, and correctness
metrics recompute from released raw data.

**Production packaging.** A Pi package pinned to a tested release range,
durable `callToUnit` and registry persistence across restart and branch switch,
a Hermes registry publish with per-session locking and archive lifecycle, a
durable encrypted revision archive, and adapter telemetry with a status command.
Exit gate: session resume keeps tracked units without a re-read, and the
compatibility matrix is published.

## P3: expansion

**Oh My Pi adapter.** An adapter or an upstream-compatible patch against its
strongest native context seam, plus cross-host canonical trace mapping. Exit
gate: Pi, Hermes, and OMP transform the same semantic trace into equivalent live
unit sets, and host-specific payload differences are explained and captured.

**Inspection plane and reporting.** An MCP server for explicit track, refresh,
recover, and status calls, and a technical report once a sealed result exists.
MCP stays a compatibility and inspection plane. It cannot remove an earlier tool
result from a host request, so it is never the data plane.

## Release gates

A Level 4 statement that FreshCtx is a state-of-the-art context transformer
requires everything in `docs/EVALUATION.md` §13. The short form: every
correctness gate on development, validation, and sealed holdout traces, a
reviewed CORVUS reproduction, a pre-registered material improvement with no
material regression elsewhere, reproduction across all declared language
families, request-capture reproduction through both Pi and Hermes, and public
raw results with negative cases.

Until then every result carries a label from `synthetic`, `replay`,
`public-repo-smoke`, or `public-repo-holdout`, and agent task success is never a
gate for the context-transformer claim.
