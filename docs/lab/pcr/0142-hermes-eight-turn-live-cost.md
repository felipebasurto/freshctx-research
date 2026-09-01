# PCR 0142 — Hermes eight-turn live cost (nothing vs FreshCtx)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0142-hermes-live-cost-c189` / [145](https://github.com/felipebasurto/freshctx/pull/145) (draft)
- Base SHA: `d8cdd3d5a2ba04bb18ba026b989d74df6c1985fc` (PCR 0140 on main; live tip)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `live-host`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

PCR 0140 shipped the eight-turn cost harness and left live host empty.
This leftover records one live Hermes eight-turn cost run on tip
`d8cdd3d5a2ba04bb18ba026b989d74df6c1985fc`.
Arms are `nothing` vs FreshCtx (`freshctx-ts`: Isolated Semantic Engine /
Tree-sitter). FreshCtx without Tree-sitter does not exist. This leftover does
not run a third arm. Pi is not in this run.

**Honest result: FreshCtx is not cheaper overall. Turn 1 is the cost.**
Session `$`: `nothing` 0.02398968 vs `freshctx-ts` 0.02538536.
Turns 2–8 are cheaper per turn on FreshCtx. That does not flip the session
total. Printed turn-1 `42277` is the **sum of 7 provider scans**, not one fat
prompt. This leftover does not invent extra live `$`.

The product leftover (blocked re-read on turn 1) is a **separate PR** from
tip `d8cdd3d5`. This leftover does not implement it.

Official accepted table stays 549/0/0/549.
INDEX / METRICS / README PCR counts stay untouched (next pack).
No success board. No product code. `src/adapters` stay frozen.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.

## What we did

1. Wrote this PCR with the live Hermes eight-turn cost table from tip
   `d8cdd3d5a2ba04bb18ba026b989d74df6c1985fc`.
2. Did not edit INDEX, METRICS, or README PCR counts. Living-docs PCR count
   is the next pack.
3. Did not edit adapters, `src/`, door, lock, or harness behavior.
4. Did not `--relock`.
5. Same Cloud Agent wrote this PCR.
6. Did not invent extra live `$`, extra live turn rows, or a Pi arm.
7. Did not re-run hosts on this leftover.
8. Did not implement the product leftover. That is a separate PR from
   tip `d8cdd3d5`.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `nothing` | no | n/a |
| `freshctx-ts` | yes | on (Tree-sitter is the Isolated Semantic Engine default) |

Host: `hermes` only.
Model remains `deepseek-v4-flash` only.
Host never exposes a Tree-sitter toggle.
FreshCtx without Tree-sitter does not exist.

## Turns

Eight provider turns from `session.mjs` (`t1-read` through `t8-ask-again`).
Not the two-turn measure packs. Two-turn ingest stays INVALID as a
long-session cost table (PCR 0140).

## Cost proxy

Same cited table as PCR 0137 / PCR 0140 (version 1, 2026-09-01,
[DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)).
Default off-peak cache-miss.
`$` is computed only from provider tokens.
`$` is that formula on those tokens, not a billed invoice.
This leftover does not invent a second `$` column.

## Live Hermes eight-turn (official Hermes @ `d8cdd3d`)

Tip `d8cdd3d5a2ba04bb18ba026b989d74df6c1985fc`.
Model `deepseek-v4-flash`.
Pi not in this run.

### Arm totals

These are the only live session `$` this leftover records.

| host | arm | request_bytes | prompt_tokens | completion_tokens | cost_proxy_usd |
|---|---|---:|---:|---:|---:|
| hermes | `nothing` | 401030 | 104109 | 1645 | 0.02398968 |
| hermes | `freshctx-ts` | 434768 | 104480 | 3636 | 0.02538536 |

FreshCtx minus `nothing`:

| metric | delta |
|---|---:|
| request_bytes | +33738 |
| prompt_tokens | +371 |
| completion_tokens | +1991 |
| cost_proxy_usd | +0.00139568 |

Those deltas are arithmetic on the two arm totals above. They are not a
new live capture.

FreshCtx is **not** cheaper overall.

### Turn 1 is the cost

| host | arm | request_bytes | tokens | cost_proxy_usd |
|---|---|---:|---:|---:|
| hermes | `nothing` | 50576 | 11630 | 0.003 |
| hermes | `freshctx-ts` | 178446 | 42277 | 0.010 |

Turn-1 `$` is the operator-reported rounded figure. This leftover does not
recompute a more precise turn-1 `$` from those token counts.

Printed FreshCtx `42277` is the **sum of 7 provider scans**, not one fat
prompt.

| host | arm | scans | tool calls | wall | largest scan `prompt_tokens` |
|---|---|---:|---:|---:|---:|
| hermes | `nothing` | 4 | 4 | 9s | 5707 |
| hermes | `freshctx-ts` | 8 | 12 | 18s | 6597 |

Largest FreshCtx scan is 6597 versus `nothing` 5707.
FreshCtx turn 1 is more scans and more tool calls, not one oversized body.

### Turn 1 why (exact)

Trial wants `read_file` `scope=symbol` selector `settleDailyLedger`.
FreshCtx **blocked re-read** on that turn.
Isolated Semantic Engine (Tree-sitter) printed on scan `009` only
(414 content-bytes).
No WASM in the turn-1 bodies.
No whole `settlement.ts` in the turn-1 bodies.

`failClosed=2` on turn-1 retry scans. Those retry scans are missing some
`prompt_tokens`. Combined turn 1 still summed the provider usage that was
present (7 provider scans → printed `42277`).

Turn 1 is `mixed` on both arms.
Turns 2–8 are clean `provider` on both arms.

Turns 2–8 are cheaper per turn on FreshCtx. This leftover does not invent
per-turn `$`, tokens, or bytes for turns 2–8.

The product leftover (blocked re-read / extra turn-1 scans) is a
**separate PR** from tip `d8cdd3d5`. This leftover does not implement it.

No API key is recorded. This leftover never pastes a key.

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

This-run TAP is pasted only after `npm test` on this leftover. The first
revision of this PCR does not invent a TAP row.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | pending this leftover | n/a | real TAP will be pasted; not invented |
| `npm run evaluate` | pending this leftover | n/a | paper trail only; no policy, door, or lock edit |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live long-session host | already captured | n/a | table above is the remesure; this leftover does not re-run hosts |

## Metric snapshot

| metric | official `79958de` | PCR 0142 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| live Hermes `nothing` `$` | n/a | **0.02398968** | live eight-turn; not invented |
| live Hermes `freshctx-ts` `$` | n/a | **0.02538536** | live eight-turn; not cheaper overall |
| live Hermes session `$` delta | n/a | **+0.00139568** | FreshCtx minus `nothing` |
| live Hermes t1 `$` | n/a | FreshCtx 0.010 vs `nothing` 0.003 | t1 is the cost; 42277 is sum of 7 provider scans |
| live Pi eight-turn `$` | n/a | **none** | Pi not in this run |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
FreshCtx is not cheaper overall on this Hermes eight-turn run
(`nothing` 0.02398968 vs `freshctx-ts` 0.02538536).
Turn 1 is the cost. Printed `42277` is the sum of 7 provider scans, not one
fat prompt. Largest scan 6597 vs `nothing` 5707.
FreshCtx turn 1: 8 scans / 12 tool calls / 18s vs `nothing` 4 / 4 / 9s.
Blocked re-read. Isolated Semantic Engine only on scan `009` (414
content-bytes). No WASM and no whole `settlement.ts` in turn-1 bodies.
Turns 2–8 are cheaper per turn on FreshCtx. That leftover is recorded, not
turned into a product claim.
The product leftover is a separate PR from tip `d8cdd3d5`. Not this PR.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.

## Conflicts with constitutions

none observed.

## Limitations

Pi is not in this run.
Turn-1 `$` is rounded as reported (`0.010` / `0.003`).
Printed `42277` is a 7-scan sum, not one prompt.
This leftover does not invent per-turn `$` for turns 2–8.
`failClosed=2` on turn-1 retry scans omitted some `prompt_tokens`; combined
turn 1 still summed provider usage.
Turn 1 is `mixed` on both arms.
Cost proxy is cited list price, cache-unaware by default, not a billed invoice.
Living-docs PCR count (on-disk files vs README / INDEX pin 135) is the next
pack. Not a merge hole.
This leftover does not append INDEX / METRICS or bump README PCR counts.
This leftover does not change product code.
The product leftover (blocked re-read) is a separate PR from tip `d8cdd3d5`.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout.
Not a paper result.
Official table is not replaced.

## Recommended next experiment

Product leftover (blocked re-read / extra turn-1 scans) is a **separate PR**
from tip `d8cdd3d5`. Do not implement it on this leftover.
A later paper trail may run the same eight-turn battery on official Pi.
Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
