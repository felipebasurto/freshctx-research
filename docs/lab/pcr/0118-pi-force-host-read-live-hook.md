# PCR 0118 — Pi force-host-read live hook (tool_execution_start)

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0118-force-host-read-live-27b4` / [#114](https://github.com/felipebasurto/freshctx/pull/114)
- Base SHA: `46169f505cb7ece6ff0485cfe9fe315ab4497f4a` (PCR 0117 squash on main)
- Live SHA: `1a002ffac26625023edf6c08ccb1f946c0d13471`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `harness-only`; `live-host`; `measurement`
- Decision: **accept**

## Hypothesis or change

PCR 0117 left live Pi auto-rpc fail-closed on all three arms at t1-read.
`assertT1HostReadTools` threw because recorded `tool_execution_start` args were path-only (`nothing`, `freshctx-ts`) or path-only with `offset=1 limit=2000` (`freshctx-no-ts`).
The model never passed `scope=symbol` selector `settleDailyLedger`.
Mock tests only exercised `tool_call`.
Pi emits `tool_execution_start` before `tool_call`, so RPC capture saw pre-mutation args while execution may differ.
Leftover dump on dest `freshctx-measure-46169f50` before the throw: `nothing` 9335 SW0 yes resolution none; `freshctx-no-ts` 11394 SW0 yes whole-file; `freshctx-ts` 5212 SW0 omitted resolution Isolated Semantic Engine.
File-scope Tree-sitter still pruned sibling.
Not a valid symbol-scope live.
The harness must intercept live Pi tool calls on `tool_execution_start` and `tool_call`.
Recorded t1 args must be the live RPC capture with no post-hoc rewrite before `assertT1HostReadTools`.

## What we did

1. Updated `docs/lab/pi-trial-ts/force-host-read-core.mjs` to register `tool_execution_start` and `tool_call` when `PI_TRIAL_FORCE_HOST_READ=1`.
   `handleForceHostReadExecutionStart` mutates `event.args` in place.
   `handleForceHostReadToolCall` always mutates `event.input` on read, even after `tool_execution_start` on the same call.
   Registration returns `{ block: true }` from both hooks so bash/grep/edit never run on live Pi.
2. Added `docs/lab/pi-trial-ts/force-host-read.ts` as the live Pi `-e` entry (matches `dump-request.ts`).
   `piArgsForArm` now loads `.ts` instead of `.mjs`.
3. `auto-rpc.mjs` records raw `tool_execution_start` args via `toolsFromExecutionStartEvents`.
   No capture rewrite before assert.
4. Added `test/pcr-0118-pi-force-host-read-live.test.mjs` (13 tests) for both hooks on one call, wrapper block return, TypeScript entry path, and raw capture fail-close.
5. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`, holdout v0.2, door, or lock.
6. Did not `--relock` or change benchmark weights.
7. Model remains `deepseek-v4-flash` only.

## Arms (unchanged labels)

| arm | FreshCtx | Tree-sitter | turn-1 host read |
|---|---|---|---|
| `nothing` | no | n/a | `scope=symbol`, selector `settleDailyLedger` (forced in harness) |
| `freshctx-no-ts` | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off`) | same |
| `freshctx-ts` | yes | on (default) | same |

## Benchmarks run

Canonical TAP from this Mac after Tree-sitter WASM install
(`npm run ise:install`, HEAD `1a002ffa`). First `npm test` hit a
`repos-fetch` neovim clone timeout while two suites ran in parallel.
`npm run evaluate` then ran the same suite alone and passed.

```
1..457
# tests 457
# suites 0
# pass 431
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

Official accepted TAP remains **418 pass / 0 fail / 17 skipped / 435 total** on base `46169f5`.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 then 0 | first pass `# fail 1` on `repos-fetch` (600s timeout); isolated rerun 2/2; evaluate suite passed |
| `npm run check` | yes | 0 | syntax check |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; all four hard gates true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3…`; all six hard gates true |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| `auto-rpc.mjs` live three-arm | yes | 0 | official Pi 0.84.3; table below |

## Metric snapshot

| metric | base `46169f5` | PCR 0118 (this run) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` (hold) | `697e74e3…` (hold) | `0` |
| `npm test` TAP `# tests` | 435 | **457** | **+22** |
| `npm test` TAP `# pass` | 418 | **431** | **+13** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 17 | **26** | `0`* |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

\*Official skip count is 17 on base `46169f5`.
This VM run reports 26 skipped (same as PCR 0117 cloud-agent dest).

## Live three-arm (official Pi 0.84.3 @ `1a002ffa`)

`print-columns.mjs` after `auto-rpc.mjs`. `request_bytes` is the sum of dumps
on that turn. Turn-2 last-request bytes are 12044 / 15291 / 7794.

```
arm	turn	t2_exact_new_bytes	sibling_bytes_in_request	request_bytes	prompt_tokens	pi_stdout_current	resolution
nothing	1	n/a	n/a	17041	—	n/a	n/a
nothing	2	no	yes	12044	—	no	none
freshctx-no-ts	1	n/a	n/a	73208	—	n/a	n/a
freshctx-no-ts	2	no	no	15291	—	no	none
freshctx-ts	1	n/a	n/a	12806	—	n/a	n/a
freshctx-ts	2	yes	no	7794	—	yes	Isolated Semantic Engine
```

Full write-up: [REPORT.md](../pi-trial-ts/REPORT.md).

## Comparison

No Level 4 sentence.
Pi docs place `tool_execution_start` before `tool_call`.
`tool_call` is the event whose `{ block: true }` return stops bash/grep.
Registration returns that result from both hooks.
Assert reads raw RPC capture only.
Live official Pi 0.84.3 three-arm at `1a002ffa` recorded
`hostReadArgsMatched: true` on every arm.
No leftover bash or grep.
Tree-sitter arm t2 last request is 7794 bytes vs Pi-alone 12044 (4250 bytes, 35.3% drop).
That arm omitted sibling `SW0`, served `ST1`, and printed `SETTLE=ST1`.
Isolated Semantic Engine-off fail-closed as in PCR 0116. Seven symbol-scope retries, then unresolved.

## Conflicts with constitutions

none observed.

## Limitations

Dumped request JSON has no `usage.prompt_tokens`. Byte counts are the live metric.
`freshctx-no-ts` retried the same symbol read seven times after Isolated Semantic Engine-off
fail-closed. That inflated t1 `request_bytes` to 73208. It is not a Tree-sitter
saving and not a freshness defect.
Dump scan token `Isolated Semantic Engine` remains the `resolutionMethod` code string only.
Not a paper result.

## Recommended next experiment

Keep holdout v0.2 off the tuning path. One scheduled remeasure only.
