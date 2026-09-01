# PCR 0148 — t4 Isolated Semantic Engine symbol close (fail-closed)

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0148-t4-ise-close-3257` (draft)
- Base SHA: `495773c0886fdaa0bb3a31c4e446c8d990e34576` (PR 150 squash; PCR 0147 living-docs catch-up; public count 143)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `adapter-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

PCR 0139 live 4-turn Pi/Hermes on `dd9ad11` printed Isolated Semantic Engine
on `freshctx-ts` turns 2–3, then t4 `resolution=none` (symbol did not close).
This leftover investigates that named hole from the real adapter path and
PCR 0139. It does not guess from the name.

**Cause (measured on replay):** after t3 apply-acks `lastInjectedRevision`,
t4 is unchanged. `shouldCollapseCurrentProjection` treated the Isolated
Semantic Engine symbol as skip-eligible and emptied the live tail
(`resolveProjectionText` → `""`). The dump scanner then prints
`resolution=none` because no `resolution=` attribute remains. Isolated
Semantic Engine refresh still ran; the closed `<freshctx-unit>` was dropped.
File-scope unchanged collapse (PCR 0103 / 0093) is unchanged.

**Fail-closed:** a selected unit with `scope=symbol` and
`resolutionMethod=isolated-semantic-engine` must stay on the live tail.
Empty-tail collapse is not allowed for that unit.

Official accepted table stays 549/0/0/549.
Does not replace PCR 0142 paper (dest `d8cdd3d5`).
Tree-sitter is the Isolated Semantic Engine default. This leftover does not
nickname Tree-sitter.
`src/anchors.mjs` stays frozen. `bench/repos.lock.json` stays frozen.
No `--relock`. Never paste the key. Do not invent TAP, Pass@1, or dollars.

## What we did

1. Traced PCR 0139 t4 `resolution=none` to `shouldCollapseCurrentProjection`
   emptying the Isolated Semantic Engine symbol tail on the first unchanged
   later turn.
2. Fail-closed that collapse in `adapters/request-prune.mjs`.
3. Added `test/pcr-0148-t4-ise-symbol-close.test.mjs` (Pi + Hermes ST0→ST1→ST2
   then t4-unchanged; dump scan must stay `isolated-semantic-engine`).
4. Wrote this PCR and appended INDEX / METRICS.
5. Bumped public PCR count to 144 so living-docs matches on-disk PCR files.
6. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
7. Did not `--relock`.
8. Same Cloud Agent wrote PCR, INDEX, and METRICS.
9. Did not invent TAP, SWE scores, or live `$`.
10. Did not replace PCR 0142 paper.
11. Did not re-run live hosts on this leftover.

## Arms

| arm | FreshCtx | Isolated Semantic Engine / Tree-sitter |
|---|---|---|
| `freshctx-ts` | yes | on (Tree-sitter is the Isolated Semantic Engine default) |

Replay only. Host never exposes a Tree-sitter toggle.
FreshCtx without Tree-sitter is out of scope for this leftover.
Model remains `deepseek-v4-flash` only on the PCR 0139 live table this leftover
does not re-run.

## Turns

| turn | mutate | expected Isolated Semantic Engine close |
|---|---|---|
| 1 `t1-read` | none | yes (first inject) |
| 2 `t2-settle` | `flip-settle` ST0→ST1 | yes |
| 3 `t3-settle` | `flip-settle-2` ST1→ST2 | yes |
| 4 `t4-unchanged` | none | **yes** (was `resolution=none` on PCR 0139) |

## Benchmarks run

This leftover does not replace the official accepted table.
Official accepted TAP remains **549 pass / 0 fail / 0 skipped / 549 total**.

`node --test test/pcr-0148-t4-ise-symbol-close.test.mjs` on this HEAD:

```
1..4
# tests 4
# pass 4
# fail 0
# skipped 0
```

This-run Cloud Agent TAP after `npm test` is recorded below. Isolated Semantic
Engine WASM is missing on this checkout unless the print says otherwise.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pcr-0148-t4-ise-symbol-close.test.mjs` | yes | 0 | TAP above |
| `npm test` | pending this-run | — | real TAP pasted after the suite |
| `npm run evaluate` | pending this-run | — | hard gate follows this-run TAP |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |
| live host | no | n/a | product leftover; PCR 0139 table is the named hole |

## Metric snapshot

| metric | official `79958de` | PCR 0148 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| PCR 0148 tests | n/a | **4 / 4 / 0 / 0** | Isolated Semantic Engine symbol close |
| `npm test` TAP | 549/0/0/549 | this-run after suite | official table stays 549 |
| evaluate | n/a on official table | this-run after suite | official table not replaced |
| PCR 0142 dest `d8cdd3d5` | unchanged | not this file | paper trail stays there |
| live `$` invented here | n/a | **none** | no live remesure |
| Pass@1 invented here | n/a | **none** | not a SWE dump |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

## Comparison

No Level 4 sentence.
Measured on synthetic replay: t4-unchanged Isolated Semantic Engine symbol
stays `resolution="isolated-semantic-engine"` on Pi and Hermes.
PCR 0139 live `resolution=none` was empty-tail collapse, not an Isolated
Semantic Engine miss.
Not a public-repo performance claim.
Not a CORVUS comparison.
Not a SWE-bench dump.
Not a billed invoice.
Not a replacement for PCR 0142.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
Isolated Semantic Engine WASM is missing on this Cloud Agent checkout for the
living suite that needs the real parser.
Official table is not replaced.
File-scope unchanged collapse is intentionally unchanged.

## Recommended next experiment

Keep door and lock frozen.
No `--relock`.
Stay draft until a human accepts this paper trail.
Never paste an API key.
Do not replace PCR 0142.
A later live remesure can confirm t4 `freshctx-ts` prints Isolated Semantic
Engine again.
