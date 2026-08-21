# PCR 0014 — unsealed hash-anchor refresh after PR 5

- Date (UTC): 2026-08-21
- Author / agent: Cloud Agent (unsealed-hash-anchor-refresh)
- Branch / PR: `unsealed-hash-anchor-refresh`
- Base SHA: `4f113817b292bb326edd79dea708c673497641a6` (main after PR 5 merge)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `public-repo-smoke`; `public-repo-holdout`

**Status:** development only. **Not sealed.** Not a holdout claim. Not a Wave 3 win.

## Hypothesis or change

PR 5 (wave2 go-tools structural consensus rebase) lifted go-tools interior-edit on the live holdout board (recall 0→1, exact 0→1, projection bytes 164→562). The committed `bench/packs/holdout-v0.1/state.json` still pinned the pre-PR-5 `resultSetHash`, so `holdout:verify` and test 40 failed closed even though the 20-cell `freshctx-region` board matches PCR 0013.

This PCR refreshes the unsealed result-set hash anchor only. No resolver, gold, scoring, protocol, or historical report changes.

## What we did

1. On locked repository SHAs (flask, express, go-tools, neovim unchanged in `bench/repos.lock.json`), regenerated `bench/reports/public-repo-holdout.jsonl` from current implementation.
2. Updated `bench/packs/holdout-v0.1/state.json` `resultSetHash`, `updatedAt`, and `note`. Classification remains `unsealed-regression`. `traceSetHash` and `reportHash` unchanged.
3. Left historical reports byte-identical: `bench/reports/holdout.md`, `pi-holdout.md`, `hermes-holdout.md`, PCR 0007/0008/0013.

## Result-set hash delta

| field | old | new |
|---|---|---|
| `state.resultSetHash` | `ac1ca9e863c347b8b522c938d98a87c233d34e8cfedbdb27db4bd76be6138015` | `b8addb3f8aa546dfb4d35c3136384d580413c696bd34eecf98ac59fcb4e107a5` |

## Cell-level reason the hash moved

Only one **correctness** cell changed vs the stale committed jsonl anchor (pre-PR-5):

| repo | family | baseline | Δ recall | Δ exact | Δ proj bytes | note |
|---|---|---|---:|---:|---:|---|
| go-tools | interior-edit | freshctx-region | +1 (0→1) | +1 (0→1) | +398 (164→562) | PR 5 structural consensus exact-startLine gate |

All other holdout `freshctx-region` cells match PCR 0013. Non-semantic jsonl fields also differ on every row (expected on regeneration): `run_id`, `system_commit`, `environment_sha256`, `latency_ms`.

## Per-cell table — 20-cell `freshctx-region` board (unchanged vs PCR 0013)

Smoke v0.1 (10 cells) + holdout v0.1 (10 cells).

| repo | family | recall | exact | stale | dup | proj bytes |
|---|---|---:|---:|---:|---:|---:|
| express | append | 1 | 1 | 0 | 0 | 948 |
| express | delete | 1 | 0 | 0 | 0 | 164 |
| express | duplicate-boundary | 1 | 0 | 0 | 0 | 644 |
| express | interior-edit | 1 | 1 | 0 | 0 | 961 |
| express | move-in-file | 1 | 1 | 0 | 0 | 455 |
| flask | append | 1 | 1 | 0 | 0 | 1426 |
| flask | delete | 1 | 0 | 0 | 0 | 164 |
| flask | duplicate-boundary | 1 | 0 | 0 | 0 | 676 |
| flask | interior-edit | 1 | 1 | 0 | 0 | 1458 |
| flask | move-in-file | 1 | 1 | 0 | 0 | 502 |
| go-tools | append | 1 | 1 | 0 | 0 | 604 |
| go-tools | delete | 1 | 0 | 0 | 0 | 164 |
| go-tools | duplicate-boundary | 1 | 0 | 0 | 0 | 809 |
| go-tools | interior-edit | 1 | 1 | 0 | 0 | 562 |
| go-tools | move-in-file | 1 | 1 | 0 | 0 | 538 |
| neovim | append | 1 | 1 | 0 | 0 | 1029 |
| neovim | delete | 1 | 0 | 0 | 0 | 164 |
| neovim | duplicate-boundary | 1 | 0 | 0 | 0 | 561 |
| neovim | interior-edit | 1 | 1 | 0 | 0 | 872 |
| neovim | move-in-file | 1 | 1 | 0 | 0 | 698 |

**Aggregates:** required-recall **20/20**, exact **12/20**, stale sum **0**, duplicate sum **0**.

## Explicit non-goals

- No relabel to sealed.
- No rewrite of historical holdout markdown or PCR 0007/0008/0013.
- No gold, scoring, protocol, lock, adapter, or core implementation edits.
- No v0.2 work. No merge.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 78/78 |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression |
| `git diff --exit-code` (historical reports after tests) | yes | 0 | clean |

## Recommended next experiment

None required for verify-gate closure. Future implementation changes that move holdout cells should repeat this hash-anchor refresh pattern without rewriting historical markdown.
