# PCR 0132 — Hermes TypeScript three-arm measure pack

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/hermes-trial-ts-measure-pack-fdbc` / [134](https://github.com/felipebasurto/freshctx/pull/134)
- Base SHA: `79958de3f11e852f9e101d63524ca6a1a248b4dc`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `live-host`; `harness-only`; `measurement`
- Decision: **review** (PR 134 stays draft)

## Hypothesis or change

Bench can run `nothing` / `freshctx-no-ts` / `freshctx-ts` live Hermes on tip without inventing a harness.
The pack is the same family as `docs/lab/pi-trial-ts/`.
Host turn-1 read stays `scope=symbol` selector `settleDailyLedger`.
Tree-sitter lives inside FreshCtx.
Isolated Semantic Engine off is harness env only.
`handleForceHostReadToolCall` must run on the Hermes live/plugin path so CLI fallback cannot skip the t1 assert when `tools=[]`.

## What we did

1. Added `docs/lab/hermes-trial-ts/` with `pack.mjs`, `live.mjs`, `print-columns.mjs`, dump proxy, `launch-hermes`, `launch-child`, and `hermes-queries`.
2. Reused the Pi trial fixture and symbol-scope prompts. PCR 0116 remains the synthetic contract.
3. Arms are Hermes-alone, FreshCtx with Isolated Semantic Engine off, and FreshCtx with Isolated Semantic Engine on.
4. Hermes bridge honors `FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off` when replay does not pass a runner.
5. Launch-proxy speaks TUI gateway or ACP when the host exposes them. It does not invent `--mode rpc`.
6. Dump proxy writes `scan.json` and redacts Authorization. It never prints the DeepSeek key.
7. Wired `handleForceHostReadToolCall` through a Hermes general plugin (`pre_tool_call`) installed on all three arms, including `nothing`. Not a second context engine. Not product `src/`.
8. `auto-rpc.mjs` always calls `assertT1HostReadTools` on t1. Empty tools fail closed. CLI fallback reads plugin-recorded tools when RPC events are absent.
9. Bumped public PCR count to 128 so living-docs matches `docs/lab/pcr/*.md`.
10. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`, holdout packs, door, or lock.
11. Did not `--relock`. No apex or GHA work. No Pi rewrite.

## Arms

| arm | FreshCtx | Isolated Semantic Engine | turn-1 host read |
|---|---|---|---|
| `nothing` | no | n/a | `scope=symbol`, selector `settleDailyLedger` |
| `freshctx-no-ts` | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off`) | same |
| `freshctx-ts` | yes | on (default) | same |

Model remains `deepseek-v4-flash` only.
Host never exposes a Tree-sitter toggle.

## Benchmarks run

Canonical TAP from this run on branch HEAD.

```
1..567
# tests 567
# pass 567
# fail 0
# skipped 0
```

Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total** on `79958de`.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above (+18 vs official 549) |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| `auto-rpc.mjs` live three-arm | no | n/a | needs official `hermes` on PATH and a key |

## Metric snapshot

| metric | official `79958de` | PCR 0132 (this run) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP `# tests` | 549 | **567** | **+18** |
| `npm test` TAP `# pass` | 549 | **567** | **+18** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| evaluate | n/a on official table | `EVALUATE_VERDICT=PASS` | not a live-pack score |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

No live Hermes three-arm table.
Do not invent `request_bytes` or `SETTLE=` replies.

## Comparison

No Level 4 sentence.
Harness only.
Synthetic PCR 0116 still pins Tree-sitter omission of `settleWeeklyLedger` and the Isolated Semantic Engine dump token `isolated-semantic-engine`.
Live Hermes capture remains pending.

## Conflicts with constitutions

none observed.

## Limitations

`auto-rpc.mjs` requires `hermes` on PATH.
Dump-only proxy answers with a dummy completion when no key is present.
The force-host-read general plugin must be enabled in isolated `HERMES_HOME` config.
CLI t1 now fail-closes on empty tools. Live host still needs official Hermes to fire `pre_tool_call`.

## Recommended next experiment

Rerun the three-arm battery with official Hermes and DeepSeek v4 flash.
Confirm turn-1 tool args show `scope=symbol` and selector `settleDailyLedger`.
Confirm turn-2 `.scan.json` omits sibling marker on arm `freshctx-ts`.
