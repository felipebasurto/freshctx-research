# PCR 0133 — Hermes live Isolated Semantic Engine layout

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/hermes-live-ise-engage-814e` / [135](https://github.com/felipebasurto/freshctx/pull/135)
- Base SHA: `4acdcb09e0da7cea1f104460f188a275c4ec4475`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `adapter-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Bench Hermes live three-arm on main `4acdcb09` printed `resolution=none` on every arm.
Dumps had no Isolated Semantic Engine token and no `freshctx-unit` even on `freshctx-ts`.
Turn-2 still carried sibling `SW0`.
Pi on `79958de3` already showed Isolated Semantic Engine and dropped that sibling.
`src/anchors.mjs` stays frozen.
`bench/repos.lock.json` stays frozen.
This leftover is product install layout, not a Bench harness rewrite.

PCR 0112 made `bridge.mjs` import `engine-factory.mjs`.
That factory constructs the Isolated Semantic Engine runner.
PCR 0078 made the same bridge import `shell-read.mjs`.
`install.mjs` still staged only `freshctx/`, `request-prune.mjs`, and `src/`.
A destaged Hermes plugin resolves those imports from `plugins/context_engine/`.
The missing modules make the live bridge exit 1.
Hermes then fail-opens to the untouched request.

## What we did

1. Staged `engine-factory.mjs`, `shell-read.mjs`, and `ise/` in the Hermes install layout.
2. Required those paths in `verify-layout.mjs`.
3. Raised the live bridge default timeout from 2s to 15s so a destaged Isolated Semantic Engine spawn can finish.
4. Added `test/pcr-0133-hermes-live-ise-layout.test.mjs`.
5. Destaged-plugin replay of symbol-scope `settleDailyLedger` after `ST0`→`ST1` projects Isolated Semantic Engine and omits sibling `SW0`.
6. Bumped public PCR count to 129.
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
1..570
# tests 570
# pass 570
# fail 0
# skipped 0
```

Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above (+3 vs 567 on `4acdcb09`) |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |

## Metric snapshot

| metric | official `4acdcb09` | PCR 0133 (this run) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP `# tests` | 567 | **570** | **+3** |
| `npm test` TAP `# pass` | 567 | **570** | **+3** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| evaluate | n/a on official table | `EVALUATE_VERDICT=PASS` | not a live-pack score |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

No live Hermes three-arm table.
Do not invent `request_bytes` or `SETTLE=` replies.

## Comparison

No Level 4 sentence.
Measured on destaged plugin replay: Isolated Semantic Engine token appears and sibling `SW0` is omitted.
Not a public-repo performance claim.
Not a CORVUS comparison.
Pi rewrite was out of scope.

## Conflicts with constitutions

none observed.

## Limitations

Live official Hermes three-arm was not re-run here.
`npm run ise:install` is still required so `ise/treesitter` can load WASM.
Host harness notes stay Bench-side.

## Recommended next experiment

Rerun Bench Hermes live `freshctx-ts` on this HEAD.
Confirm dumps show Isolated Semantic Engine or `freshctx-unit`.
Confirm turn-2 omits sibling `SW0` after the `settleDailyLedger` flip.
