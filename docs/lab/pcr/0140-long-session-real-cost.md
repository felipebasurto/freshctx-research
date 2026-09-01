# PCR 0140 — Long-session cost: real tokens and dollars (harness only)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0140-long-session-cost-1228` / [144](https://github.com/felipebasurto/freshctx/pull/144) (draft)
- Base SHA: `dbfd044322570a03650c5f7f06dfacde36a1f63c` (PCR 0139 on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `harness-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

PCR 0137 shipped the eight-turn ledger.
Two-turn ingest is INVALID as a long-session cost table.
This leftover distinguishes that ingest, captures provider **response**
`usage.prompt_tokens` / `usage.completion_tokens`, and reprints a cited
DeepSeek v4 flash cost-proxy `$` for arms `nothing` vs FreshCtx
(`freshctx-ts`: Isolated Semantic Engine / Tree-sitter) on Pi and Hermes.
FreshCtx without Tree-sitter does not exist. This leftover does not run a
third arm.

CI uses fixture dumps. Those dumps are labeled `fixture` / `liveHost: false`.
They replay the PCR 0137 unit-test provider pairs. They are not a live host
score. This leftover does not invent live tokens or dollars.

Official accepted table stays 549/0/0/549.
INDEX / METRICS / README PCR counts stay untouched (PCR 0141 collision).
No success board.

## What we did

1. Added session-kind: two-turn ingest (`t1-read` + `t2-settle`, including
   PCR 0135 Hermes `request_bytes`) fails `assertLongSessionCost`.
2. Added response-usage parse. Dump-only dummy `prompt_tokens: 0` stays `—`.
3. Added a cost-ledger dump proxy that writes request bytes and, when an
   upstream reply is present, `*.response.usage.json`.
4. Added Pi / Hermes fixture dumps for `nothing` vs FreshCtx (`freshctx-ts`).
5. `print-ledger.mjs --fixture` reprints those dumps for CI.
   Live reset/mutate accepts only those two arms.
6. Added `test/pcr-0140-long-session-cost.test.mjs`.
7. Did not edit INDEX, METRICS, README PCR counts, `src/`, door, lock,
   adapters, sidecar, success-board, SWE, or multi-turn-trial.
8. Did not `--relock`.
9. Same Cloud Agent wrote PCR and tests.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `nothing` | no | n/a |
| `freshctx-ts` | yes | on (Tree-sitter is the Isolated Semantic Engine default) |

Hosts: `pi`, `hermes`.
Model remains `deepseek-v4-flash` only.
Host never exposes a Tree-sitter toggle.
FreshCtx without Tree-sitter does not exist.

## Turns

Eight provider turns from `session.mjs`. Not the two-turn measure packs.

## Cost proxy

Same cited table as PCR 0137 (version 1, 2026-09-01,
[DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)).
Default off-peak cache-miss.
`$` is computed only from provider tokens.
Fixture `$` is that formula on fixture tokens, not a billed invoice.

## Benchmarks run

Canonical TAP from this HEAD after `npm test`.

```
1..619
# tests 619
# pass 575
# fail 44
# skipped 0
```

`node --test test/pcr-0140-long-session-cost.test.mjs` is **12 pass / 0 fail**.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.
This-run living suite is **619 / 575 / 44 / 0**. Official table is not replaced.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | TAP above; 42 Isolated Semantic Engine misses on this checkout plus living-docs `136 !== 135` plus pre-existing evaluate/empirical fails; PCR 0140 is 12/12 |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live long-session host | no | n/a | no provider key; no `pi`; no `hermes` |

## Metric snapshot

| metric | official `79958de` | PCR 0140 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP `# tests` | 549 | **619** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **575** | +12 PCR 0140; ISE-missing and living-docs remain |
| `npm test` TAP `# fail` | 0 | **44** | living-docs `136 !== 135` plus pre-existing ISE misses |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| live long-session `prompt_tokens` | n/a | **none** | not invented |
| live long-session `$` | n/a | **none** | not invented |
| two-turn ingest as long-session | PCR 0139 leftover note | **INVALID** | fail-closed |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
Harness only.
No live long-session table.
CI fixture ledger is accumulation math, not a host capture.
PCR 0135 two-turn live bytes are not summed into this ledger.

## Conflicts with constitutions

none observed.

## Limitations

No live Hermes or Pi eight-turn capture on this leftover.
This checkout has no `DEEPSEEK_API_KEY`, no `pi`, and no `hermes`.
Dump-only sessions still omit `prompt_tokens`.
Cost proxy is cited list price, cache-unaware by default, not a billed invoice.
Living-docs still pins public PCR count at 135. Adding `0140-*.md` makes the
on-disk count 136. README / INDEX / METRICS were out of path.

## Recommended next experiment

Run the eight-turn battery on official Hermes and Pi with DeepSeek v4 flash
through the cost-ledger dump proxy so response `usage` is persisted.
Ingest those dumps.
Print the ledger.
Keep door and lock frozen.
No `--relock`.
