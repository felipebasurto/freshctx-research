# Instructions for agents working on FreshCtx

Bootstrap in this order: `npm run ise:install` (Tree-sitter grammars for the
Isolated Semantic Engine; `npm test` fails without them), then
`npm run papers:fetch` if the local corpus is absent, then
`npm run papers:verify`. Read `THESIS.md`, `SOUL.md`,
`docs/ARCHITECTURE.md`, and `docs/EVALUATION.md` before modifying core behavior.
`docs/GLOSSARY.md` defines the vocabulary those documents share.

Implementation plans produced by repository audits live under `plans/`
(index: `plans/README.md`). If you are executing one, follow it step by step
and update its status row when done.

## Repository purpose

FreshCtx is a context substrate, not a coding agent. Keep the core independent
from model providers and harness-specific message formats. Harness translation
belongs under `adapters/`.

## Required workflow

1. Inspect the current tests and benchmark before changing behavior.
2. State the invariant or metric affected by the change.
3. Make the smallest coherent implementation.
4. Add or update an invariant test.
5. Run `npm test`.
6. Run `npm run evaluate` for policy, anchoring, or rendering changes.
7. Report raw metric deltas and any unresolved limitations.

## Code rules

- Node.js standard library only in the prototype core.
- Use ECMAScript modules (`.mjs`).
- Keep functions deterministic and side-effect-light.
- Do not read outside an explicitly supplied workspace root.
- Do not follow symlinks in future filesystem adapters by default.
- Use SHA-256 for content identity; non-cryptographic hashes may be used only
  for internal caches, never durable identity.
- Never inject last-known content when current resolution fails.
- Keep selection order and render order as separate concepts.
- Historical markers must be stable across content revisions.
- New telemetry fields must be versioned or backward-compatible.
- Avoid model-specific behavior in core. Put it in adapter policy profiles.

## Evaluation protection

Do not change benchmark fixtures, gold labels, score weights, thresholds, or
held-out splits while optimizing implementation code. A benchmark change is a
separate reviewable change with a stated migration reason.

Synthetic results may be used for correctness and iteration, not public-repo
performance claims. The context-transformer claim follows `docs/EVALUATION.md`
and never uses stochastic model output as its primary metric.

## Adapter rules

- Adapters must preserve native assistant-tool/tool-result pairing.
- Request transformations should be ephemeral unless the host explicitly
  supports safe persistent marker replacement.
- Adapter failure must return the original host request unchanged.
- Record the host version and adapter capability surface in every benchmark.
- Never claim full support for a host whose API cannot rewrite request context.

## Documentation rules

- Keep `README.md` honest about prototype status.
- Add an ADR for architectural decisions with long-term compatibility impact.
- Label numbers as measured, reproduced, or cited.
- Link primary sources for external performance claims.
- Do not describe projected roadmap features as implemented.

## Before handing off

Run what the `deterministic-core` CI job runs, in this order:

```bash
npm run check
npm test
npm run bench
npm run ctxbench
npm run evaluate
npm run papers:list
npm run holdout:verify -- --pack=holdout-v0.1
git fetch origin main && npm run holdout:ci-guard -- --base=origin/main
```

Docs-only changes are skipped by CI (`paths-ignore`), so also run
`node --test test/living-docs.test.mjs test/layout-contract.test.mjs test/gotchas-contract.test.mjs`
when you touched Markdown. A behaviour change needs a Public Change Record
under `docs/lab/pcr/`, rows in `docs/lab/INDEX.md` and `docs/lab/METRICS.md`,
and the PCR count bumped in `README.md` and `docs/ARCHITECTURE.md`
(`CONTRIBUTING.md` has the full checklist).

Then summarize:

- files changed;
- invariants tested;
- benchmark delta;
- known limitations;
- recommended next experiment.
