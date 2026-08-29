# PCR 0120 — Independent gold extractor for symbol-shaped units

- Date (UTC): 2026-08-29
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/independent-gold-extractor-b75c`
- Merge-base: `394d856` (origin/main, PCR 0119 / PR 115)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

## Hypothesis or change

CtxBench can sample symbol-shaped units without asking the Isolated Semantic
Engine what those units are. Gold bytes stay generator-owned offsets. The
evaluation oracle is a second program.

## What we did

`bench/independent-symbols.mjs` enumerates functions, methods, and classes for
Python, JavaScript, TypeScript, Go, and Rust. Python goes through
`bench/python-ast-oracle.py` and the stdlib `ast` module. The other languages
use a bench-only declaration scan that blanks comments and strings first. The
module does not import `sidecar/treesitter` or `resolveRegion`.

`bench/gold-extract.mjs` still hashes the slice after a `replace-exact`
mutation. `engineUnits` and the older `sidecarUnits` argument are ignored.
`unitScope: "symbol"` is opt-in on `sampleUnits`. The default file enumerator
is unchanged, so sealed holdout generation and the synthetic score path stay
on whole-file units.

`bench/trace-runner.mjs` slices `scope: "symbol"` reads the same way it slices
region reads. Existing file and region traces keep their previous behavior.

No edit to `src/`. No Isolated Semantic Engine edit. No holdout gold, weight,
threshold, or `holdout-v0.2` pack edit.

## Architectural boundary

Candidate under test: Isolated Semantic Engine plus `src/registry.mjs`.
Evaluation oracle: generator offsets plus sandbox bytes.
Sampling only: independent enumerator.

EVALUATION §6 says AST extraction may pick candidates and must not produce
gold output. This change follows that split.

## Benchmarks run

Targeted TAP (`test/independent-symbols.test.mjs`,
`test/gold-extract.test.mjs`, `test/unit-sampler.test.mjs`):

```
1..18
# tests 18
# pass 18
# fail 0
```

Full TAP on this dest, dest `cloud-agent`, env `bench/hosts/hermes` absent:

```
1..472
# tests 472
# pass 446
# fail 0
# skipped 26
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| targeted gold/sampler suite | yes | 0 | 18 pass |
| `npm run check` | yes | 0 | includes `bench/python-ast-oracle.py` |
| `npm test` | yes | 0 | TAP above. +9 tests vs PCR 0119 |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; four hard gates true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |

`holdout-v0.2` cells were not opened.

## Metric snapshot

| metric | origin/main `394d856` | this PCR | delta |
|---|---|---|---|
| `npm test` TAP `# tests` | 463 | **472** | **+9** |
| `npm test` TAP `# pass` | 437 | **446** | **+9** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `src/policy.mjs` / `src/anchors.mjs` / `src/projector.mjs` | untouched | untouched | 0 |

## Conflicts with constitutions

none observed.

## Limitations

- The brace-language scan is not a compiler. It is independent of Tree-sitter,
  not a replacement for one.
- Nested functions inside functions are out of the enumerator by design.
- Neovim C and Lua stay `parser-not-implemented`.
- No sealed symbol-shaped holdout pack is generated here.

## Next measurement

Generate a disposable symbol-scope development pack from public-repo smoke
trees. Compare region/symbol projection bytes against whole-file CORVUS on
that pack only. Do not open sealed `holdout-v0.2` cells for tuning.
