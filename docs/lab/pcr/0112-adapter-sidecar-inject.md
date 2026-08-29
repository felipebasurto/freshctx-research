# PCR 0112 — Inject Tree-sitter sidecar into live-shaped Pi/Hermes adapters

- Date (UTC): 2026-08-29
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/adapter-sidecar-inject-e24c`
- Merge-base: `8952f4fb6e4c1a8f07c89e9605b5e31a56f5df16` (origin/main, PCR 0111)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `replay`; `adapter-only`; `measurement`
- Decision: **review**

## Hypothesis or change

PCR 0111 put Python/JS/TS WASM parsing behind `{path,bytes}→{units,error}` at
`sidecar/treesitter/parse.mjs`, but Pi and Hermes adapters still constructed
`new FreshCtxEngine()` with no `sidecarRunner`. Symbol-scoped refresh never
reached `parseSource` on the adapter path.

Wire `createSidecarRunner()` into adapter engine construction and teach Pi/Hermes
read scope parsers to track `scope: "symbol"` reads so `engine.refresh` resolves
symbol units through the sidecar on replay-shaped paths.

## What we did

- Added `adapters/engine-factory.mjs` with `createAdapterEngine()` defaulting to
  `createSidecarRunner()`.
- Pi: `extension.ts` and `replay.mjs` use the factory; `readScopeFromInput`
  accepts `scope: "symbol"` + `selector`; `onToolResult` tracks symbol units.
- Hermes: `bridge.mjs` uses the factory; `readScopeFromHermesArgs` and
  `scopeFromObservation` accept symbol scope; `selectContext` tracks symbol units.
- `buildReadToolCall` in Pi and Hermes replay accepts `scope: "symbol"`.
- Added `test/pcr-0112-adapter-sidecar-symbol-refresh.test.mjs` (4 tests): Pi
  Python symbol refresh via sidecar; Hermes TypeScript symbol refresh via sidecar;
  scope parsers; fail-closed when sidecar missing.

No edit to `src/`, `src/anchors.mjs`, `bench/repos.lock.json`, holdout gold,
weights, or thresholds. No live Pi/Hermes runs.

## Benchmarks run

Canonical TAP on this tree (merge-base `8952f4f`). dest: `cloud-agent`. env:
`bench/hosts/hermes` absent; go-tools fixture repos not fetched.

```
1..402
# tests 402
# suites 0
# pass 376
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above |
| `npm run check` | yes | 0 | includes new adapter factory + sidecar paths |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `node bench/run.mjs` | yes | 0 | score 89.107165 |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; all six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |
| `npm run holdout:verify -- --pack=holdout-v0.2 --attestation=bench/packs/holdout-v0.2/provenance/freeze-attestation.json` | yes | 0 | `classification: "sealed"`, `valid: true` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Metric snapshot

| metric | origin/main `8952f4f` | PCR 0112 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` TAP `# tests` | 398 | **402** | **+4** |
| `npm test` TAP `# pass` | 372 | **376** | **+4** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| holdout v0.1 classify | `unsealed-regression` | `unsealed-regression` | `0` |
| holdout v0.2 classify | `sealed` | `sealed` | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

## Comparison

No Level 4 sentence. Adapter-only sidecar injection on synthetic Pi/Hermes
replay; not a public-repo performance claim and not a CORVUS comparison.

Measured: Pi Python and Hermes TypeScript symbol reads refresh through the
injected sidecar (`resolutionMethod: "sidecar"`) on replay-shaped paths after
on-disk mutation.

## Conflicts with constitutions

none observed.

## Limitations

- Go and Rust still use regex in the sidecar; symbol refresh for those languages
  works when injected but was not the PCR pin (Python/JS/TS WASM path).
- Live Pi/Hermes hosts were not run; replay only.
- Symbol-shaped holdout units still need a dedicated pack (0111 leftover).
- One sidecar spawn per refresh call; no warm daemon.

## Next measurement

Symbol holdout pack with sidecar-proposed units, or live host confirm that read
tools pass `scope: "symbol"` + `selector` in production sessions.
