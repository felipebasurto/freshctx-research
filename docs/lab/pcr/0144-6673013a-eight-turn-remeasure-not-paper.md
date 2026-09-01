# PCR 0144 — Hermes eight-turn remesure on tip 6673013a (NOT-PAPER)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0144-6673013a-not-paper-d0da` / [147](https://github.com/felipebasurto/freshctx/pull/147) (draft)
- Base SHA: `6673013ab983686b0a32df94b4fcad4fcf02a616` (PCR 0143 on main; live tip)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `live-host`; `measurement`; `not-paper`
- Decision: **review** (PR stays draft)

**Label: NOT-PAPER.** Two dests on the same tip. Not one blended table.
This leftover does not replace PCR 0142.

## Hypothesis or change

PCR 0143 remapped symbol-scope host reads to `.work/<arm>` when the workspace
contains `src/settlement.ts`. This leftover records the live Hermes eight-turn
remesure on tip `6673013ab983686b0a32df94b4fcad4fcf02a616` only.

Dest `6673013a` was **overwritten** by a second auto-live. This leftover
labels **two tables**. It does not mix them. It does not treat the second
dest as a continuation of the first.

Arms are `nothing` vs FreshCtx (`freshctx-ts`: Isolated Semantic Engine /
Tree-sitter). FreshCtx without Tree-sitter does not exist. This leftover
does not run a third arm. Pi is not in this run.

**Honest result: this pack is NOT-PAPER.** Reasons that stay on the label:

1. Table 1 t8 FreshCtx dumps are missing.
2. `search_files` still probed dest-root. `hostReadArgsMatched=false` on
   both dests.
3. Table 1 t1 scan count is 7 vs 5 (operator order FreshCtx vs `nothing`;
   dest `d8cdd3d5` / PCR 0142 was 8 vs 4). Table 2 t1 is 6 vs 7.

Symbol `read_file` **HIT** `.work`. That hit does not clear the dest-root
`search_files` miss.

The product leftover (fail-close dest-root `search_files`) is a **separate
agent** `bc-922a7864`. This leftover does not implement it.

Official accepted table stays 549/0/0/549.
INDEX / METRICS / README PCR counts stay untouched (next pack).
No success board. No product code. `src/adapters` stay frozen.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.

PCR 0142 remains the paper trail for dest `d8cdd3d5`. This file does not
paste PCR 0142 session `$`, `prompt_tokens`, or turn-1 `42277` as if they
were this remesure.

## What we did

1. Wrote this PCR with two unmixed dest tables on tip `6673013a`.
2. Did not edit INDEX, METRICS, or README PCR counts. Living-docs PCR count
   is the next pack.
3. Did not edit adapters, `src/`, door, lock, or harness behavior.
4. Did not `--relock`.
5. Same Cloud Agent wrote this PCR.
6. Did not invent extra live `$`, extra live turn rows, or a Pi arm.
7. Did not invent Table 1 `$`. Table 1 `$` is **unknown**.
8. Did not invent `request_bytes`, `completion_tokens`, or a `prompt_tokens`
   breakdown. Those fields are **unknown** when not listed below.
9. Did not re-run hosts on this leftover.
10. Did not replace PCR 0142.
11. Did not implement the product leftover. That is `bc-922a7864`.

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
This leftover records Table 2 `$` as reported.
This leftover does **not** invent Table 1 `$` from Table 1 tok.

## Shared dest facts (both tables)

Tip `6673013ab983686b0a32df94b4fcad4fcf02a616`.
Model `deepseek-v4-flash`.
Pi not in this run.

Symbol `read_file` HIT `.work`.

`hostReadArgsMatched=false` because `search_files` still probed dest-root:

| arm | dest-root `search_files` probe |
|---|---|
| `nothing` | absolute dest-root `settlement.ts` |
| `freshctx-ts` | relative `src/settlement.ts` |

The t1 matcher is fail-closed. Dest-root `search_files` is the miss.
Relative dest-root `src/settlement.ts` must not pass.
The `.work` symbol `read_file` hit does not flip `hostReadArgsMatched`.

No API key is recorded. This leftover never pastes a key.

## Table 1 — first live (overwritten)

First dest on tip `6673013a`. Overwritten by the second auto-live.
Do not add these rows to Table 2.

t8 FreshCtx dumps: **missing**.
t8 FreshCtx: no dumps.

### t1 scans (Table 1 only)

Operator string: `7 vs 5`.
Order is FreshCtx vs `nothing` (same order as dest `d8cdd3d5` `8 vs 4`).

| host | dest | arm | t1 scans |
|---|---|---|---:|
| hermes | first live (overwritten) | `nothing` | 5 |
| hermes | first live (overwritten) | `freshctx-ts` | 7 |

Old dest `d8cdd3d5` (PCR 0142) was 8 vs 4. That is a **different dest**.
This leftover does not paste PCR 0142 tokens or `$` into Table 1.

### Session tok (Table 1 only)

`tok` is the reported session token figure. `prompt_tokens`,
`request_bytes`, `completion_tokens`, and arm totals beyond `tok` are
**unknown**. `$` is **unknown**. This leftover does not invent them.

| host | dest | arm | tok | prompt_tokens | request_bytes | completion_tokens | cost_proxy_usd |
|---|---|---|---:|---|---|---|---|
| hermes | first live (overwritten) | `nothing` | 157813 | unknown | unknown | unknown | unknown |
| hermes | first live (overwritten) | `freshctx-ts` | 112814 | unknown | unknown | unknown | unknown |

Table 1 `$` is unknown. Do not compute `$` from `tok`.

t8 FreshCtx missing is enough to keep this dest off a paper table.

## Table 2 — second auto-live (overwrote dest 6673013a)

Second dest on the **same** tip `6673013a`.
This dest overwrote Table 1. It is not a blended remesure.

t8: **present**.

`search_files` still fail-closed. Dest-root search is still the miss.
`hostReadArgsMatched=false` still.

### t1 scans (Table 2 only)

Operator string: `6 vs 7`.
Order is FreshCtx vs `nothing` (same order as Table 1 `7 vs 5`).

| host | dest | arm | t1 scans |
|---|---|---|---:|
| hermes | second auto-live | `nothing` | 7 |
| hermes | second auto-live | `freshctx-ts` | 6 |

Do not average these scans with Table 1.

### Session tok and `$` (Table 2 only)

`tok` is the reported session token figure.
`$` is the reported live session `$` for this dest.
`prompt_tokens`, `request_bytes`, and `completion_tokens` are **unknown**.
This leftover does not invent them.

| host | dest | arm | tok | prompt_tokens | request_bytes | completion_tokens | cost_proxy_usd |
|---|---|---|---:|---|---|---|---:|
| hermes | second auto-live | `nothing` | 147078 | unknown | unknown | unknown | 0.03332 |
| hermes | second auto-live | `freshctx-ts` | 148668 | unknown | unknown | unknown | 0.03432 |

Reported `$` only. FreshCtx `0.03432` vs `nothing` `0.03332`.
This leftover does not invent a more precise `$` or a billed invoice.
Arithmetic on those two reported figures is FreshCtx minus `nothing`
`+0.00100`. That arithmetic is not a new live capture.

t8 present does not make this dest a paper result.
`search_files` dest-root still fail-closes.

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..634
# tests 634
# pass 591
# fail 43
# skipped 0
```

This-run Cloud Agent TAP is **634 / 591 / 43 / 0**. That print is **not GHA**.
Isolated Semantic Engine WASM is missing on this checkout, so 42 fails print
`isolated-semantic-engine-missing` (or equivalent Isolated Semantic Engine /
Tree-sitter runner absence). The 43rd fail is living-docs `140 !== 135`.
That count leftover is not fixed on this PR. Official table is not replaced.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | this-run Cloud Agent TAP above; Isolated Semantic Engine WASM missing; living-docs `140 !== 135`; next pack; not GHA |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live long-session host | already captured | n/a | two dest tables above; this leftover does not re-run hosts |

## Metric snapshot

| metric | official `79958de` | PCR 0144 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| `npm test` TAP `# tests` | 549 | **634** | living suite; official table stays 549 |
| `npm test` TAP `# pass` | 549 | **591** | this checkout Isolated Semantic Engine WASM missing |
| `npm test` TAP `# fail` | 0 | **43** | 42 Isolated Semantic Engine WASM missing; 1 living-docs `140 !== 135`; not GHA |
| `npm test` TAP `# skipped` | 0 | **0** | `0` |
| evaluate | n/a on official table | hard gate failed on this-run TAP | official table not replaced |
| paper label | n/a | **NOT-PAPER** | t8 missing on Table 1; `search_files` dest-root; t1 7 vs 5 / 6 vs 7 |
| dest | n/a | two dests on tip `6673013a` | first live overwritten by second auto-live |
| Table 1 `nothing` tok | n/a | **157813** | `$` unknown; do not invent |
| Table 1 `freshctx-ts` tok | n/a | **112814** | `$` unknown; t8 FreshCtx missing |
| Table 1 t1 scans | n/a | FreshCtx 7 vs `nothing` 5 | not dest `d8cdd3d5` 8 vs 4 |
| Table 2 `nothing` tok / `$` | n/a | **147078** / **0.03332** | reported; not invented |
| Table 2 `freshctx-ts` tok / `$` | n/a | **148668** / **0.03432** | t8 present; still not paper |
| Table 2 t1 scans | n/a | FreshCtx 6 vs `nothing` 7 | do not blend with Table 1 |
| `hostReadArgsMatched` | n/a | **false** | `search_files` dest-root |
| symbol `read_file` | n/a | HIT `.work` | does not clear dest-root search |
| PCR 0142 dest `d8cdd3d5` | unchanged | not this file | do not mix those numbers here |
| live Pi eight-turn `$` | n/a | **none** | Pi not in this run |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
Not a paper result.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.

Table 1 and Table 2 are two dests on the same tip.
Do not blend tok, `$`, t1 scans, or t8 presence.

The product leftover is `bc-922a7864`. Not this PR.

## Conflicts with constitutions

none observed.

## Limitations

Pi is not in this run.
Table 1 `$` is unknown. This leftover does not invent it from `tok`.
`prompt_tokens`, `request_bytes`, and `completion_tokens` are unknown on
both dests.
This leftover does not invent per-turn `$` or per-turn tok.
Table 1 t8 FreshCtx dumps are missing.
Dest `6673013a` was overwritten. Table 1 is the overwritten dest, not a
recoverable on-disk capture on this leftover.
`search_files` dest-root still fail-closes on both dests.
Cost proxy is cited list price, cache-unaware by default, not a billed invoice.
Living-docs PCR count (on-disk files vs README / INDEX pin 135) is the next
pack. Not a merge hole.
This leftover does not append INDEX / METRICS or bump README PCR counts.
This leftover does not change product code.
The product leftover (`search_files` dest-root fail-close) is `bc-922a7864`.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout.
Official table is not replaced.

## Recommended next experiment

Product leftover (fail-close dest-root `search_files` so
`hostReadArgsMatched` can pass) is **`bc-922a7864`**. Do not implement it
on this leftover.
A later paper trail may re-run the eight-turn battery after that leftover
and keep one dest without overwrite.
Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not promote this pack off `not-paper` while Table 1 t8 is missing or
`search_files` dest-root still fail-closes.
