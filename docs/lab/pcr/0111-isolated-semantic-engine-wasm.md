# PCR 0111 — Tree-sitter WASM Isolated Semantic Engine for Python, JavaScript, and TypeScript

- Date (UTC): 2026-08-28
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/treesitter-Isolated Semantic Engine-d320`
- Merge-base: `8b2305c53662fa6feaaa6779e73fc3873a4dec34` (origin/main, PCR 0110)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

## Hypothesis or change

Replace the ADR 0004 Isolated Semantic Engine regex extractors for Python, JavaScript, and
TypeScript with `web-tree-sitter` WASM grammars behind the same stdin/stdout
contract. `src/` stays Node stdlib. Go and Rust keep the regex leftover.
Adapters stay uninjected.

## What we did

`parseSource` is async. Python, JavaScript, and TypeScript load WASM grammars
from `ise/treesitter/`. Ambiguity is keyed on `qualifiedSelector`, so
`class Alpha::method render` and `class Beta::method render` can coexist. Two
module-level `foo` functions still fail closed.

The JSON contract is unchanged. `{ path, bytes }` in. `{ units, error }` out.
Units still omit content. Core still slices current file bytes by `startLine`
and `endLine`. One spawn per call. No request-body store.

Root `package.json` gained `ise:install` only. Runtime deps live in
`ise/treesitter/package.json`. CI runs `npm --prefix ise/treesitter ci`
before tests.

Gold still ignores sabotaged Isolated Semantic Engine units. C and Lua stay
`parser-not-implemented`.

No edit to `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs`. No
holdout gold, weight, threshold, or `bench/traces/holdout/**` edit. No laptop
`sealed` attestation.

## Benchmarks run

Canonical TAP is the post-rebase re-run on this tree (merge-base
`8b2305c5`). dest: `cloud-agent`. env: `bench/hosts/hermes` absent;
go-tools fixture repos not fetched.

```
1..398
# tests 398
# suites 0
# pass 372
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

`# fail 0`. PCR 0096/0097 are dest/env skips on this main (they `skip`
when `bench/hosts/hermes` is absent). That is why skip went 24→26 versus
the pre-rebase TAP. Not a product change in this PR.

`# skipped 26`, honest reasons:

| count | reason |
|---|---|
| 16 | go-tools `parse.go` / `util.go` not fetched |
| 9 | `bench/hosts/hermes` not fetched (0096, 0097, 0098 official loader, 0102 host-contract, plus five native/budget boards) |
| 1 | `FRESHCTX_HOSTS_FETCH=1` unset |

Fail-closed pins on this TAP: `ok 382` hasError parse-broken; `ok 383`
exclusive column-0; `ok 384` adjacent defs.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above. dest/env: hermes host absent |
| `git diff --exit-code` | yes | 0 | after the test run, on the committed tree |
| `npm run check` | yes | 0 | includes `ise/treesitter/*.mjs` |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `node bench/run.mjs` | yes | 0 | `score` 89.10716495057945 |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; all six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |
| `npm run holdout:verify -- --pack=holdout-v0.2 --attestation=bench/packs/holdout-v0.2/provenance/freeze-attestation.json` | yes | 0 | `classification: "sealed"`, `valid: true` |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | `valid: true` against `8b2305c5` |

v0.2 verify (quoted, not rewritten): `manifestSha256`
`7cb1b393ad4b87ed1121b16be7a5417a0d28475dfc74c49a079043ab6e4b07f7`;
`traceSetHash` `c0cb6b25…`; `resultSetHash` `17ec79ff…`; `reportHash`
`abb09e55…`; attest run `33201069400`. Door/lock/attest blobs match
`origin/main`.

## Metric snapshot

| metric | origin/main `8b2305c5` | PCR 0111 post-rebase | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` TAP `# tests` | 390 | **398** | **+8** |
| `npm test` TAP `# pass` | 364 | **372** | **+8** |
| `npm test` TAP `# fail` | 0 (0096/0097 skip) | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| holdout v0.1 classify | `unsealed-regression` | `unsealed-regression` | `0` |
| holdout v0.2 classify | `sealed` | `sealed` | `0` |

Pre-rebase TAP on `c6de6d7` (merge-base `70df2f4`) was `# fail 2` /
`# skipped 24` because 0096/0097 still ENOENT-failed. That row is
historical. It is not the measurement for this HEAD.

## Conflicts with constitutions

none observed.

## Limitations

- Go and Rust still use regex plus brace-balance.
- Adapters still construct `FreshCtxEngine` without `createIsolatedSemanticEngineRunner`.
- The sampler is still whole-file. Symbol-shaped holdout units need a new pack.
- WASM init happens once per spawned process. No warm daemon.

## Next measurement

Add Go and Rust WASM grammars behind the same contract, or wire
`createIsolatedSemanticEngineRunner` into a bench-only path without touching holdout cells.

## Reviewer no-merge (`d1a156b` vs main `8b2305c5`)

Two fail-closed holes on HEAD `d1a156b`. Door, lock, and `src/anchors.mjs`
were not edited. No `--relock`. Same branch, same draft PR.

### Hole 1 — `hasError` fail-open

`extractTreeSitterUnits` already returned `hasError: true` when the tree had
error nodes. `parseSource` only mapped that to `parse-broken` when
`units.length === 0`. A Python file with a valid `alpha` plus `def broken(`
extracted `alpha` and returned `error: null`.

The existing broken-syntax test is `a.go` (regex + brace-balance). It does
not pin the WASM path.

Fix: if `extracted.hasError`, return `{ units: [], error: "parse-broken" }`
before accepting any units. Test: `a.py` with valid `alpha` and `def broken(`.

### Hole 2 — exclusive column-0 `endLine`

`endLine = endPosition.row + 1` treats Tree-sitter's exclusive
`{ row: N, column: 0 }` as inclusive. That includes line `N+1` and can eat
the next unit's first line (offset-shift).

**Discarded guess:** the current Python/JS/TS WASM pack already swallows
adjacent defs on this fixture. It does not. Probed `function_definition` /
`function_declaration` / `class_declaration` nodes end mid-line
(`column !== 0`). The only exclusive column-0 named nodes were the root
`module` / `program`. The conversion is still wrong for any unit that does
end at column 0.

Fix: `inclusiveEndLine` maps exclusive column-0 ends to `endPosition.row`
when `end.row > start.row`. Tests: helper cases plus adjacent Python
`alpha` / `beta` (`alpha.endLine < beta.startLine`; neither slice contains
the other def).

Canonical TAP for this HEAD is the post-rebase table above
(`# tests 398` / `# pass 372` / `# fail 0` / `# skipped 26`).

## Rebase onto `8b2305c5`

INDEX and METRICS keep PCR 0110, then 0111. Door, lock, and holdout
pack/attest hashes were not rewritten. No `--relock`.

## WASM through `engine.refresh` (investigated, not a hole)

Reviewer note: WASM Python/JS/TS tests call `parseSource` directly; the
live `engine.refresh` pin uses Go.

This is expected. It is not a fail-closed hole.

Evidence:

- `resolveSymbolUnit` (`src/registry.mjs`) has no language or extension
  switch. It calls `Isolated Semantic EngineRunner({ path, bytes })`, matches
  `selector` or `qualifiedSelector`, and slices current file bytes by
  `startLine`/`endLine`.
- `createIsolatedSemanticEngineRunner` is language-agnostic. It spawns `parse.mjs` with
  `{ path, bytes }` and returns `{ units, error }`.
- `parse.mjs` routes by extension after spawn: `.py`/`.js`/`.ts` WASM,
  `.go`/`.rs` regex.
- `engine.refresh` only uses the Isolated Semantic Engine when `scope === "symbol"` and a
  runner is injected. Adapters construct `new FreshCtxEngine()` with no
  runner (`adapters/pi/replay.mjs`, `adapters/hermes/bridge.mjs`). No
  language reaches the Isolated Semantic Engine on the adapter path.
- The Go refresh test pins the engine↔Isolated Semantic Engine seam (inject, relocate,
  no `src/` imports). WASM languages are pinned at `parseSource`
  (`hasError` → `parse-broken`; exclusive column-0; adjacent defs).

No product change. No third pin.
