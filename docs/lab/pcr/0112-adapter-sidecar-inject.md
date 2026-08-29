# PCR 0112 — Inject Tree-sitter sidecar into live-shaped Pi/Hermes adapters

- Date (UTC): 2026-08-29
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/adapter-sidecar-inject-e24c` (draft PR #107)
- Merge-base: `8952f4fb6e4c1a8f07c89e9605b5e31a56f5df16` (origin/main, PCR 0111)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `replay`; `adapter-only`; `measurement`
- Decision: **review**

## Hypothesis or change

PCR 0111 put Python/JS/TS WASM parsing behind `{path,bytes}→{units,error}` at
`sidecar/treesitter/parse.mjs`.
Pi and Hermes adapters still constructed `FreshCtxEngine()` with no
`sidecarRunner`.
Symbol-scoped refresh never reached `parseSource` on the adapter path.
Reviewer no-merge on first HEAD `daf53dc` found factory inject alone was not
enough.
Observation keys in `readObservationKey` and `officialObservationKey` still
mapped symbol reads to `file:path`, so two symbols on one file last-won.

## What we did

Added `adapters/engine-factory.mjs` with `createAdapterEngine()` defaulting to
`createSidecarRunner()`.
Pi `extension.ts` and `replay.mjs` use the factory and track `scope: "symbol"`.
Hermes `bridge.mjs` and `replay.mjs` use the factory and track symbol scope.
`readObservationKey` and `officialObservationKey` now emit
`symbol:path:selector` keys distinct from `file:path`.
Hermes replay accepts optional `sidecarRunner` for fail-closed probes.
Added `test/pcr-0112-adapter-sidecar-symbol-refresh.test.mjs` (7 tests).
No edit to `src/`, door, lock, holdout gold, weights, or thresholds.
No live Pi/Hermes runs.

## Benchmarks run

Canonical TAP is this post-review run on branch HEAD (merge-base `8952f4f`).
dest: `cloud-agent`.
env: `bench/hosts/hermes` absent; go-tools fixture repos not fetched.

```
1..405
# tests 405
# suites 0
# pass 379
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

Official accepted table on merge-base `8952f4fb` remains **381 pass / 0 fail /
17 skipped / 398 total** until Bench measures a squash.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above |
| `npm run check` | yes | 0 | includes observation-key + sidecar paths |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Metric snapshot

| metric | origin/main `8952f4f` | PCR 0112 (this run) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` (hold; not re-run this review pass) | `0` |
| `npm test` TAP `# tests` | 398 | **405** | **+7** |
| `npm test` TAP `# pass` | 372 | **379** | **+7** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

## Comparison

No Level 4 sentence.
Adapter-only sidecar wiring on synthetic Pi/Hermes replay.
Not a public-repo performance claim and not a CORVUS comparison.
Measured: two Python symbols on one file stay distinct through observation keys
and both refresh via sidecar on Pi replay.
Measured: Hermes TypeScript symbol refresh on a two-function file projects only
the selected symbol's updated body and omits the sibling marker.
Measured: Hermes symbol refresh with `missingSidecarRunner()` does not inject
relocated bytes.

## Conflicts with constitutions

none observed.

## Limitations

Go and Rust still use regex in the sidecar.
Live Pi/Hermes hosts were not run; replay only.
Symbol-shaped holdout units still need a dedicated pack.
One sidecar spawn per refresh call; no warm daemon.

## Reviewer no-merge (`daf53dc` vs main `8952f4f`)

Hole 1 — observation keys collapsed symbol onto file.
`readObservationKey` and `officialObservationKey` returned `file:path` for
symbol scope.
Two symbol reads on one path last-won, so only one unit reached
`selectContext`/`refresh`.
Fix: `symbol:path:selector` keys.
Test: file + two symbols on one path stay three distinct active observations;
Pi dual-symbol refresh pins both `resolutionMethod: "sidecar"`.

Hole 2 — Hermes 0112 test did not prove sidecar.
Single-function fixture would pass on file-scope refresh.
Fix: two-function TypeScript file; symbol read for `alpha` only; projection
must include `return 99` and must not include sibling `BETA_SYMBOL_MARKER`.
Fail-closed probe: Hermes replay with `missingSidecarRunner()` omits relocated
bytes.

Hole 3 — METRICS.md not updated on first pass.
Fix: this review pass re-ran `npm test` and `npm run evaluate`; METRICS,
INDEX, and PCR carry the measured TAP line above.

## Next measurement

Symbol holdout pack with sidecar-proposed units, or live host confirm that read
tools pass `scope: "symbol"` + `selector` in production sessions.
