# PCR 0149 — Dest-copy `.work` fixture t1 matcher (fail-closed)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0149-work-fixture-matcher-3383` / [152](https://github.com/felipebasurto/freshctx/pull/152) (draft)
- Base SHA: `8dc28af7c4b5eb129b01cfb942ad2f1ba44a127e` (PCR 0148 on main; public count 144)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Bench one-retry dest
`/workspace/freshctx-measure-8dc28af7-multiturn-retry` was not
`EmptyStreamError`. t1 did return a host read. `auto-rpc` exit 1. No
`print-columns`. t2/t3/t4 resolution was not produced.

Exact fail from `assertT1HostReadTools` (arm=`nothing`):

```
t1-read read tool must use scope=symbol selector settleDailyLedger with no offset/limit (arm=nothing): [{"toolCallId":"call_00_bW2pSnaR8pOElPzDgZpx1875","toolName":"read_file","args":{"path":"/workspace/freshctx-measure-8dc28af7-multiturn-retry/docs/lab/multi-turn-trial/.work/hermes/nothing/src/settlement.ts","scope":"symbol","selector":"settleDailyLedger"}}]
```

Args are the required symbol read. Path is the `.work` fixture on that dest.
`readToolMatchesHostArgs` compared `args.path === join(workspace, src/settlement.ts)`.
When `workspace` is the checkout `.work` (`docs/lab/multi-turn-trial/.work/hermes/nothing`)
the dest-copy fixture string does not match. The same dump passes when
`workspace` is that dest `.work` dir.

`isDestRootSettlementPath` treated any other `.../src/settlement.ts` as dest-root
when workspace is set. The dest-copy `.work` path was classified dest-root.

**Fail-closed:** a `.work/<host>?/<arm>/src/settlement.ts` fixture path with
`scope=symbol` selector `settleDailyLedger` and no offset/limit is a t1 hit.
Relative dest-root `src/settlement.ts` and abs dest-root `dest/src/settlement.ts`
still fail. Offset/limit on a dest-copy `.work` path still fails.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.
No live rerun.

## What we did

1. Replayed the dest dump against the real `assertT1HostReadTools`. Checkout
   workspace rejects the dest `.work` path; dest workspace accepts it.
2. Fail-closed work-fixture path identity in `isWorkFixtureSettlementPath`.
3. Hermes and Pi `readToolMatchesHostArgs` accept that fixture path.
4. `isDestRootSettlementPath` no longer classifies a `.work` fixture as dest-root.
5. Added `test/pcr-0149-work-fixture-dest-matcher.test.mjs` (exact dest dump).
6. Wrote this PCR and appended INDEX / METRICS.
7. Bumped public PCR count to 145 so living-docs matches on-disk PCR files.
8. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
9. Did not `--relock`.
10. Same Cloud Agent wrote PCR, INDEX, and METRICS.
11. Did not invent TAP, SWE scores, or live `$`.
12. Did not replace PCR 0142 paper.
13. Did not re-run live hosts on this leftover.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `nothing` | no | n/a |

Replay of the dest t1 dump only. Host never exposes a Tree-sitter toggle.
FreshCtx without Tree-sitter is out of scope for this leftover.
Model remains `deepseek-v4-flash` only on the PCR 0139 live table this leftover
does not re-run.

## Turns

| turn | produced on dest `8dc28af7` one-retry | leftover |
|---|---|---|
| 1 `t1-read` | host `read_file` of dest `.work` fixture; matcher rejected | matcher accepts dest-copy `.work` |
| 2 `t2-settle` | not produced (`auto-rpc` exit 1) | not this leftover |
| 3 `t3-settle` | not produced | not this leftover |
| 4 `t4-unchanged` | not produced | not this leftover |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0149-work-fixture-dest-matcher.test.mjs` on this HEAD:

```
1..5
# tests 5
# pass 5
# fail 0
# skipped 0
```

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..647
# tests 647
# pass 605
# fail 42
# skipped 0
```

This-run Cloud Agent TAP is **647 / 605 / 42 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). Official table is not replaced.

All 5 PCR 0149 tests passed.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0149-work-fixture-dest-matcher.test.mjs` | yes | 0 | TAP above |
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; dest dump is the named hole |

## Metric snapshot

| metric | official `79958de` | PCR 0149 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0149 tests | n/a | **5 / 5 / 0 / 0** | dest-copy `.work` fixture matcher |
| `npm test` TAP `# tests` | 549 | **647** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **605** | this checkout Isolated Semantic Engine WASM missing |
| `npm test` TAP `# fail` | 0 | **42** | `isolated-semantic-engine-missing` |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| evaluate | n/a on official table | hard gate failed on this-run TAP | official table not replaced |
| PCR 0142 dest `d8cdd3d5` | unchanged | not this file | paper trail stays there |
| live `$` invented here | n/a | **none** | no live remesure |
| Pass@1 invented here | n/a | **none** | not a SWE dump |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
Measured on the dest dump: t1 `read_file` of
`.work/hermes/nothing/src/settlement.ts` with `scope=symbol` selector
`settleDailyLedger` is a fixture hit when the dest prefix differs from the
checker's `workspace` string.
Dest-root `src/settlement.ts` remains a miss.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
t2/t3/t4 were not produced on the dest one-retry because `auto-rpc` exited at t1.
Isolated Semantic Engine WASM is missing on this Cloud Agent checkout for the
living suite that needs the real parser.
Official table is not replaced.
PCR 0143 dest-root fail-close is unchanged for relative and abs dest-root paths.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
A later live remesure on dest can confirm t1 no longer exits 1 and t2/t3/t4
resolution is produced.
