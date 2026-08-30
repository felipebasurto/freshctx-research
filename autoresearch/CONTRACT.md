# Autoresearch Contract

The autonomous loop is gated by a boolean empirical verdict, not a weighted
scalar. Before the first experiment, run `npm run papers:fetch`, read the
required corpus, and make `npm run papers:verify` pass. Then evaluate with:

```bash
npm run evaluate
```

The command exits non-zero if a regression test fails, a forensic gate fails,
or Isolated Semantic Engine payload bytes are not below the CORVUS baseline.
On success it prints exactly one machine-readable line beginning with
`EVALUATE_VERDICT=` followed by the telemetry record.

The verdict is `PASS` only when every forensic gate holds (`fail-open`,
`missing-engine`, `gold-absent`) and total `payload_bytes` delta versus
CORVUS is negative. Oracle retention (recall), peak RSS, and latency ride
along as telemetry. They are not folded into a search score.

Public claims still require the deterministic protocol in
`docs/EVALUATION.md`. No model response, pass@1 score, or generated patch
enters the objective.

Allowed autonomous files live in `search-space.json`. The autoresearch agent
must follow `SOUL.md` and append every attempted experiment to `results.tsv`.
