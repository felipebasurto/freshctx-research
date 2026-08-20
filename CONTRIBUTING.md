# Contributing

FreshCtx welcomes small, measurable contributions.

Before opening a pull request:

1. Download and verify the required paper corpus, then read `THESIS.md`,
   `SOUL.md`, and `docs/EVALUATION.md`.
2. Open an issue describing the failure mode or metric you intend to improve.
3. Add an invariant test that fails before your change.
4. Run `npm test` and `npm run evaluate`.
5. Include before/after context metrics and identify the result class:
   synthetic, replay, or public-repo. Do not use stochastic agent output as a
   core acceptance metric.

Pull requests that alter benchmark weights and implementation behavior together
will not be accepted. Architectural changes should include an ADR under
`docs/decisions/`.

Use conventional commit prefixes where practical: `feat`, `fix`, `bench`,
`docs`, `refactor`, `test`, or `chore`.
