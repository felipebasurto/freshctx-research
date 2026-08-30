# PCR 0125 — One-shot remasure on sealed holdout v0.2

- Date (UTC): 2026-08-30
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/holdout-v02-oneshot-report-0710`
- Merge-base: `936ddf8` (origin/main, PCR 0124 / PR 121)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`; `protocol-fixture`
- Decision: **review**

## Hypothesis or change

None. This is the scheduled one-shot remasure. `src/anchors.mjs`,
`src/policy.mjs`, `src/projector.mjs`, and the Isolated Semantic Engine were
not edited. Score weights, holdout gold, and sealed pack bytes were not
edited.

The question was whether HEAD `936ddf8` still verifies the GHA seal and what
`npm run evaluate -- --pack=holdout-v0.2` actually prints.

## What we did

Verified the pack against the production attestation. Ran the evaluate
command as written. Ran `npm run ctxbench` on the synthetic fixture. Ran
`npm run ctxbench:symbol-pack` for Isolated Semantic Engine versus CORVUS
`payload_bytes`, peak RSS, and p95. Restored the disposable pack report files
after that remasure so this host's RSS and latency did not overwrite the
committed PCR 0124 tables.

Did not run `holdout:run`. That phase writes `reports/` and `state.json`
inside the sealed tree.

## Architectural boundary

`autoresearch/evaluate.mjs` still ignores `--pack`. It runs `test/*.test.mjs`
and then `bench/run.mjs` twice. The printed score is the synthetic
`auth-region-after-interior-edit` fixture. It is not a holdout-v0.2 cell
score.

holdout-v0.2 remains two in-memory `interior-edit` traces (`src/alpha.py`,
`src/beta.py`) bound to the flask lock SHA. It is not an Isolated Semantic
Engine versus CORVUS pack.

## Benchmarks run

Host: Linux 6.12.94+ x86_64, Node v22.14.0, commit
`936ddf8053c307eae34ba974423f4c2bdf5c610b`.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run holdout:verify -- --pack=holdout-v0.2 --attestation=bench/packs/holdout-v0.2/provenance/freeze-attestation.json` | yes | 0 | `valid: true`, `classification: "sealed"`, `earnedClassification: "sealed"`, `errors: []` |
| `npm run evaluate -- --pack=holdout-v0.2` | yes | 0 | `--pack` unused. `AUTORESEARCH_SCORE=89.107165`. Label `synthetic`. Four hard gates true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`. Six hard gates true. `latencyMs.totalMs.p95` = 0.070452 on this host |
| `npm run ctxbench:symbol-pack` | yes | 0 | official cells and nested showdown below. Report files restored after capture |
| `holdout:run` | no | n/a | would rewrite sealed `reports/` |

Seal hashes that verified:

| Field | Value |
|---|---|
| `manifestSha256` | `7cb1b393ad4b87ed1121b16be7a5417a0d28475dfc74c49a079043ab6e4b07f7` |
| `freezeCommitSha` | `2bf91d83f6370b0a66a52f7d28da4d00e8df2e9c` |
| `traceSetHash` | `c0cb6b254fa656ff129552a4fb4bb7388cffac92e7e8d0a09599f65ee40dd047` |
| `resultSetHash` | `17ec79ff704b1ef5c68cecc93cb1e3764f2a3e72c424bac4c3f76c672dc38169` |
| `reportHash` | `abb09e55a33b27d5e1c8539519351b0273d2f2c14006b361a894dcb1993ce81e` |
| attestation run | [33201069400](https://github.com/felipebasurto/freshctx/actions/runs/33201069400) |
| `bindingSha256` | `c3b37bd60d1f33072e5af410f8adcad38d760b04c9471888d243dd12469f7898` |

## Metric snapshot

Synthetic evaluate (this is the `AUTORESEARCH_SCORE` printer):

| metric | PCR 0124 @ `936ddf8` | this remasure | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | 0 |
| evaluate label | `synthetic` | `synthetic` | 0 |
| `noStaleBytes` / `exactlyOneCurrentCopy` / `fullGoldRecall` / `fullyResolved` | true | true | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| ctxbench `totalMs.p95` | (not this host) | **0.070452 ms** | this-host only |
| `src/policy.mjs` / evaluate weights / holdout gold | untouched | untouched | 0 |

`docs/EVALUATION.md` §10 still says a CI-style runner cannot support a
publishable latency claim. The 0.070452 ms figure is this host, 10 warmups,
100 reps, synthetic fixture.

Official disposable symbol pack, independent gold, `return view` sentinel.
Payload bytes are `Buffer.byteLength(JSON.stringify(messages), "utf8")`.
Latency is 5 warmups and 21 measured reps. Peak RSS is process `VmHWM`.

| system | repo | symbol | verdict | payload_bytes | peak_rss_bytes | latency_p95_ms |
|---|---|---|---|---|---|---|
| isolated-semantic-engine | flask | as_view | pass | 2995 | 61583360 | 91.29 |
| corvus-file | flask | as_view | pass | 7473 | 61603840 | 0.00 |
| isolated-semantic-engine | express | createApplication | pass | 1316 | 62279680 | 92.54 |
| corvus-file | express | createApplication | pass | 1952 | 62279680 | 0.00 |

Aggregate official-pack `payload_bytes` (Isolated Semantic Engine minus
CORVUS):

| pair | ISE | CORVUS | delta |
|---|---|---|---|
| flask `as_view` | 2995 | 7473 | −4478 |
| express `createApplication` | 1316 | 1952 | −636 |
| sum | 4311 | 9425 | **−5114** |

Peak RSS across those four cells is **62279680** bytes (59.39 MiB). Isolated
Semantic Engine p95 is **91.29 ms** (flask) and **92.54 ms** (express).
CORVUS p95 is 0.00 ms because that arm does not spawn the parse process.

Nested helper showdown (engine spans, `view.view_class` sentinel, not
independent gold):

| tier | system | selector | payload_bytes | vs CORVUS |
|---|---|---|---|---|
| 1 | isolated-semantic-engine | `class View::method as_view::if@0::function view` | 1058 | −6424 |
| 2 | isolated-semantic-engine | `class View::method as_view` | 2995 | −4487 |
| 3 | corvus-file | whole file | 7482 | 0 |

Tier 1 versus tier 3 is 1058 / 7482 = 0.1414 of the CORVUS payload, an 85.86%
cut on that disposable cell. Payload bytes match PCR 0124. This host's RSS
and p95 are new.

## Comparison

The seal is intact. The synthetic score did not move. Official-pack
`payload_bytes` did not move.

This is not a Level 4 result. `docs/EVALUATION.md` §13 still requires
correctness gates on development, validation, and sealed holdout traces, a
faithful CORVUS comparison on those traces, pre-registered material
improvement, language-family coverage, and Pi plus Hermes request-capture.
holdout-v0.2 has two fixture traces and `requiredRecallMin: 0`. evaluate never
opened those traces. Pi and Hermes were not replayed on this pack.

## Conflicts with constitutions

none observed. The one-shot rule held. No hill-climb.

## Limitations

- `--pack=holdout-v0.2` is a no-op on `evaluate.mjs`.
- holdout-v0.2 cells were not executed. Their frozen payload SHA-256 values
  stay `bce6ac87…` and `4d51c24b…` from generate commit `70df2f4`.
- Isolated Semantic Engine versus CORVUS numbers come from
  `symbol-scope-dev-v0.1`, not from the sealed pack.
- Nested-helper spans are Isolated Semantic Engine units, not independent
  gold.
- Isolated Semantic Engine p95 includes parse-process spawn. CORVUS 0.00 ms
  is not a fair latency contest.
- Peak RSS is one process `VmHWM` on this VM. It is not a dedicated-hardware
  §9.5 figure.
- ctxbench `totalMs.p95` is the in-process synthetic transformer, not the
  Isolated Semantic Engine.

## Next measurement

Do not treat these cells as a tuning signal. PCR 0126 later bound `--pack` on
evaluate. A later one-shot may call `npm run evaluate -- --pack=holdout-v0.2`
without rewriting this remasure. Keep v0.2 sealed.
