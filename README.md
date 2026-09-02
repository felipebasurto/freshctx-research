# FreshCtx

FreshCtx is a local-first context substrate for coding agents. It treats source
code as mutable workspace state rather than permanent conversation history.
Historical reads become stable references; immediately before a provider
request, FreshCtx resolves the selected units and injects one current, bounded
projection.

If a unit cannot be resolved safely, FreshCtx omits it and reports the
uncertainty. It never substitutes last-known bytes.

## Current behavior

- Whole-file, line-region, and symbol scope are implemented.
- Whole files and line regions use deterministic exact and anchor-based
  relocation.
- Symbol refresh uses an out-of-process Tree-sitter implementation for Python,
  JavaScript, TypeScript, Go, and Rust.
- `src/` remains Node.js standard library only. Parser dependencies stay outside
  the core process.
- Pi and Hermes adapters capture supported reads, transform only a request copy,
  preserve the stored host transcript, and fail open to the original request.
- Revisions use SHA-256 identity, historical markers stay stable across content
  changes, and prior observations remain exactly recoverable in the in-memory
  archive.

Every provider request is stateless. If a unit is selected, its current bytes
must be present in that request even when the same revision appeared in an
earlier request. A digest or an `unchanged` marker names bytes; it does not
supply them. [PCR 0079](docs/lab/pcr/0079-stateless-byte-exact-requests.md)
records this contract.

## What the tests prove

The deterministic suite exercises current-byte refresh, one-copy projection,
stable markers, exact recovery, conservative ambiguity and deletion handling,
budget selection, separate selection and render ordering, and root-confined
adapter reads. It also replays Pi and Hermes request transformations without a
model and checks native assistant/tool/result structure, request-only rewriting,
and adapter fail-open behavior.

The suite covers all five Tree-sitter languages and checks that `src/` does not
import parser packages. It verifies that this checkout routes an unqualified
`npm run evaluate` to the physical `holdout-v0.3-apex` pack.

These tests establish deterministic repository invariants. They do not establish
production host compatibility across released versions or improved model task
performance.

## Recorded evaluation

This checkout's default physical evaluate pack is `holdout-v0.3-apex`. It is
locally frozen, not production-GHA sealed.

The CORVUS whole-file comparison keeps its implementation in
`bench/corvus.mjs` and its result key as `corvus-file`, following
[Zheng et al., arXiv:2607.22711](https://arxiv.org/abs/2607.22711). It is the
whole-file baseline for this measurement, not a claim that the systems are
equivalent beyond the pinned trace and budget.

The recorded apex measurement is:

| System | Payload |
|---|---:|
| Isolated Semantic Engine | 8589 payload bytes |
| Whole-file baseline (`corvus-file`) | 36701 payload bytes |

Required recall was **5/5**. These are measured payload and oracle-retention
results for the pinned local pack (measured by `npm run evaluate` on `main`,
2026-09-02), not a general performance claim. The candidate figure was 8504
bytes when the pack was frozen ([PCR 0130](docs/lab/pcr/0130-corvus-equivalents-skip-inventory.md));
the vocabulary migration that renamed the projection attribute value to
`resolution="isolated-semantic-engine"` (a 17-byte longer label) added 17
bytes to each of the five projected units and nothing else changed. `passAt1` is
always `null` and out of scope because CtxBench does not sample a model or judge
patches.

## Production gaps

FreshCtx still lacks a durable permissioned revision archive, a coherent
filesystem snapshot barrier, release-pinned Pi and Hermes compatibility tests,
full stage-level adapter timing and memory evidence, and production GitHub
Actions freeze attestation for the apex pack. The current whole-file baseline
also awaits independent reproduction review. Oh My Pi has no complete adapter.

MCP can expose inspection and recovery operations, but it cannot remove old
observations from an arbitrary host request. It is therefore an inspection
plane, not the FreshCtx data plane.

## Quick start

Requirements: Node.js 22 or newer. Install the isolated parser dependencies,
then run the deterministic suite:

```bash
npm run ise:install
npm run check
npm test
npm run bench
npm run ctxbench
npm run evaluate
```

This is the same order as the `deterministic-core` CI job in
`.github/workflows/ci.yml`; CI additionally runs `npm run papers:list`,
`npm run holdout:verify -- --pack=holdout-v0.1`, and
`npm run holdout:ci-guard -- --base=origin/main`.

Before research work, fetch and verify the required reading corpus:

```bash
npm run papers:fetch
npm run papers:verify
```

`npm run bench` and `npm run evaluate` use deterministic request capture and
make no model call. Public repository fixtures are declared separately and are
locked to immutable commits before a benchmark freeze.

## Repository map

```text
src/              Provider-independent Node.js standard-library core
adapters/         Host codecs, request translation, and replay harnesses
ise/treesitter/   Out-of-process Tree-sitter implementation
test/             Deterministic invariant tests
bench/            Replay benchmark, packs, oracles, and whole-file baseline
capture/          No-model provider request recorder
autoresearch/     Evaluation entrypoint and experiment ledger
scripts/          Paper, repository, host, and holdout-protocol CLIs
examples/         Runnable demo
docs/             Architecture, evaluation contract, decisions, glossary, PCRs
papers/           Research manifest and reproducibility lock
plans/            Reviewed implementation plans from repository audits
```

There are 159 Public Change Records in `docs/lab/pcr/`.
See [docs/LAYOUT.md](docs/LAYOUT.md) for the installed Hermes shape and cleanup
boundary, and [docs/GLOSSARY.md](docs/GLOSSARY.md) for the terms used across
the documents.

## Contributing

Read [AGENTS.md](AGENTS.md), [THESIS.md](THESIS.md), [SOUL.md](SOUL.md),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and
[docs/EVALUATION.md](docs/EVALUATION.md) before changing core behavior.
Behavioral changes need an invariant test, and policy, anchoring, or rendering
changes need an evaluation result. [CONTRIBUTING.md](CONTRIBUTING.md) lists the
exact commands and the Public Change Record requirement.

## License

MIT. See [LICENSE](LICENSE).
