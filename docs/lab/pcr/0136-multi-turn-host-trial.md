# PCR 0136 — Multi-turn host trial harness

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0136-multi-turn-trial-5a68` / [139](https://github.com/felipebasurto/freshctx/pull/139)
- Base SHA: `4ab081fd8d81335cc58dd776f2d3726ce73920ac` (PCR 0135 on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `live-host`; `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

PCR 0135 recorded a live two-turn Hermes three-arm table.
The 2-turn packs stop at `t2-settle` after one `flip-settle`.
This leftover is the multi-turn host trial only.
Question for a later live run: after a symbol-scope read of `settleDailyLedger`,
does FreshCtx keep the current interior marker across later mutate/flip turns?
Does Isolated Semantic Engine still omit sibling `SW0` after turn 2?

`src/anchors.mjs` stays frozen.
`bench/repos.lock.json` stays frozen.
Official accepted table stays 549/0/0/549.
INDEX, METRICS, and README PCR counts stay untouched on this leftover.

## What we did

1. Added `docs/lab/multi-turn-trial/` with four cells: `t1-read`, `t2-settle`, `t3-settle`, `t4-unchanged`.
2. Sequential disk flips `ST0` → `ST1` (`flip-settle`) then `ST1` → `ST2` (`flip-settle-2`) inside `settleDailyLedger` only.
3. Arms remain `nothing` / `freshctx-no-ts` / `freshctx-ts` on Pi and Hermes.
4. Reused existing launch patterns: Pi `piArgsForArm` + force-host-read + `dump-request.ts`; Hermes `launchHermes` + dump proxy + force-host-read plugin.
5. Overlay `scan.mjs` on raw dump bodies so later turns can score `ST2` without editing the shared 2-turn scanners.
6. Added `test/pcr-0136-multi-turn-host-trial.test.mjs`.
7. Did not edit INDEX, METRICS, README PCR counts, `src/`, door, lock, adapters, or other lab packs.
8. Did not `--relock`.
9. No apex or GHA work.
10. No invented live `request_bytes` or `SETTLE=` replies.

## Arms

| arm | FreshCtx | Isolated Semantic Engine | turn-1 host read |
|---|---|---|---|
| `nothing` | no | n/a | unchanged (`scope=symbol`, selector `settleDailyLedger`) |
| `freshctx-no-ts` | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off`) | same |
| `freshctx-ts` | yes | on (default factory) | same |

Model remains `deepseek-v4-flash` only.
Host never exposes a Tree-sitter toggle.

## Turns

| turn | mutate | expected marker |
|---|---|---|
| 1 `t1-read` | none | `ST0` |
| 2 `t2-settle` | `flip-settle` | `ST1` |
| 3 `t3-settle` | `flip-settle-2` | `ST2` |
| 4 `t4-unchanged` | none | `ST2` |

## Benchmarks run

Canonical TAP from this HEAD after `npm test`.

```
1..583
# tests 583
# pass 540
# fail 43
# skipped 0
```

`node --test test/pcr-0136-multi-turn-host-trial.test.mjs` on this HEAD:

```
1..9
# tests 9
# pass 9
# fail 0
# skipped 0
```

Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0136-multi-turn-host-trial.test.mjs` | yes | 0 | 9/9; files this leftover added |
| `npm test` | yes | 1 | TAP above; 42 fails print `isolated-semantic-engine-missing`; 1 fail is `living-docs` PCR file count 132 vs README 131 |
| `npm run evaluate` | no | n/a | paper trail only; no policy, door, or lock edit |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| `auto-rpc.mjs` live multi-turn | no | n/a | needs official `pi` and/or `hermes` on PATH and a key |

## Metric snapshot

| metric | official `4ab081fd` | PCR 0136 (this run) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP `# tests` | 574 | **583** | **+9** living suite; official table stays 549 |
| `npm test` TAP `# pass` | 532 | **540** | **+8** (9 new pass; living-docs public-count fails) |
| `npm test` TAP `# fail` | 42 | **43** | **+1** `living-docs` PCR count 132 vs frozen README 131; 42 remain `isolated-semantic-engine-missing` |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| evaluate | n/a on official table | not rerun | paper trail only |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

No live multi-turn table.
Do not invent `request_bytes` or `SETTLE=` replies.

## Comparison

No Level 4 sentence.
Harness only.
The 2-turn packs still answer turn 2.
This pack is the later-turn mutate/flip extension.
Not a public-repo performance claim.
Not a CORVUS comparison.

## Conflicts with constitutions

none observed.

## Limitations

`auto-rpc.mjs` requires official `pi` and/or `hermes` on PATH.
Dump-only proxy answers with a dummy completion when no key is present.
That dummy is not a live score.
This leftover does not bump README / INDEX / METRICS.
`test/living-docs.test.mjs` still asserts 131 PCR files and
`131 Public Change Records`. Adding this file makes that public-count
check fail until a later INDEX/README bump.
This Cloud Agent checkout may still miss Isolated Semantic Engine WASM
on unrelated living-suite tests.
Not a paper result.
Official table is not replaced.

## Recommended next experiment

Run `auto-rpc.mjs --host=hermes` then `--host=pi` on official hosts with
DeepSeek v4 flash.
Fill `REPORT.md` from `print-columns.mjs`.
Confirm turn 3 contains `ST2` and omits `ST1` on `freshctx-ts`.
Confirm turn 4 stays on `ST2` with no second disk flip.
Keep door and lock frozen.
No `--relock`.
