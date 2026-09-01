# PCR 0147 — Docs-only INDEX/METRICS living-docs catch-up (0140–0146)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0147-living-docs-catchup-ad0a` (draft)
- Base SHA: `315199f977b5df00690e1bdca078dfd33e480054` (PR 149 squash; PCR 0146 remesure on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

PCR files 0140–0146 are already on main. INDEX and METRICS still stop at
0139 except INDEX row 0146 (PCR 0146 appended itself only). Living-docs
still pins 135 Public Change Records. That count mismatch is not a merge
hole; this leftover is that catch-up.

This leftover appends the missing INDEX and METRICS rows **from the
existing PCR files**. It does not invent TAP, tokens, or `$`. It does not
replace PCR 0142 paper (dest `d8cdd3d5`). Tree-sitter is the Isolated
Semantic Engine default. Official accepted table stays 549/0/0/549.

No product code. `src/`, adapters, door, and lock stay frozen.
No `--relock`.

## What we did

1. Appended INDEX rows 0140–0145 from the existing PCR files. INDEX row
   0146 was already on main and is left as written.
2. Appended METRICS rows 0140–0146 from the existing PCR files (synthetic
   ledger and live-host session).
3. Wrote this PCR 0147.
4. Bumped public PCR count to 143 so living-docs matches on-disk PCR files.
5. Did not edit adapters, `src/`, door, lock, or harness behavior.
6. Did not `--relock`.
7. Same Cloud Agent wrote PCR, INDEX, and METRICS.
8. Did not invent TAP, SWE scores, or extra live `$`.
9. Did not replace PCR 0142 paper.
10. Did not rewrite PCR 0142.

## Source rows already on disk

Numbers below are copied from the existing PCR files. They are not a new
live capture.

| PCR | this-run / GHA TAP from that file | live `$` from that file |
|---|---|---|
| [0140](0140-long-session-real-cost.md) | GHA `671b38bb` 619/617/2; this-run 619/576/43 | **none** (harness only) |
| [0141](0141-success-board-fail-closed.md) | this-run 617/574/43 | **none** (harness only) |
| [0142](0142-hermes-eight-turn-live-cost.md) | this-run 629/586/43 | dest `d8cdd3d5` `nothing` 0.02398968 vs `freshctx-ts` 0.02538536 |
| [0143](0143-dest-root-symbol-fixture-path.md) | this-run 634/591/43 | **none** |
| [0144](0144-6673013a-eight-turn-remeasure-not-paper.md) | this-run 634/591/43 | Table 1 `$` **unknown**; Table 2 `nothing` 0.03332 vs `freshctx-ts` 0.03432 |
| [0145](0145-dest-root-search-files.md) | this-run 638/595/43 | **none** |
| [0146](0146-874ef52b-post-0145-hermes-cost.md) | this-run 638/595/43 | dest `874ef52b` `nothing` 0.03112208 vs `freshctx-ts` 0.02211352 |

PCR 0142 remains the paper Hermes eight-turn cost on dest `d8cdd3d5`
(FreshCtx not cheaper; t1 42277 tok). This leftover does not paste those
figures as if they were a new remesure.

## Arms

No new host run. Tree-sitter is the Isolated Semantic Engine default on
the leftover packs that already recorded `freshctx-ts`. FreshCtx without
Tree-sitter does not exist on those leftovers that said so.

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

This-run Cloud Agent TAP is recorded after `npm test` on this leftover.
First revision does not invent TAP.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | pending this leftover | | real TAP after first commit; not invented |
| `npm run evaluate` | pending this leftover | | hard gate follows this-run TAP |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | docs-only catch-up; numbers already on disk |

## Metric snapshot

| metric | official `79958de` | PCR 0147 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| living PCR count | 135 (pin) | **143** | on-disk files after this PCR |
| INDEX 0140–0145 | missing | appended from existing PCR files | 0146 already on INDEX |
| METRICS 0140–0146 | missing | appended from existing PCR files | no invented `$` |
| PCR 0142 dest `d8cdd3d5` | unchanged | not this file | paper trail stays there |
| live `$` invented here | n/a | **none** | only numbers already on disk |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.
Not a new live host run.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
This leftover does not invent TAP before `npm test`.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout.
Official table is not replaced.
PCR 0144 stays `not-paper`. Table 1 `$` stays unknown.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
