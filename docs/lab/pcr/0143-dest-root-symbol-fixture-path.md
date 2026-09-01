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
because that file is not there.

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
5. Added `test/pcr-0143-dest-root-symbol-fixture.test.mjs`.
6. Did not edit INDEX, METRICS, or README PCR counts.
7. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`,
   holdout packs, door, or lock.
8. Did not `--relock`.
9. Did not invent live `$` or TAP.

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

This-run TAP is pasted only after `npm test` on this leftover. Not invented.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | pending this leftover | n/a | real TAP will be pasted; not invented |
| `npm run evaluate` | pending this leftover | n/a | policy/door/lock unchanged |
| door/lock `git hash-object` | pending | n/a | must hold `f8771c93…` / `4a953591…` |

## Metric snapshot

| metric | official `79958de` | PCR 0143 (this leftover) | delta |
|---|---|---|---|
| official TAP | 549/0/0/549 | unchanged | official table not replaced |
| dest-root `src/settlement.ts` | missing | still missing | engine `.mjs` only |
| t1 forced symbol path | dest-root abs miss | `.work/<arm>/src/settlement.ts` when workspace env is set | path miss is the leftover |
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
