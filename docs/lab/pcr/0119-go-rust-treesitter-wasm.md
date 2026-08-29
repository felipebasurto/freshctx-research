# PCR 0119 — Go and Rust Tree-sitter WASM grammars

- Date (UTC): 2026-08-29
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/go-rust-treesitter-engine-4013`
- Merge-base: `631819c` (origin/main, PCR 0118)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

## Hypothesis or change

Replace the Isolated Semantic Engine regex leftover for Go and Rust with
`web-tree-sitter` WASM grammars behind the existing stdin/stdout contract.
`src/` stays Node stdlib. PCR 0079 stateless byte-exact requests stay in force.

## What we did

`parseSource` routes `.go` and `.rs` through `extractTreeSitterUnits`. The
regex leftover (`REGEX_LANGUAGES`, `PATTERNS`, `parseWithRegex`, `braceBalance`)
is deleted.

Go queries extract `function_declaration` and `method_declaration`. Rust
queries extract `function_item`. Types, structs, traits, and enums are not
units. A Go method receiver type and a Rust `impl_item` type become the
enclosing class name so `qualifiedSelector` matches the TypeScript shape
(`class Server::method Serve`).

The JSON contract is unchanged. `{ path, bytes }` in. `{ units, error }` out.
Units still omit content. One spawn per call. No request-body store.
`hasError` still returns `{ units: [], error: "parse-broken" }`.

Packages `tree-sitter-go@0.25.0` and `tree-sitter-rust@0.24.0` ship
`tree-sitter-go.wasm` and `tree-sitter-rust.wasm`. They live only in the
Isolated Semantic Engine package, not in the root `package.json`.

No edit to `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs`. No
holdout gold, weight, threshold, or `bench/traces/holdout/**` edit. No laptop
`sealed` attestation.

## Benchmarks run

Targeted TAP (`test/treesitter-sidecar.test.mjs` plus
`test/adr-0004-treesitter.test.mjs`):

```
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Full `npm test` TAP on this dirty tree, dest `cloud-agent`, env
`bench/hosts/hermes` absent, go-tools fixture repos not fetched:

```
1..463
# tests 463
# suites 0
# pass 437
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

`# fail 0`. Skip count is the same 26 dest/env skips as PCR 0118 on this dest.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm --prefix sidecar/treesitter ci --omit=dev` | yes | 0 | lock installs `tree-sitter-go` and `tree-sitter-rust` |
| targeted Tree-sitter suite | yes | 0 | 20 pass |
| `npm test` | yes | 0 | TAP above |
| `npm run check` | yes | 0 | includes Isolated Semantic Engine `*.mjs` |
| `git diff --exit-code` | yes | 0 | after the committed test run |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; four hard gates true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |
| `npm run holdout:verify -- --pack=holdout-v0.2 --attestation=bench/packs/holdout-v0.2/provenance/freeze-attestation.json` | yes | 0 | `sealed`, `valid: true`. Verify only. Cells were not opened for tuning. |

Live unsealed v0.1 `freshctx-region` via read-only `runTrace` (no report write).
go-tools interior-edit requiredRecall=1, exactCurrentRate=1, staleBytes=0,
projectionBytes=562. neovim interior-edit requiredRecall=1, exactCurrentRate=1,
staleBytes=0, projectionBytes=872. All ten families requiredRecall=1.
`test/interior-edit-dev.test.mjs` 2/2 pass. The door blob is unchanged.

## Metric snapshot

| metric | origin/main `631819c` | this PCR | delta |
|---|---|---|---|
| `npm test` TAP `# tests` | 457 | **463** | **+6** |
| `npm test` TAP `# pass` | 431 | **437** | **+6** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| targeted Tree-sitter suite | 14 | 20 | +6 pins |
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| live go-tools interior-edit recall | 1 | 1 | 0 |
| `src/policy.mjs` / `src/anchors.mjs` / `src/projector.mjs` | untouched | untouched | 0 |

## Conflicts with constitutions

none observed.

## Limitations

- Adapters still construct `FreshCtxEngine` without a runner unless a test
  injects one.
- The sampler is still whole-file. Symbol-shaped holdout units need a new pack.
- Neovim C and Lua stay `parser-not-implemented`.
- WASM init happens once per spawned process. No warm daemon.
- Frozen `bench/reports/holdout.md` still records the historical
  go-tools interior-edit recall-0 cell. That file is not rewritten here.

## Next measurement

Wire `createSidecarRunner` into a bench-only path without touching holdout
cells, or sample symbol-shaped units once gold is an independent extractor.
Do not retune `src/anchors.mjs` against sealed v0.2. The live interior-edit
miss is already closed.
