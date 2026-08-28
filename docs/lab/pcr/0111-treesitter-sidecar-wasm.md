# PCR 0111 — Tree-sitter WASM sidecar for Python, JavaScript, and TypeScript

- Date (UTC): 2026-08-28
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/treesitter-sidecar-d320`
- Merge-base: `70df2f43be6f9bd3d72540eca5a929e355fe2db8` (origin/main)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

## Hypothesis or change

Replace the ADR 0004 sidecar regex extractors for Python, JavaScript, and
TypeScript with `web-tree-sitter` WASM grammars behind the same stdin/stdout
contract. `src/` stays Node stdlib. Go and Rust keep the regex leftover.
Adapters stay uninjected.

## What we did

`parseSource` is async. Python, JavaScript, and TypeScript load WASM grammars
from `sidecar/treesitter/`. Ambiguity is keyed on `qualifiedSelector`, so
`class Alpha::method render` and `class Beta::method render` can coexist. Two
module-level `foo` functions still fail closed.

The JSON contract is unchanged. `{ path, bytes }` in. `{ units, error }` out.
Units still omit content. Core still slices current file bytes by `startLine`
and `endLine`. One spawn per call. No request-body store.

Root `package.json` gained `sidecar:install` only. Runtime deps live in
`sidecar/treesitter/package.json`. CI runs `npm --prefix sidecar/treesitter ci`
before tests.

Gold still ignores sabotaged sidecar units. C and Lua stay
`parser-not-implemented`.

No edit to `src/policy.mjs`, `src/anchors.mjs`, or `src/projector.mjs`. No
holdout gold, weight, threshold, or `bench/traces/holdout/**` edit. No laptop
`sealed` attestation.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | **395** total; **369** pass; **2** fail; **24** skip. Failures are PCR 0096/0097 (`bench/hosts/hermes` absent), same as PCR 0109 |
| `git diff --exit-code` | yes | 0 | after the test run, on the committed tree |
| `npm run check` | yes | 0 | includes `sidecar/treesitter/*.mjs` |
| `npm run evaluate` | yes | 1 | hard gate on the same 0096/0097 host-absent failures |
| `node bench/run.mjs` | yes | 0 | `score` 89.10716495057945 (`AUTORESEARCH_SCORE=89.107165`) |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3…`; all six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |
| `npm run holdout:verify -- --pack=holdout-v0.2 --attestation=…` | yes | 1 | attestation file is not on merge-base `70df2f4` |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | `valid: true` |

## Metric snapshot

| metric | origin/main `70df2f4` | PCR 0111 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 390 | **395** | **+5** sidecar contract cases |
| `npm test` failed | 2 | **2** | `0` (0096/0097 host absent) |
| holdout v0.1 classify | `unsealed-regression` | `unsealed-regression` | `0` |

## Conflicts with constitutions

none observed.

## Limitations

- Go and Rust still use regex plus brace-balance.
- Adapters still construct `FreshCtxEngine` without `createSidecarRunner`.
- The sampler is still whole-file. Symbol-shaped holdout units need a new pack.
- Holdout v0.2 sealed verify needs the PR-S pack. It is not on this merge-base.
- WASM init happens once per spawned process. No warm daemon.

## Next measurement

Add Go and Rust WASM grammars behind the same contract, or wire
`createSidecarRunner` into a bench-only path without touching holdout cells.

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

### Re-measurement after `c6de6d7`

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 1 | **398** total; **372** pass; **2** fail; **24** skip. Failures are PCR 0096/0097 (`bench/hosts/hermes` absent) |
| `git diff --exit-code` | yes | 0 | after the test run, on the committed tree |
| `npm run check` | yes | 0 | includes `sidecar/treesitter/*.mjs` |
| `npm run evaluate` | yes | 1 | hard gate on the same 0096/0097 host-absent failures |
| `node bench/run.mjs` | yes | 0 | `score` 89.10716495057945 (`AUTORESEARCH_SCORE=89.107165`) |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; all six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |
| `npm run holdout:verify -- --pack=holdout-v0.2 --attestation=…` | yes | 1 | attestation is on origin/main `8b2305c5` (PCR 0110), not this merge-base |
| `npm run holdout:ci-guard -- --base=origin/main` | yes | 0 | `valid: true` against `8b2305c5` |
| `npm run papers:list` | yes | 0 | manifest sha256 `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89` |

| metric | `d1a156b` (pre-fix) | after `c6de6d7` | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | `0` |
| ctxbench hard gates | all true | all true | `0` |
| `npm test` total | 395 | **398** | **+3** fail-closed pins |
| `npm test` failed | 2 | **2** | `0` (0096/0097 host absent) |
| holdout v0.1 classify | `unsealed-regression` | `unsealed-regression` | `0` |
