# PCR 0143 — Dest-root symbol read hits `.work/<arm>` fixture

- Date (UTC): 2026-09-01
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/dest-root-symbol-fixture-2418` (draft)
- Base SHA: `d8cdd3d5a2ba04bb18ba026b989d74df6c1985fc` (PCR 0140 on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `synthetic`; `harness-only`; `adapter-only`; `measurement`
- Decision: **review** (PR stays draft)

## Hypothesis or change

Live Hermes t1 on dest `d8cdd3d5` printed 42277 `prompt_tokens` as the **sum
of 7 provider scans**, not one fat prompt. FreshCtx t1 was 8 scans / 12 tool
calls / 18s versus `nothing` 4 / 4 / 9s. Isolated Semantic Engine printed on
scan `009` only (414 content-bytes).

The leftover hypothesis was a generic retry / blocked re-read loop. The dest
is a **path miss**. Dest-root `src/settlement.ts` is missing (engine `.mjs`
only). FreshCtx t1 abs-path reads miss the fixture at
`.work/<arm>/src/settlement.ts` and get live-projection markers. That is the
retry loop.

This leftover remaps symbol-scope host reads to the real fixture path when
`FRESHCTX_CWD` / `HERMES_TRIAL_WORKSPACE` / `PI_TRIAL_WORKSPACE` points at a
workspace that actually contains `src/settlement.ts`. Dest-root is ignored
because that file is not there. The t1 matcher is fail-closed: with a
workspace set, only that `.work/<arm>` fixture path passes. Relative
dest-root `src/settlement.ts` must not pass.

Official accepted table stays 549/0/0/549.
INDEX / METRICS / README PCR counts stay untouched (next pack).
PCR 0142 paper trail is a separate PR (145). Do not mix dest `44627749`.
No `--relock`. Never paste the key.

## What we did

1. `hostReadToolArgs({ workspace })` emits the absolute fixture path when the
   workspace contains `src/settlement.ts`.
2. `resolveHostReadWorkspace` reads `FRESHCTX_CWD`, then
   `HERMES_TRIAL_WORKSPACE`, then `PI_TRIAL_WORKSPACE`, and skips a dest-root
   that has no fixture.
3. Hermes / Pi force-host-read and launch env set those keys to the arm work
   dir.
4. Hermes engine `_workspace_cwd()` prefers `FRESHCTX_CWD` /
   `HERMES_TRIAL_WORKSPACE` over dest-root `getcwd()`.
5. Fail-closed the t1 matcher: workspace `.work` path only. Removed the
   `|| path === src/settlement.ts` OR that let dest-root miss pass.
6. Added `test/pcr-0143-dest-root-symbol-fixture.test.mjs`.
7. Did not edit INDEX, METRICS, or README PCR counts.
8. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
9. Did not `--relock`.
10. Did not invent live `$` or TAP.

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
1..634
# tests 634
# pass 591
# fail 43
# skipped 0
```

The 43 fails are `isolated-semantic-engine-missing` plus living-docs PCR
count (`138 !== 135`). Living-docs is the next pack. This leftover does
not chase README / INDEX PCR counts. That GHA-class Isolated Semantic
Engine WASM-missing suite is not invented.

`node --test test/pcr-0143-dest-root-symbol-fixture.test.mjs` is **5 pass / 0 fail**.
That row includes the fail-closed matcher: relative dest-root
`src/settlement.ts` does not pass when workspace is `.work/<arm>`.

This-run TAP after the matcher fail-close (HEAD after reviewer hole) is the
same real suite row, not invented.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| this-run `npm test` | yes | 1 | 634/591/43; Isolated Semantic Engine WASM missing; living-docs next pack; not official table |
| `node --test test/pcr-0143-dest-root-symbol-fixture.test.mjs` | yes | 0 | 5 pass / 0 fail |
| `npm run evaluate` | yes | 1 | hard gate: regression tests did not pass (status 1); benchmark body not reached |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`4a953591e4b175e9fd69f13d6012831b01116dce` |

## Metric snapshot

| metric | official `79958de` | PCR 0143 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| this-run Cloud Agent TAP | n/a | **634/591/43** | Isolated Semantic Engine WASM missing; living-docs next pack; not GHA |
| dest-root `src/settlement.ts` | missing | still missing | engine `.mjs` only |
| t1 forced symbol path | dest-root abs miss | `.work/<arm>/src/settlement.ts` when workspace env is set | path miss is the leftover |
| t1 matcher relative dest-root | OR `src/settlement.ts` still passed | **fail-closed**; relative dest-root must not pass | reviewer hole on `26c25561` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `4a953591…` | `4a953591…` | `0` |

No invented live `$`. PCR 0142 remains the paper trail for the dest
`d8cdd3d5` Hermes eight-turn totals.

## Comparison

No Level 4 sentence.
Not a public-repo performance claim.
The dest miss is dest-root `src/settlement.ts`, not a generic retry policy.

## Conflicts with constitutions

none observed.

## Limitations

This leftover does not re-run live Hermes or Pi.
Isolated Semantic Engine WASM may be missing on this Cloud Agent checkout.
Living-docs PCR count is the next pack. Not a merge hole.
This leftover does not append INDEX / METRICS or bump README PCR counts.
Official table is not replaced.

## Recommended next experiment

Re-run the eight-turn Hermes battery on dest with `FRESHCTX_CWD` pointed at
`.work/freshctx-ts`. Compare t1 scan count and Isolated Semantic Engine first
appearance against PCR 0142. Keep door and lock frozen. No `--relock`.
Stay draft until a human accepts this leftover.
