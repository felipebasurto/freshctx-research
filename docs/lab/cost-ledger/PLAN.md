# Long-session cost ledger

Label: `harness-only`. Not a paper result. Not CtxBench. Not SOTA.

## Question

Across many turns, do accumulated `request_bytes`, provider tokens, and a cited
DeepSeek v4 flash cost proxy stay lower with FreshCtx on than with FreshCtx off?
FreshCtx here is Isolated Semantic Engine with Tree-sitter (the default).

This pack does not answer that from a live host. It accumulates captured or
synthetic turn rows. A later live run may fill `.work/capture/`.

## Arms

Same prompts on every arm. Model pinned to `deepseek-v4-flash` only.

| Arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| A `nothing` | no | n/a |
| B `freshctx-ts` | yes | on (Tree-sitter is the Isolated Semantic Engine default) |

The host never exposes a Tree-sitter toggle. FreshCtx without Tree-sitter
does not exist. PCR 0140 does not run a third arm.

## Turns

Eight provider turns. One interior flip after turn 1.

1. **t1-read.** Symbol-scope read of `settleDailyLedger`.
2. **flip-settle.** Disk `ST0` → `ST1` inside that export.
3. **t2-settle.** Quote current `MARKER_SETTLE` with no tools.
4. **t3-reread.** Symbol-scope read again.
5. **t4-settle.** Quote current marker, no tools.
6. **t5-ask-again.** Same quote again (native append pressure).
7. **t6-reread.** Symbol-scope read again.
8. **t7-settle** / **t8-ask-again.** Two more no-tool quotes.

## Columns

| column | meaning |
|---|---|
| `request_bytes` | UTF-8 bytes of the serialized provider request JSON |
| `prompt_tokens` | provider `usage.prompt_tokens` when present, else `—` |
| `completion_tokens` | provider `usage.completion_tokens` when present, else `—` |
| `token_source` | `provider`, `bytes-estimate`, `mixed`, or `none` |
| `cost_proxy_usd` | cited flash rates on **provider** tokens only; otherwise `—` |
| `cost_proxy_usd_estimated` | same rates on provider tokens or a labeled 4-byte token estimate |

Cost-proxy table version 1 cites
[DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
on 2026-09-01. Default schedule is off-peak cache-miss. Peak and cache-hit are
explicit options. Byte estimates are not live host tokens.

## PCR 0140 — long-session vs two-turn ingest

A two-turn measure-pack dump (`t1-read` + `t2-settle`, including PCR 0135
Hermes bytes) is **INVALID** as a long-session cost table. Eight provider
turns are required. `prompt_tokens` and `$` come from provider **response**
`usage`, not from request-body scans and not from dump-only dummy `0`.

CI uses fixture dumps (`fixture/long-session-ci.json`, `fixture/dumps/`).
Those dumps replay the PCR 0137 unit-test provider pairs. They are labeled
`fixture` / `liveHost: false`. They are not a live Pi or Hermes capture.

Hosts in the 0140 reprint: `pi` and `hermes`. Compared arms: `nothing` vs
`freshctx-ts` (FreshCtx off vs FreshCtx: Isolated Semantic Engine / Tree-sitter).
FreshCtx without Tree-sitter does not exist.

## PCR 0160 — four-turn dest print is not paper $

Dest `71379f00` printed Hermes t1–t4. Scan `promptTokens` is null.
`docs/lab/hermes-trial-ts/proxy.mjs` wrote those dumps.
This pack's dump-proxy now serves `/v1/responses` the same way.
Four-turn ingest is not a long-session paper `$`. Pass@1 stays null.
Tree-sitter stays the Isolated Semantic Engine default.

## Out of scope

- Live host scores in this leftover
- Official TAP replacement (stays 549/0/0/549)
- INDEX / METRICS / README PCR counts
- `src/`, door, lock, `--relock`
- DeepSeek v4 pro
- Success board / SWE / multi-turn-trial edits
