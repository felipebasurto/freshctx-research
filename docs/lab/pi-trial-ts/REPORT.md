# Pi trial TypeScript report

Label: `live-host`. Not a paper result. Not CtxBench. Not SOTA.

## Question

Does FreshCtx beat Pi-alone on TypeScript after a symbol-scope read of
`settleDailyLedger` and interior flip on that symbol? Does Tree-sitter inside
FreshCtx (host passes `scope=symbol` with selector `settleDailyLedger`) change
the outcome vs the same adapter with the Isolated Semantic Engine off?

Measured on official Pi 0.84.3 with `auto-rpc.mjs` at `1a002ffa`.

## Setup

| field | value |
|---|---|
| Date (UTC) | 2026-08-29 |
| Harness commit | `1a002ffac26625023edf6c08ccb1f946c0d13471` |
| Pi version | `0.84.3` (`/Users/felipe/.hermes/node/bin/pi`) |
| Model | `deepseek-v4-flash` |
| Fixture | `docs/lab/pi-trial-ts/fixture/src/settlement.ts` |
| Flip | interior `ST0` → `ST1` in `settleDailyLedger` |
| Driver | `auto-rpc.mjs` with `PI_TRIAL_FORCE_HOST_READ=1` |

Turn-1 host tools on every arm were `read` with `scope=symbol` selector
`settleDailyLedger`. `hostReadArgsMatched` was true. No leftover bash or grep.

## Measure table (three-arm harness)

Output of `node docs/lab/pi-trial-ts/print-columns.mjs` after the clean rerun.
`request_bytes` is the sum of dumped provider payloads on that turn.
`prompt_tokens` is `—` because the dumped request JSON has no
`usage.prompt_tokens`.

```
arm	turn	t2_exact_new_bytes	sibling_bytes_in_request	request_bytes	prompt_tokens	pi_stdout_current	resolution
nothing	1	n/a	n/a	17041	—	n/a	n/a
nothing	2	no	yes	12044	—	no	none
freshctx-no-ts	1	n/a	n/a	73208	—	n/a	n/a
freshctx-no-ts	2	no	no	15291	—	no	none
freshctx-ts	1	n/a	n/a	12806	—	n/a	n/a
freshctx-ts	2	yes	no	7794	—	yes	Isolated Semantic Engine
```

Turn-2 last-request UTF-8 bytes (one provider payload, not the t1 sum):

| arm | t2 last request_bytes | pi_stdout | sibling `SW0` | resolution |
|---|---:|---|---|---|
| `nothing` | 12044 | `SETTLE=ST0` (stale) | yes | none |
| `freshctx-no-ts` | 15291 | unresolved, no marker | no | none |
| `freshctx-ts` | 7794 | `SETTLE=ST1` | no | Isolated Semantic Engine |

`freshctx-ts` t2 is 4250 bytes below `nothing` t2 (7794 vs 12044). That is a
35.3% drop on the last turn-2 request. Tree-sitter omitted sibling `SW0` and
served `ST1`.

## Notes per arm

### A `nothing`

One forced symbol-scope read. Pi answered `SETTLE=ST0` on t1 and again on t2
after the disk flip. Turn-2 request still contains `SW0`.

### B `freshctx-no-ts`

Isolated Semantic Engine off. Seven repeated symbol-scope reads on t1. FreshCtx fail-closed
(`isolated-semantic-engine-error`). The model never received current bytes and answered
unresolved on t2. No sibling bytes. Larger than Pi-alone because the unresolved
retry transcript stayed in the request.

### C `freshctx-ts`

One forced symbol-scope read. `SETTLE=ST0` on t1. After the flip, `SETTLE=ST1`
with `resolution=isolated-semantic-engine`, `t2_exact_new_bytes=yes`, and no sibling bytes.

## Adapter smokes (synthetic)

| Command | Exit | Notes |
|---|---|---|
| `node --test test/pcr-0116-pi-hermes-symbol-scope-trial.test.mjs test/pcr-0118-pi-force-host-read-live.test.mjs` | 0 | 20 pass |
| `npm run evaluate` | 0 | `AUTORESEARCH_SCORE=89.107165`; not a live-pack score |

Door `f8771c93894095348185ef3453a3c2498355b3c6`. Lock
`79e29d09a9ec12b1128617f683f50a35a3c8809e`. No `--relock`.

## Could not measure

Provider `prompt_tokens` on the dumped request JSON. Byte counts are the
measurement.
