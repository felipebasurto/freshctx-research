# PCR 0139 — Multi-turn live Pi/Hermes three-arm measure

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0139-multi-turn-live-1cf1` (draft)
- Base SHA: `dd9ad11ba6224e652d26dc18b1812e633edbff11` (living PCR count 134 on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `live-host`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

PCR 0136 shipped the four-turn host trial harness.
This leftover records the live remesure only.
Live multi-turn table on tip `dd9ad11ba6224e652d26dc18b1812e633edbff11`.
Hosts are official Pi and official Hermes.
Model is `deepseek-v4-flash`.
`freshctx-ts` omitted sibling on later turns.
`request_bytes` dropped versus `nothing` on those turns.
Isolated Semantic Engine (Tree-sitter) resolved turns 2–3.
Turn 4 `resolution=none` is a leftover, not fixed here.
`src/anchors.mjs` stays frozen.
`bench/repos.lock.json` stays frozen.
Official accepted table stays 549/0/0/549.

## What we did

1. Wrote this PCR with the live multi-turn table from tip `dd9ad11`.
2. Appended INDEX and METRICS.
3. Bumped public PCR count to 135 so living-docs matches on-disk PCR files.
4. Did not edit adapters, sidecar, `src/`, door, lock, or harness behavior.
5. Did not `--relock`.
6. Same Cloud Agent wrote PCR, INDEX, and METRICS.
7. No apex or GHA work.
8. Did not invent TAP, SWE scores, or cost-ledger totals.

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

Canonical TAP from this HEAD after `npm test` is pending this Cloud Agent run.
Do not invent scores. Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | pending | n/a | paper trail first; TAP will be pasted from this Cloud Agent |
| `npm run evaluate` | pending | n/a | paper trail only; no policy, door, or lock edit |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live multi-turn host | already captured | n/a | table below is the remesure; this leftover does not re-run hosts |

## Metric snapshot

| metric | official `79958de` | PCR 0139 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP | 549/0/0/549 | pending this Cloud Agent | do not invent |
| evaluate | n/a on official table | pending | paper trail only |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Live multi-turn (official Pi + Hermes @ `dd9ad11`)

Tip `dd9ad11ba6224e652d26dc18b1812e633edbff11`.
Model `deepseek-v4-flash`.
`prompt_tokens` were not in the dumps (`—`).

```
host	arm	turn	exact_current_bytes	stale_prior_bytes	sibling_bytes_in_request	request_bytes	prompt_tokens	stdout_current	resolution
pi	nothing	1	n/a	n/a	n/a	13020	—	n/a	n/a
pi	nothing	2	no	yes	yes	10025	—	no	none
pi	nothing	3	no	yes	yes	10705	—	no	none
pi	nothing	4	no	yes	yes	11154	—	no	none
pi	freshctx-no-ts	1	n/a	n/a	n/a	26293	—	n/a	n/a
pi	freshctx-no-ts	2	no	no	no	9604	—	no	none
pi	freshctx-no-ts	3	no	no	no	11353	—	no	none
pi	freshctx-no-ts	4	no	no	no	12093	—	no	none
pi	freshctx-ts	1	n/a	n/a	n/a	8819	—	n/a	n/a
pi	freshctx-ts	2	yes	yes	no	6377	—	yes	isolated-semantic-engine
pi	freshctx-ts	3	yes	yes	no	6333	—	yes	isolated-semantic-engine
pi	freshctx-ts	4	yes	yes	no	6029	—	yes	none
hermes	nothing	1	n/a	n/a	n/a	83928	—	n/a	n/a
hermes	nothing	2	no	yes	yes	33492	—	no	none
hermes	nothing	3	no	yes	yes	33905	—	no	none
hermes	nothing	4	no	yes	yes	34295	—	no	none
hermes	freshctx-no-ts	1	n/a	n/a	n/a	107553	—	n/a	n/a
hermes	freshctx-no-ts	2	yes	yes	yes	32310	—	yes	file
hermes	freshctx-no-ts	3	yes	yes	yes	32762	—	yes	file
hermes	freshctx-no-ts	4	yes	yes	yes	32597	—	no	none
hermes	freshctx-ts	1	n/a	n/a	n/a	77051	—	n/a	n/a
hermes	freshctx-ts	2	yes	yes	no	27311	—	yes	isolated-semantic-engine
hermes	freshctx-ts	3	yes	yes	no	27392	—	yes	isolated-semantic-engine
hermes	freshctx-ts	4	yes	yes	no	27159	—	yes	none
```

`freshctx-ts` omitted sibling on turns 2–4 (`sibling_bytes_in_request=no`).
`request_bytes` dropped versus `nothing` on those turns:

| host | turn | `nothing` | `freshctx-ts` | delta |
|---|---:|---:|---:|---:|
| pi | 2 | 10025 | 6377 | −3648 |
| pi | 3 | 10705 | 6333 | −4372 |
| pi | 4 | 11154 | 6029 | −5125 |
| hermes | 2 | 33492 | 27311 | −6181 |
| hermes | 3 | 33905 | 27392 | −6513 |
| hermes | 4 | 34295 | 27159 | −7136 |

Turns 2–3 on `freshctx-ts` used Isolated Semantic Engine (Tree-sitter).
Dump scan token `isolated-semantic-engine` is the `resolutionMethod` code string only.
Turn 4 on both `freshctx-ts` arms still has exact current bytes and stdout current, but `resolution=none`. That leftover is recorded, not fixed.

## Honest leftovers on this tip (not invented, not fixed)

- Cost-ledger live on this tip ingested prior 2-turn dumps only. That is not a full multi-turn cost run. Do not treat PCR 0137 as an eight-turn live total.
- SWE-host scaffold smoke: `measuredSweScores()` is `null`. `print-columns.mjs` prints `not measured`.
- Product leftover candidates, **not fixed in this PR**:
  - `freshctx-ts` turn 4 drops to `resolution=none` on both Pi and Hermes.
  - `pi` / `freshctx-no-ts` shows `resolution=none` on turns 2–4 (`exact_current_bytes=no`).

## Comparison

No Level 4 sentence.
`freshctx-ts` omitted sibling and dropped `request_bytes` versus `nothing`.
Isolated Semantic Engine printed on turns 2–3.
Turn 4 `resolution=none` is a leftover.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a full cost-ledger live run.

## Conflicts with constitutions

none observed.

## Limitations

`prompt_tokens` were not in the dumps (`—`).
Byte counts are the live metric.
No other live columns were invented.
Cost-ledger on this tip is still not an eight-turn live total.
SWE scores stay `null`.
This leftover does not change product code.
Not a paper result.
Official table is not replaced.

## Recommended next experiment

Investigate turn-4 `resolution=none` on `freshctx-ts` without changing the official table.
Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
