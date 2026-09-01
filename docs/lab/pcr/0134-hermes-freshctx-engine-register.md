# PCR 0134 — Hermes loads context engine `freshctx`

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/hermes-freshctx-engine-register-a905` / [136](https://github.com/felipebasurto/freshctx/pull/136)
- Base SHA: `dc1837544c69b7e0bed24b6e788a648e27135677`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `adapter-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Bench remesure after PCR 0133 destage still printed `resolution=none`.
Both FreshCtx arms logged `Context engine 'freshctx' not found — falling back to built-in compressor`.
`select_context` never ran.
Dumps had no Isolated Semantic Engine token and no `freshctx-unit`.
Turn-2 still carried sibling `SW0`.
`src/anchors.mjs` stays frozen.
`bench/repos.lock.json` stays frozen.
This leftover is product discovery of install name `freshctx`.

PCR 0133 staged Isolated Semantic Engine siblings under `plugins/context_engine/`.
Official Hermes loads bundled engines from the host package `plugins/context_engine/` directory.
Isolated `HERMES_HOME/plugins/context_engine/freshctx` is not that package path.
The general plugin fallback needs `$HERMES_HOME/plugins/freshctx` plus `register(ctx)` calling `register_context_engine`.
The trial config enabled only `force-host-read`.
Hermes then fail-opens to the built-in compressor.

## What we did

1. Added `register(ctx)` so the plugin can register `FreshCtxContextEngine` under name `freshctx`.
2. Staged `plugins/freshctx` as the user-plugin install name beside the destaged Isolated Semantic Engine tree.
3. Enabled `freshctx` in isolated `HERMES_HOME` `plugins.enabled` on FreshCtx arms.
4. Added `discoverFreshctxEngine` for the bundled-miss then user-plugin fallback.
5. Added `test/pcr-0134-hermes-freshctx-engine-register.test.mjs`.
6. Bumped public PCR count to 130.
7. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`, holdout packs, door, or lock.
8. Did not `--relock`.
9. No apex or GHA work.
10. No Pi rewrite.

## Arms

| arm | FreshCtx | Isolated Semantic Engine | turn-1 host read |
|---|---|---|---|
| `nothing` | no | n/a | unchanged (`scope=symbol`, selector `settleDailyLedger`) |
| `freshctx-no-ts` | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off`) | same |
| `freshctx-ts` | yes | on (default factory after destaged install) | same |

Model remains `deepseek-v4-flash` only.
Host never exposes a Tree-sitter toggle.

## Benchmarks run

Canonical TAP from this HEAD after `npm test`.

```
1..574
# tests 574
# pass 574
# fail 0
# skipped 0
```

Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above (+4 vs 570 on `dc183754`) |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |

## Metric snapshot

| metric | official `dc183754` | PCR 0134 (this run) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP `# tests` | 570 | **574** | **+4** |
| `npm test` TAP `# pass` | 570 | **574** | **+4** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| evaluate | n/a on official table | `EVALUATE_VERDICT=PASS` | not a live-pack score |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

No live Hermes three-arm table.
Do not invent `request_bytes` or `SETTLE=` replies.

## Comparison

No Level 4 sentence.
Measured on isolated `HERMES_HOME` install: name `freshctx` is enabled and discovered after a bundled-directory miss.
Destage of `context_engine/freshctx` alone still does not discover the engine.
Not a public-repo performance claim.
Not a CORVUS comparison.
Pi rewrite was out of scope.

## Conflicts with constitutions

none observed.

## Limitations

Live official Hermes three-arm was not re-run here.
`npm run ise:install` is still required so `ise/treesitter` can load WASM.
Host remesure stays Bench-side.

## Recommended next experiment

Rerun Bench Hermes live `freshctx-ts` on this HEAD.
Confirm the host no longer logs `Context engine 'freshctx' not found`.
Confirm dumps show Isolated Semantic Engine or `freshctx-unit`.
Confirm turn-2 omits sibling `SW0` after the `settleDailyLedger` flip.
