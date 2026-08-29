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

Targeted TAP before the full suite:

```
1..20
# tests 20
# pass 20
# fail 0
```

`test/treesitter-sidecar.test.mjs` plus `test/adr-0004-treesitter.test.mjs`.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| targeted Tree-sitter suite | yes | 0 | 20 pass, including Go/Rust WASM pins |
| `npm test` | pending |  | after this PCR lands on the branch |
| `npm run check` | pending |  |  |
| `npm run evaluate` | pending |  | score must stay `89.107165` |
| `npm run ctxbench` | pending |  | payload hash must stay `697e74e3…` |
| `npm run holdout:verify -- --pack=holdout-v0.1` | pending |  |  |
| `npm run holdout:verify -- --pack=holdout-v0.2 --attestation=bench/packs/holdout-v0.2/provenance/freeze-attestation.json` | pending |  | verify only, not a tuning run |

## Metric snapshot

| metric | origin/main `631819c` | this PCR (targeted) | delta |
|---|---|---|---|
| Tree-sitter suite pass | 14 (pre-Go/Rust WASM pins) | 20 | +6 pins |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| `src/anchors.mjs` | untouched | untouched | 0 |

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

Run the full validation loop on this branch. Then measure live
`freshctx-region` recall on the unsealed v0.1 `ParseFile.body` door without
opening holdout v0.2 cells.
