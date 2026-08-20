# PCR 0011 — Test hygiene and sealed result-set hash gate

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/test-hygiene-sealed-hash-0e86`
- Commit: (this PR)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `protocol-fixture`; `unsealed-regression`

## Hypothesis or change

Phase 0 prerequisite before any v0.2 holdout: unit tests must not rewrite tracked benchmark reports, and `holdout:verify` must fail closed when a **sealed** pack lacks a committed, hashable `results.jsonl` / `state.resultSetHash`.

## What we did

### Test hygiene

- Added `bench/report-artifacts.mjs` with `TRACKED_REPORT_PATHS`, `shouldWriteTrackedReports()`, and default **no writes** from programmatic callers.
- Pi/Hermes smoke and holdout runners plus core `holdout.mjs` now write tracked markdown / `results.tsv` only when invoked as CLI (`invoked: true`) or when `FRESHCTX_WRITE_REPORTS=1`.
- Added `test/report-hygiene.test.mjs`: byte snapshots of tracked reports, git-clean assertion on report paths.

### Sealed verify fail-closed

- `verifySealedResultSet()` in `bench/holdout-verify.mjs`: for `classification === sealed`, require non-empty `bench/packs/<packId>/reports/results.jsonl`, non-null `state.resultSetHash`, and recomputable hash match.
- v0.1 `unsealed-regression` unchanged; null `resultSetHash` remains valid there.

### Negative tests

- Sealed + null `resultSetHash` → verify fails.
- Sealed + tampered `results.jsonl` → verify fails.
- Repository holdout v0.1 verify still passes as `unsealed-regression`.
- Report hygiene tests assert tracked paths unchanged after adapter/holdout pack runners.

## Explicit non-goals (this PCR)

- No holdout v0.2 seeds, traces, manifests, or reports.
- No EVALUATION §5.1 sampling implementation.
- No new GitHub/Origin workflow runners.
- No retune of `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`.
- No gold-label, weight, or threshold changes.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 68+ tests including hygiene + sealed hash negatives |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | |
| `git diff --exit-code` (tracked reports) | yes | 0 | clean after `npm test` |

## Metric snapshot

Synthetic score unchanged at **89.107165**. CtxBench payload sha256 unchanged at `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`.

## Conflicts with constitutions

None observed.

## Limitations

- Hygiene gate covers listed tracked report paths; new tracked artifacts need explicit listing in `TRACKED_REPORT_PATHS`.
- Sealed hash gate applies to protocol packs claiming `sealed`; v0.1 legacy jsonl under `bench/reports/` remains gitignored and unsealed.
- Remote attestation host wiring and live-run verification remain future work (see NEXT-PROMPT).

## Next measurement

1. Remote-attest host + live-run verification for protocol pipeline.
2. EVALUATION §5.1 trace sampler (deterministic, pre-freeze).
3. Disposable canary pack exercise.
4. First new-seed holdout v0.2 measurement (not started in this PCR).
