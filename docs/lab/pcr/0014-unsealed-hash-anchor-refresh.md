# PCR 0014 — stop pinning live unsealed holdout results

- Date (UTC): 2026-08-21
- Author / agent: Cloud Agent (unsealed-hash-anchor-refresh)
- Branch / PR: `unsealed-hash-anchor-refresh` ([PR #6](https://github.com/felipebasurto/freshctx/pull/6))
- Base SHA: `4f113817b292bb326edd79dea708c673497641a6` (main after PR 5 merge)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-smoke`; `public-repo-holdout`

**Status:** development only. **Not sealed.** Not a holdout claim. Not a hash-refresh win.

## Hypothesis or change

After PR 5, `holdout:verify` and test 40 failed because `bench/packs/holdout-v0.1/state.json` pinned a stale `resultSetHash` while live `bench/reports/public-repo-holdout.jsonl` (gitignored, regenerated locally) reflected the go-tools interior-edit lift.

Independent review (option C): **do not pin live unsealed jsonl**. A committed or force-added jsonl hash is unreproducible across machines because every regeneration embeds non-semantic fields:

- `run_id` (timestamp-derived)
- `system_commit` (HEAD at run time)
- `environment_sha256` (Node/platform/cwd digest)
- `latency_ms` (timing noise)

Pinning `resultSetHash` for an unsealed development pack therefore creates false verify failures without adding integrity guarantees. Sealed packs still require committed `results.jsonl` + hash (PCR 0011); v0.1 remains `unsealed-regression`.

## What we did

1. Set `bench/packs/holdout-v0.1/state.json` `resultSetHash` to `null`. Classification stays `unsealed-regression`. `traceSetHash` and `reportHash` unchanged.
2. Did **not** commit `bench/reports/public-repo-holdout.jsonl` (stays gitignored; no force-add).
3. Left historical reports byte-identical: `bench/reports/holdout.md`, `pi-holdout.md`, `hermes-holdout.md`, PCR 0007/0008/0013.

## Why the previous pin failed

| issue | detail |
|---|---|
| stale anchor | pre-PR-5 hash `ac1ca9e8…` did not match post-PR-5 live jsonl |
| unreproducible pin | attempted refresh hash `b8addb3f…` still varied by run environment |
| correctness delta | only go-tools interior-edit moved (recall 0→1); documented in PCR 0013, not rewritten in holdout.md |

Live 20-cell `freshctx-region` board still matches PCR 0013 (recall 20/20, exact 12/20, stale 0, duplicate 0). This PCR closes the verify gate by unpinned design, not by claiming a new result-set anchor.

## Explicit non-goals

- No relabel to sealed.
- No committed jsonl for v0.1.
- No rewrite of historical holdout markdown or PCR 0007/0008/0013.
- No gold, scoring, protocol, lock, adapter, or core implementation edits.
- No v0.2 work. No merge.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 78/78 |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression |
| `git diff --exit-code` (historical reports after tests) | yes | 0 | clean |

## Recommended next experiment

When v0.2 holdout packs graduate through freeze→generate→run→report, pin result-set hashes only under sealed protocol classification.
