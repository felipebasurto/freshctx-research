# PCR 0144 — Dest-root `search_files` fail-closed for settlement fixture

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/dest-root-search-fail-close-538f` (draft)
- Base SHA: `6673013ab983686b0a32df94b4fcad4fcf02a616` (PCR 0143 on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `adapter-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Bench remeasure on tip `6673013a`: symbol `read_file` HIT `.work`.
`hostReadArgsMatched=false` because `search_files` still probed dest-root
(`nothing`: abs dest-root `settlement.ts`; FreshCtx: relative
`src/settlement.ts`). Dest-root `search_files` counted as a t1 miss even
when the fixture read hit `.work`. t8 FreshCtx no dumps is recorded, not
fixed here.

This leftover fail-closes dest-root `search_files` of the settlement
fixture when workspace is `.work/<arm>`. Dest-root search is not the t1
match. Relative dest-root `src/settlement.ts` and abs dest-root
`settlement.ts` do not fail t1 when the `.work` symbol read hits.

Official accepted table stays 549/0/0/549.
INDEX / METRICS / README PCR counts stay untouched (next pack).
Do not mix dest `d8cdd3d5` paper table (PCR 0142).
No `--relock`. Never paste the key. No live rerun on this leftover.

## What we did

1. `isDestRootSettlementPath` / `isDestRootSettlementSearch` treat relative
   `src/settlement.ts` and abs dest-root `settlement.ts` as dest-root when
   workspace is the `.work` fixture. The `.work` fixture path is not dest-root.
2. Hermes / Pi t1 matcher skips dest-root settlement `search_files`. Dest-root
   search alone must not pass. Fixture `.work` `read_file` + dest-root search
   is a t1 hit.
3. Force-host-read blocks dest-root settlement `search_files`.
4. Added `test/pcr-0144-dest-root-search-files.test.mjs`.
5. Did not edit INDEX, METRICS, or README PCR counts.
6. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
7. Did not `--relock`.
8. Did not invent live `$` or TAP.
9. Did not mix dest `d8cdd3d5` paper table.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `nothing` | no | n/a |
| `freshctx-ts` | yes | on (Tree-sitter is the Isolated Semantic Engine default) |

Model remains `deepseek-v4-flash` only.
Host never exposes a Tree-sitter toggle.
FreshCtx without Tree-sitter does not exist.

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

This-run Cloud Agent TAP (Isolated Semantic Engine WASM missing):

```
1..638
# tests 638
# pass 595
# fail 43
# skipped 0
```

The 43 fails are `isolated-semantic-engine-missing` plus living-docs PCR
count (`140 !== 135`). Living-docs is the next pack. This leftover does
not chase README / INDEX PCR counts. That GHA-class Isolated Semantic
Engine WASM-missing suite is not invented.

`node --test test/pcr-0144-dest-root-search-files.test.mjs` is **4 pass / 0 fail**.
That row includes dest-root `search_files` fail-closed: dest-root search
alone is not the t1 match; dest-root search plus `.work` fixture read is
a t1 hit.

Isolated leftover + 0143/0132/0117 is **32 pass / 0 fail**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| this-run `npm test` | yes | 1 | 638/595/43; Isolated Semantic Engine WASM missing; living-docs next pack; not official table |
| `node --test test/pcr-0144-dest-root-search-files.test.mjs` | yes | 0 | 4 pass / 0 fail |
| isolated leftover + 0143/0132/0117 | yes | 0 | 32 pass / 0 fail |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |

## Metric snapshot

| metric | official `79958de` | PCR 0144 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| this-run Cloud Agent TAP | n/a | **638/595/43** | Isolated Semantic Engine WASM missing; living-docs next pack; not GHA |
| dest-root `src/settlement.ts` | missing | still missing | engine `.mjs` only |
| t1 fixture `read_file` | HIT `.work` on `6673013a` | still HIT `.work` | PCR 0143 hold |
| dest-root `search_files` as t1 | counted as miss (`hostReadArgsMatched=false`) | **fail-closed**; not the t1 match | leftover on `6673013a` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

No invented live `$`. PCR 0142 remains the paper trail for dest `d8cdd3d5`.
Do not mix that table here.

## Comparison

No Level 4 sentence.
Not a public-repo performance claim.
Dest-root `search_files` of the settlement fixture is not the t1 match.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
t8 FreshCtx no dumps is recorded, not fixed.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout.
Living-docs PCR count is the next pack. Not a merge hole.
This leftover does not append INDEX / METRICS or bump README PCR counts.
Official table is not replaced.

## Recommended next experiment

Re-run the eight-turn Hermes battery on dest with dest-root `search_files`
fail-closed. Compare t1 `hostReadArgsMatched` and t8 FreshCtx dumps against
the `6673013a` remesure. Keep door and lock frozen. No `--relock`.
Stay draft until a human accepts this leftover.
