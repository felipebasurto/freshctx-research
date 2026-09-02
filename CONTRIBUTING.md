# Contributing

FreshCtx welcomes small, measurable contributions.

Before opening a pull request:

1. Install the parser dependencies once (`npm run ise:install`), download and
   verify the required paper corpus (`npm run papers:fetch`,
   `npm run papers:verify`), then read `THESIS.md`, `SOUL.md`,
   `docs/ARCHITECTURE.md`, and `docs/EVALUATION.md`. `docs/GLOSSARY.md` defines
   the terms those documents use.
2. Open an issue describing the failure mode or metric you intend to improve.
3. Add an invariant test that fails before your change.
4. Run what CI runs, in the same order as the `deterministic-core` job in
   `.github/workflows/ci.yml`:

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

   Run `npm run demo`, `npm run ctxbench:pi-smoke`, and
   `npm run ctxbench:hermes-smoke` as well when you touched an adapter.
5. Include before/after context metrics and identify the result class:
   synthetic, replay, or public-repo. Do not use stochastic agent output as a
   core acceptance metric.
6. Record the raw results in a Public Change Record under `docs/lab/pcr/`
   using `docs/lab/TEMPLATE.md`, add a row to `docs/lab/INDEX.md` and
   `docs/lab/METRICS.md`, and bump the PCR count sentence in `README.md` and
   `docs/ARCHITECTURE.md` (`test/living-docs.test.mjs` checks all three
   against the files on disk). Lab notes are public: no unpublished claims,
   secrets, or competitor speculation.
7. If you changed the recorded evaluation numbers, update `README.md`,
   `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md` together with the literal in
   `test/living-docs.test.mjs`, and cite the PCR that measured them.

Docs-only pull requests: CI currently skips `**.md` and `docs/**` paths, so run
`node --test test/living-docs.test.mjs test/layout-contract.test.mjs test/gotchas-contract.test.mjs`
locally before pushing. `plans/001` proposes running those on every pull request.

Pull requests that alter benchmark weights and implementation behavior together
will not be accepted. Architectural changes should include an ADR under
`docs/decisions/`. Audit-derived implementation plans live under `plans/`; an
executor following one should update its status row in `plans/README.md`.

Use conventional commit prefixes where practical: `feat`, `fix`, `bench`,
`docs`, `refactor`, `test`, or `chore`.
