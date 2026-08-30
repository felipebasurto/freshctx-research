# PCR 0129 — Freeze holdout-v0.3-apex with bind-existing hashes

- Date (UTC): 2026-08-30
- Author / agent: Cursor Grok 4.6
- Branch / PR: `feat/seal-holdout-v03-apex`
- Freeze commit: `5b8d214833a6b2aba5db286bb68b49710c48ca3e`
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `protocol-fixture`; `measurement`
- Decision: **review**

## Hypothesis or change

PR 126 published `holdout-v0.3-apex` as `candidate`. The freeze protocol
historically required traces to be absent at freeze. This pack already had
dense public-repo traces and `results.jsonl`. Bind-existing freeze pins those
bytes. Generate and run hash-bind them and refuse to rewrite them.

Local classification is `locally-frozen`. `sealed` still requires production
GitHub Actions attestation. This laptop did not forge that artifact.

This pack is **not a tuning set**. Do not hill-climb `src/policy.mjs`,
`src/anchors.mjs`, or `src/projector.mjs` against these cells.

## What we did

`npm run holdout:freeze -- --manifest=bench/splits/holdout-v0.3-apex.json --generator=holdout-v0.3-apex`
wrote `status: "frozen"`, `bindExisting: true`, and pinned

| field | SHA-256 |
|---|---|
| `manifestSha256` | `5698bb3b17366abdfa9aecd5e23ada7bc65a51f3de56b16f57b356160ceb67cb` |
| `traceSetHash` | `3a934627f82bea5533dc871ba8f7dbaee220ca8f03f0edcd2c16a4afa774be87` |
| `resultSetHash` | `ecce39269b66c302f0cd4bf198df3646a3926201408ca89e59f519750fe66f74` |
| `generatorSha256` | `937d6a3fd104fdf9987950a17bf8b160a8d874ae6bdd53fa2d791d10d19a4988` |

Traces and `results.jsonl` bytes matched the PR 126 snapshot after freeze,
generate, and run. `holdout-v0.2` was not written.

`holdout-freeze-attest` run
[33335497653](https://github.com/felipebasurto/freshctx/actions/runs/33335497653)
did not start. Account billing blocked the job. No production attestation
was written.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run holdout:freeze -- --manifest=bench/splits/holdout-v0.3-apex.json --generator=holdout-v0.3-apex` | yes | 0 | bind-existing, traces unchanged |
| `npm run holdout:generate -- --manifest=bench/splits/holdout-v0.3-apex.json --generator=holdout-v0.3-apex` | yes | 0 | `tracesBound: true` |
| `npm run holdout:run -- --manifest=bench/splits/holdout-v0.3-apex.json` | yes | 0 | `resultsBound: true` |
| `npm run holdout:report -- --manifest=bench/splits/holdout-v0.3-apex.json` | yes | 0 | `locally-frozen` |
| `npm run holdout:verify -- --pack=holdout-v0.3-apex` | yes | 0 | `valid: true`, `locally-frozen` |
| `npm run holdout:verify -- --pack=holdout-v0.2 --attestation=bench/packs/holdout-v0.2/provenance/freeze-attestation.json` | yes | 0 | `sealed`, `valid: true` |
| `npm test` | yes | 0 | TAP 518 / 492 pass / 0 fail / 26 skip |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS`, pack `locally-frozen`, payload delta −28197, recall 5/5 |

## Metric snapshot

No Isolated Semantic Engine payload remasure. JSONL rows stay the PR 126
bytes. Official v0.1 ctxbench payload hash is not this pack.

## Comparison

No Level 4 sentence. Bind-existing freeze is a cryptographic pin of published
candidate bytes. It is not GHA `sealed`.

## Conflicts with constitutions

none observed. Laptop `sealed` was refused. v0.2 was not opened.

## Limitations

- GitHub Actions freeze-attest could not start on this account.
- §10 100-rep dedicated-hardware latency is still out of scope.
- `assertNoArtifactsAtCommit` is skipped only when `manifest.bindExisting`
  is true.

## Next measurement

Rerun `holdout-freeze-attest` after billing is restored. Dispatch
`holdout-generate` with `--generator=holdout-v0.3-apex` so report can earn
`sealed` inside Actions. Do not rewrite traces or `results.jsonl`.
