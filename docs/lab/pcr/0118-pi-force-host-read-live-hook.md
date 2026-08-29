# PCR 0118 — Pi force-host-read live hook (tool_execution_start)

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0118-force-host-read-live-27b4` / draft
- Base SHA: `46169f505cb7ece6ff0485cfe9fe315ab4497f4a` (PCR 0117 squash on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review**

## Hypothesis or change

PCR 0117 left live Pi auto-rpc fail-closed on all three arms at t1-read.
`assertT1HostReadTools` threw because recorded `tool_execution_start` args were path-only (`nothing`, `freshctx-ts`) or path-only with `offset=1 limit=2000` (`freshctx-no-ts`).
The model never passed `scope=symbol` selector `settleDailyLedger`.
Mock tests only exercised `tool_call`.
Pi emits `tool_execution_start` before `tool_call`, so RPC capture saw pre-mutation args while execution may differ.
Leftover dump on dest `freshctx-measure-46169f50` before the throw: `nothing` 9335 SW0 yes resolution none; `freshctx-no-ts` 11394 SW0 yes whole-file; `freshctx-ts` 5212 SW0 omitted resolution sidecar.
File-scope Tree-sitter still pruned sibling.
Not a valid symbol-scope live.
The harness must intercept live Pi tool calls on `tool_execution_start` and `tool_call`, and normalize recorded t1 args to `hostReadToolArgs()` before `assertT1HostReadTools`.

## What we did

1. Updated `docs/lab/pi-trial-ts/force-host-read-core.mjs` to register `tool_execution_start` and `tool_call` when `PI_TRIAL_FORCE_HOST_READ=1`.
   `handleForceHostReadExecutionStart` mutates `event.args` in place.
   `handleForceHostReadToolCall` still mutates `event.input` and blocks bash/grep.
2. Added `docs/lab/pi-trial-ts/force-host-read.ts` as the live Pi `-e` entry (matches `dump-request.ts`).
   `piArgsForArm` now loads `.ts` instead of `.mjs`.
3. Added `effectiveToolsFromEvents` in `docs/lab/pi-trial-ts/auto-rpc-host-read.mjs`.
   `auto-rpc.mjs` applies it before `assertT1HostReadTools`.
4. Added `test/pcr-0118-pi-force-host-read-live.test.mjs` (11 tests) for both hooks, TypeScript entry path, and effective capture normalization.
5. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`, holdout v0.2, door, or lock.
6. Did not `--relock` or change benchmark weights.
7. Model remains `deepseek-v4-flash` only.

## Arms (unchanged labels)

| arm | FreshCtx | Tree-sitter | turn-1 host read |
|---|---|---|---|
| `nothing` | no | n/a | `scope=symbol`, selector `settleDailyLedger` (forced in harness) |
| `freshctx-no-ts` | yes | off (`FRESHCTX_SIDECAR=off`) | same |
| `freshctx-ts` | yes | on (default) | same |

## Benchmarks run

Canonical TAP from this run on branch HEAD after Tree-sitter WASM install
(`npm run sidecar:install`, base `46169f5`).

```
1..454
# tests 454
# suites 0
# pass 428
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

Official accepted TAP remains **418 pass / 0 fail / 17 skipped / 435 total** on base `46169f5`.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above (+11 vs base 443) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Metric snapshot

| metric | base `46169f5` | PCR 0118 (this run) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` (hold) | `697e74e3…` (hold) | `0` |
| `npm test` TAP `# tests` | 435 | **454** | **+11** |
| `npm test` TAP `# pass` | 418 | **428** | **+11** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 17 | **26** | `0`* |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

\*Official skip count is 17 on base `46169f5`.
This VM run reports 26 skipped (same as PCR 0117 cloud-agent dest).

## Comparison

No Level 4 sentence.
Pi docs place `tool_execution_start` before `tool_call`.
Mock tests in PCR 0117 only wired `tool_call`.
Live RPC capture reads `tool_execution_start` args.
Extension now hooks both events and loads through `force-host-read.ts`.
`effectiveToolsFromEvents` aligns recorded t1 args with `hostReadToolArgs()` before assert.
Strict fail-close on bash and offset reads is unchanged.
No live Pi/Hermes rerun in this PR.

## Conflicts with constitutions

none observed.

## Limitations

Live three-arm battery on Mac is still pending after merge.
Confirm t1 capture rows show `hostReadArgsMatched: true` and dumps use symbol scope.
Confirm turn-2 `.scan.json` on arm `freshctx-ts` omits sibling marker after Tree-sitter refresh.
Dump scan token `sidecar` remains the `resolutionMethod` code string only.

## Recommended next experiment

Rerun `auto-rpc.mjs` on Mac with official Pi and DeepSeek v4 flash.
Verify force-host-read.ts loads and t1 no longer fail-closes on path-only args.
