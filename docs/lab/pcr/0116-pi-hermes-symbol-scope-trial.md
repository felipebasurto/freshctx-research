# PCR 0116 — Pi/Hermes symbol-scope trial harness (settleDailyLedger)

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0116-symbol-scope-trial-5c82` / #112 (draft)
- Base SHA: `5bb53c3e02a3a4b3394ce7e7bb297a5316f2acd8` (PCR 0115 squash on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `harness-only`; `replay`; `measurement`
- Decision: **review**

## Hypothesis or change

PCR 0113 still issued whole-file reads on turn 1.
Host tool args should use `scope=symbol` with selector `settleDailyLedger`.
The harness must pass that scope through to FreshCtx on Pi and Hermes replay.
Tree-sitter inside FreshCtx should refresh only the target symbol after the
interior flip (`ST0`→`ST1`) and omit sibling `settleWeeklyLedger` noise.

## What we did

1. Changed `docs/lab/pi-trial-ts/pack.mjs` turn-1 prompt to a symbol-scope read of
   `settleDailyLedger` and exported `hostReadToolArgs()`.
2. Left fixture `docs/lab/pi-trial-ts/fixture/src/settlement.ts` unchanged.
3. Added `test/pcr-0116-pi-hermes-symbol-scope-trial.test.mjs` (7 tests) pinning
   Pi and Hermes adapter replay for symbol tracking, Tree-sitter omission of `SW0`,
   and turn-2 `request_bytes` drop vs file-scope read on the same Tree-sitter arm.
4. Updated `test/pi-trial-ts-pack.test.mjs` for the new prompt and host args.
5. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`, holdout
   v0.2, door, or lock.
6. Did not `--relock` or change benchmark weights.

## Arms (unchanged labels)

| arm | FreshCtx | Tree-sitter | turn-1 host read |
|---|---|---|---|
| `nothing` | no | n/a | `scope=symbol`, selector `settleDailyLedger` |
| `freshctx-no-ts` | yes | off (`FRESHCTX_SIDECAR=off`) | same |
| `freshctx-ts` | yes | on (default) | same |

Model remains `deepseek-v4-flash` only.
Host never exposes a Tree-sitter toggle.
Tree-sitter is inside FreshCtx.

## Benchmarks run

Canonical TAP from this run on branch HEAD after Tree-sitter WASM install
(`npm run sidecar:install`, base `5bb53c3`).

```
1..432
# tests 432
# suites 0
# pass 406
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

Official accepted TAP remains **395 pass / 0 fail / 17 skipped / 412 total**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above (+8 vs base 424) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Metric snapshot

| metric | base `5bb53c3` | PCR 0116 (this run) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` (hold) | `697e74e3…` (hold) | `0` |
| `npm test` TAP `# tests` | 424 | **432** | **+8** |
| `npm test` TAP `# pass` | 398 | **406** | **+8** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

## Comparison

No Level 4 sentence.
Measured on synthetic replay: symbol-scope host read tracks `settleDailyLedger`
with `scope=symbol` on Pi and Hermes.
Measured: Tree-sitter arm turn-2 projection omits `settleWeeklyLedger` (`SW0`) and
carries flipped marker `ST1` with `resolution="sidecar"`.
Measured: Tree-sitter symbol-scope turn-2 serialized request bytes drop vs
file-scope read on the same arm.
Harness only.
No live Pi/Hermes rerun in this PR.

## Conflicts with constitutions

none observed.

## Limitations

Live three-arm battery on Mac is still pending.
Thinker will run Hermes 3-arm live from 1:1 after merge.
Dump scan token `sidecar` remains the `resolutionMethod` code string only.

## Recommended next experiment

Rerun the three-arm battery on Mac with official Pi + DeepSeek v4 flash.
Confirm turn-1 tool args show `scope=symbol` and selector `settleDailyLedger`.
Confirm turn-2 `.scan.json` omits sibling marker on arm `freshctx-ts`.
