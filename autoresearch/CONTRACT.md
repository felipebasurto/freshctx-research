# Autoresearch Contract

The autonomous loop optimizes one deterministic scalar while respecting hard
gates. Before the first experiment, run `npm run papers:fetch`, read the
required corpus, and make `npm run papers:verify` pass. Then evaluate with:

```bash
npm run evaluate
```

The command exits non-zero if a regression test fails, stale bytes enter the
projection, the current unit is duplicated, gold recall is lost, or a tracked
unit becomes unresolved. On success it prints exactly one machine-readable
line beginning with `AUTORESEARCH_SCORE=` followed by component metrics.

The scalar is a search aid, not a scientific result. It combines exact-current
recall, freshness, duplication, resolution, payload size, and a cache-churn
proxy. Public claims require the deterministic protocol in
`docs/EVALUATION.md`. No model response, pass@1 score, or generated patch enters
the objective.

Allowed autonomous files and weights live in `search-space.json`. The
autoresearch agent must follow `SOUL.md` and append every attempted experiment
to `results.tsv`.
