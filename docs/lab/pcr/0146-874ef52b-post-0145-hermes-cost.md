# PCR 0146 — Hermes eight-turn remesure on tip 874ef52b (post-0145)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0146-874ef52b-cost-afde` (draft)
- Base SHA: `874ef52b555bf6dc2b690e5edd7b384f9eab5f7a` (PCR 0145 on main; PR 148 squash)
- Number: **0146**. PCR 0142 remains the paper Hermes eight-turn cost on dest
  `d8cdd3d5`. This leftover does not reuse or replace that number.
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `live-host`; `measurement`
- Decision: **review** (PR stays draft)

This leftover does not replace PCR 0142.

## Hypothesis or change

PCR 0145 fail-closed dest-root `search_files` of the settlement fixture.
This leftover records the post-0145 live Hermes eight-turn remesure on tip
`874ef52b555bf6dc2b690e5edd7b384f9eab5f7a` only.

Dest is `/workspace/freshctx-measure-874ef52b-cost-live`.
One-shot Hermes. Model `deepseek-v4-flash`.
Arms are `nothing` vs FreshCtx (`freshctx-ts`: Isolated Semantic Engine /
Tree-sitter). FreshCtx without Tree-sitter does not exist. This leftover
does not run a third arm. Pi is not in this run.
This leftover did not touch dest `6673013a`.

`hostReadArgsMatched=true` on both t1 (`read_file`).
t1 scans: `nothing` 4 (002–005); `freshctx-ts` 5 (002–006).
`failClosed=2` on both t1 (missing provider `prompt_tokens`; scan mixed).
Combined print-ledger source is still `provider`.

Printed session `$`: `nothing` 0.03112208 vs `freshctx-ts` 0.02211352.
Those figures are this dest only. They do not replace PCR 0142.

PCR 0142 remains the paper Hermes eight-turn cost on dest `d8cdd3d5`
(FreshCtx not cheaper; t1 42277 tok). This file does not paste PCR 0142
session `$`, `prompt_tokens`, or turn-1 `42277` as if they were this
remesure.

Official accepted table stays 549/0/0/549.
INDEX gets this PCR row with the real session `$`.
README / living-docs PCR pin stays 135 (next pack).
METRICS stays untouched.
No success board. No product code. `src/adapters` stay frozen.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.

## What we did

1. Wrote this PCR with the live Hermes eight-turn remesure from dest
   `/workspace/freshctx-measure-874ef52b-cost-live` on tip `874ef52b`.
2. Appended INDEX row 0146 with the real session `$`.
3. Did not bump README / living-docs PCR pin (135). Living count is the
   next pack.
4. Did not edit METRICS.
5. Did not edit adapters, `src/`, door, lock, or harness behavior.
6. Did not `--relock`.
7. Same Cloud Agent wrote this PCR.
8. Did not invent extra live `$`, extra live turn rows, or a Pi arm.
9. Did not invent per-scan `prompt_tokens` for the `failClosed=2` t1 scans.
10. Did not re-run hosts on this leftover.
11. Did not replace PCR 0142.
12. Did not touch dest `6673013a`.

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

Same cited table as PCR 0137 / PCR 0140 / PCR 0142 (version 1, 2026-09-01,
[DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)).
Default off-peak cache-miss.
`$` is computed only from provider tokens.
`$` is that formula on those tokens, not a billed invoice.
This leftover records the printed print-ledger `$` as reported.
This leftover does not invent a second `$` column.

## Live Hermes eight-turn (official Hermes @ `874ef52b`)

Tip `874ef52b555bf6dc2b690e5edd7b384f9eab5f7a`.
Dest `/workspace/freshctx-measure-874ef52b-cost-live`.
Model `deepseek-v4-flash`.
Pi not in this run.
This leftover did not touch dest `6673013a`.

`hostReadArgsMatched=true` both t1 (`read_file`).

| host | dest | arm | t1 `hostReadArgsMatched` | t1 tool |
|---|---|---|---|---|
| hermes | `/workspace/freshctx-measure-874ef52b-cost-live` | `nothing` | true | `read_file` |
| hermes | `/workspace/freshctx-measure-874ef52b-cost-live` | `freshctx-ts` | true | `read_file` |

### t1 scans

| host | dest | arm | t1 scans | scan ids |
|---|---|---|---:|---|
| hermes | `/workspace/freshctx-measure-874ef52b-cost-live` | `nothing` | 4 | 002–005 |
| hermes | `/workspace/freshctx-measure-874ef52b-cost-live` | `freshctx-ts` | 5 | 002–006 |

`failClosed=2` on both t1. Those scans are missing some provider
`prompt_tokens` (scan mixed). Combined print-ledger source is still
`provider`. This leftover does not invent the missing scan tokens.

No API key is recorded. This leftover never pastes a key.

### Print-ledger turns

Columns are the printed print-ledger fields: turn, `request_bytes`,
`prompt_tokens`, `completion_tokens`, source, `$`.
This leftover does not invent cumulative columns.

| host | arm | turn | request_bytes | prompt_tokens | completion_tokens | token_source | cost_proxy_usd |
|---|---|---:|---:|---:|---:|---|---:|
| hermes | `nothing` | 1 | 95026 | 23754 | 800 | provider | 0.00575388 |
| hermes | `nothing` | 2 | 38418 | 10171 | 7 | provider | 0.00224224 |
| hermes | `nothing` | 3 | 83951 | 22525 | 384 | provider | 0.00520894 |
| hermes | `nothing` | 4 | 45503 | 12354 | 7 | provider | 0.00272250 |
| hermes | `nothing` | 5 | 45761 | 12411 | 7 | provider | 0.00273504 |
| hermes | `nothing` | 6 | 98643 | 27005 | 114 | provider | 0.00601634 |
| hermes | `nothing` | 7 | 52852 | 14594 | 7 | provider | 0.00321530 |
| hermes | `nothing` | 8 | 53110 | 14651 | 7 | provider | 0.00322784 |
| hermes | `freshctx-ts` | 1 | 106943 | 25173 | 633 | provider | 0.00595584 |
| hermes | `freshctx-ts` | 2 | 32225 | 7893 | 7 | provider | 0.00174108 |
| hermes | `freshctx-ts` | 3 | 64130 | 15634 | 199 | provider | 0.00357082 |
| hermes | `freshctx-ts` | 4 | 32611 | 7964 | 43 | provider | 0.00178046 |
| hermes | `freshctx-ts` | 5 | 32869 | 8021 | 43 | provider | 0.00179300 |
| hermes | `freshctx-ts` | 6 | 66301 | 16156 | 116 | provider | 0.00363088 |
| hermes | `freshctx-ts` | 7 | 33402 | 8135 | 68 | provider | 0.00183458 |
| hermes | `freshctx-ts` | 8 | 33660 | 8192 | 7 | provider | 0.00180686 |

### Arm totals

These are the only live session `$` this leftover records.

| host | arm | turns | request_bytes | prompt_tokens | completion_tokens | token_source | cost_proxy_usd |
|---|---|---:|---:|---:|---:|---|---:|
| hermes | `nothing` | 8 | 513264 | 137465 | 1333 | provider | 0.03112208 |
| hermes | `freshctx-ts` | 8 | 402141 | 97168 | 1116 | provider | 0.02211352 |

FreshCtx minus `nothing` (arithmetic on the two arm totals above; not a
new live capture):

| metric | delta |
|---|---:|
| request_bytes | -111123 |
| prompt_tokens | -40297 |
| completion_tokens | -217 |
| cost_proxy_usd | -0.00900856 |

Turn 1 FreshCtx minus `nothing` (arithmetic on the printed t1 rows; not a
new live capture):

| metric | delta |
|---|---:|
| request_bytes | +11917 |
| prompt_tokens | +1419 |
| completion_tokens | -167 |
| cost_proxy_usd | +0.00020196 |

Turns 2–8 are cheaper per turn on FreshCtx in the printed ledger.
That leftover is recorded. It does not replace PCR 0142.

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

This-run Cloud Agent TAP is pasted after `npm test` on this leftover.
This leftover does not invent TAP.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | pending this-run | n/a | TAP pasted after this leftover runs it; not invented |
| `npm run evaluate` | pending this-run | n/a | hard gate expected if this-run TAP fails |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live long-session host | already captured | n/a | dest `/workspace/freshctx-measure-874ef52b-cost-live`; this leftover does not re-run hosts |

## Metric snapshot

| metric | official `79958de` | PCR 0146 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP | 549/0/0/549 | pending this-run | not invented |
| live Hermes `nothing` `$` | n/a | **0.03112208** | dest `874ef52b`; not invented |
| live Hermes `freshctx-ts` `$` | n/a | **0.02211352** | dest `874ef52b`; not invented |
| live Hermes session `$` delta | n/a | **-0.00900856** | arithmetic on the two arm totals |
| live Hermes t1 `$` | n/a | FreshCtx 0.00595584 vs `nothing` 0.00575388 | t1 still slightly higher; not PCR 0142 `42277` |
| t1 scans | n/a | `nothing` 4 (002–005); `freshctx-ts` 5 (002–006) | not dest `d8cdd3d5` 8 vs 4 |
| `hostReadArgsMatched` | n/a | **true** both t1 | `read_file`; post-0145 dest-root `search_files` fail-close |
| t1 `failClosed` | n/a | **2** both arms | scan mixed; combined ledger still `provider` |
| PCR 0142 dest `d8cdd3d5` | unchanged | not this file | paper trail stays there; do not mix those numbers here |
| dest `6673013a` | n/a | not touched | PCR 0144 leftover; not this remesure |
| live Pi eight-turn `$` | n/a | **none** | Pi not in this run |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.

PCR 0142 remains the paper Hermes eight-turn cost on dest `d8cdd3d5`
(FreshCtx not cheaper; t1 42277 tok).
This leftover is the post-0145 remesure on dest `874ef52b` only.

## Conflicts with constitutions

none observed.

## Limitations

Pi is not in this run.
`failClosed=2` on both t1 omitted some scan `prompt_tokens`; combined
print-ledger source is still `provider`.
This leftover does not invent those missing scan tokens.
Cost proxy is cited list price, cache-unaware by default, not a billed invoice.
Living-docs PCR count (on-disk files vs README / INDEX pin 135) is the next
pack. Not a merge hole.
This leftover appends INDEX row 0146 only. It does not backfill 0140–0145
INDEX rows. It does not bump README PCR counts. It does not edit METRICS.
This leftover does not change product code.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout.
Official table is not replaced.

## Recommended next experiment

Living-docs PCR count (README / INDEX pin 135 vs on-disk files) is the
**next pack**. Do not chase it on this leftover.
A later paper trail may run the same eight-turn battery on official Pi.
Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
