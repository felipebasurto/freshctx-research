# PCR 0117 — Pi auto-rpc host read args (settleDailyLedger)

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pcr-0117-auto-rpc-host-read-52b5` / draft
- Base SHA: `fdc49ae58f996daffae4e59afe7fabdc10f55670` (PCR 0116 squash on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `harness-only`; `measurement`
- Decision: **review**

## Hypothesis or change

PCR 0116 left live Pi auto-rpc letting the model pick tools on t1-read.
The host never passed `scope=symbol` with selector `settleDailyLedger`.
Observed t1 used bash grep plus offset/limit read.
The harness should force or inject `hostReadToolArgs()` from `pack.mjs` so FreshCtx receives the symbol-scope observation before the interior flip (`ST0`→`ST1`).

## What we did

1. Added `docs/lab/pi-trial-ts/force-host-read-core.mjs` and `force-host-read.mjs` Pi extension.
   Core mutates read input to `hostReadToolArgs()` and blocks bash/grep when `PI_TRIAL_FORCE_HOST_READ=1`.
2. Added `docs/lab/pi-trial-ts/auto-rpc-host-read.mjs` with strict t1 validation and `assertT1HostReadTools` fail-close.
3. Updated `docs/lab/pi-trial-ts/auto-rpc.mjs` to load the extension, set the env flag, and throw on invalid t1 host tools.
4. Added `test/pcr-0117-pi-auto-rpc-host-read.test.mjs` (11 tests) executing the extension core/wrapper and pinning leftover bash/offset failure.
5. Did not edit `src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`, holdout v0.2, door, or lock.
6. Did not `--relock` or change benchmark weights.
7. Model remains `deepseek-v4-flash` only.

## Arms (unchanged labels)

| arm | FreshCtx | Tree-sitter | turn-1 host read |
|---|---|---|---|
| `nothing` | no | n/a | `scope=symbol`, selector `settleDailyLedger` (forced in harness) |
| `freshctx-no-ts` | yes | off (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off`) | same |
| `freshctx-ts` | yes | on (default) | same |

## Benchmarks run

Canonical TAP from this run on branch HEAD after Tree-sitter WASM install
(`npm run ise:install`, base `fdc49ae`).

```
1..443
# tests 443
# suites 0
# pass 417
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

Official accepted TAP remains **407 pass / 0 fail / 17 skipped / 424 total** on base `fdc49ae`.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above (+11 vs base 432) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Metric snapshot

| metric | base `fdc49ae` | PCR 0117 (this run) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` (hold) | `697e74e3…` (hold) | `0` |
| `npm test` TAP `# tests` | 432 | **443** | **+11** |
| `npm test` TAP `# pass` | 406 | **417** | **+11** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

## Comparison

No Level 4 sentence.
Harness executes force-host-read core and wrapper in tests.
Every t1 tool must be a symbol-scope read of `settleDailyLedger`.
Leftover bash grep or offset/limit reads fail closed in auto-rpc and in tests.
Synthetic tests reject bash plus matching read as invalid.
No live Pi/Hermes rerun in this PR.

## Conflicts with constitutions

none observed.

## Limitations

Live three-arm battery on Mac is still pending after merge.
The force extension mutates model-chosen read calls rather than skipping the model on t1.
Dump scan token `Isolated Semantic Engine` remains the `resolutionMethod` code string only.

## Recommended next experiment

Rerun `auto-rpc.mjs` on Mac with official Pi and DeepSeek v4 flash.
Confirm t1 capture rows show `hostReadArgsMatched: true` and no bash grep tools.
Confirm turn-2 `.scan.json` on arm `freshctx-ts` omits sibling marker after Tree-sitter refresh.
