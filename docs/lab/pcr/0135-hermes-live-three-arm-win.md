# PCR 0135 — Hermes live three-arm Isolated Semantic Engine

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0135-hermes-live-three-arm-6bc9` / [137](https://github.com/felipebasurto/freshctx/pull/137)
- Base SHA: `85c6c99d4c74812a8223715915e6ab64928a540a` (PCR 0134 on main)
- Live dest: `/workspace/freshctx-measure-85c6c99d`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `live-host`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

PCR 0134 left live remesure to Bench.
This leftover records that remesure only.
Live WIN on tip `85c6c99d`.
Dest is `/workspace/freshctx-measure-85c6c99d`.
Model is `deepseek-v4-flash`.
`Context engine 'freshctx' not found` is gone.
`freshctx-ts` turn 2 used Isolated Semantic Engine (Tree-sitter).
That arm omitted sibling.
`request_bytes` is 27826 versus `nothing` 32999.
`freshctx-no-ts` turn 2 resolution is `file` and still has sibling.
`src/anchors.mjs` stays frozen.
`bench/repos.lock.json` stays frozen.
Official accepted table stays 549/0/0/549.

## What we did

1. Wrote this PCR with the live three-arm table from dest `/workspace/freshctx-measure-85c6c99d`.
2. Appended INDEX and METRICS.
3. Bumped public PCR count to 131.
4. Did not edit adapters, `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`, holdout packs, door, or lock.
5. Did not `--relock`.
6. Same Cloud Agent wrote PCR, INDEX, and METRICS.
7. No apex or GHA work.
8. No Pi rewrite.

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
# pass 532
# fail 42
# skipped 0
```

Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | TAP above; 42 fails print `isolated-semantic-engine-missing` |
| `npm run evaluate` | no | n/a | paper trail only; no policy, door, or lock edit |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| `npm run ise:install` | no | n/a | this Cloud Agent checkout has no Tree-sitter WASM; pstack was not reinstalled |

## Metric snapshot

| metric | official `79958de` | PCR 0135 (this run) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP `# tests` | 549 | **574** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **532** | this checkout Isolated Semantic Engine WASM missing |
| `npm test` TAP `# fail` | 0 | **42** | `isolated-semantic-engine-missing` |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| evaluate | n/a on official table | not rerun | paper trail only |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Live three-arm (official Hermes @ `85c6c99d`)

Dest `/workspace/freshctx-measure-85c6c99d`.
Model `deepseek-v4-flash`.
`prompt_tokens` were not in the dumps.

```
arm	turn	t2_exact_new_bytes	sibling_bytes_in_request	request_bytes	prompt_tokens	hermes_stdout_current	resolution
nothing	1	n/a	n/a	83603	—	n/a	n/a
nothing	2	no	yes	32999	—	no	none
freshctx-no-ts	1	n/a	n/a	134123	—	n/a	n/a
freshctx-no-ts	2	yes	yes	33539	—	yes	file
freshctx-ts	1	n/a	n/a	77372	—	n/a	n/a
freshctx-ts	2	yes	no	27826	—	yes	isolated-semantic-engine
```

`freshctx-ts` turn 2 used Isolated Semantic Engine (Tree-sitter).
That arm omitted sibling.
`request_bytes` is 27826 versus `nothing` 32999.
`freshctx-no-ts` turn 2 resolution is `file` and still has sibling.
Dump scan token `isolated-semantic-engine` is the `resolutionMethod` code string only.

## Comparison

No Level 4 sentence.
Engine miss is gone.
`freshctx-ts` turn 2 printed Isolated Semantic Engine and omitted sibling.
`freshctx-no-ts` turn 2 stayed file-scope with sibling present.
Not a public-repo performance claim.
Not a CORVUS comparison.
Pi rewrite was out of scope.

## Conflicts with constitutions

none observed.

## Limitations

`prompt_tokens` were not in the dumps (`—`).
Byte counts are the live metric.
No other live columns were invented.
This Cloud Agent checkout has no Tree-sitter WASM.
`npm test` therefore printed `# pass 532` `# fail 42`.
The live dest already resolved Isolated Semantic Engine.
pstack was not reinstalled.
Not a paper result.
Official table is not replaced.

## Recommended next experiment

Thinker asks official-first again before the official table moves.
Keep door and lock frozen.
No `--relock`.
