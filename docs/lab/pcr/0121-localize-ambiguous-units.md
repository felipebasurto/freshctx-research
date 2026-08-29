# PCR 0121 — Localize Isolated Semantic Engine ambiguous-unit blast radius

- Date (UTC): 2026-08-29
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/localize-ambiguous-units-5152`
- Merge-base: `ad0bf12` (origin/main, PCR 0120 / PR 116)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

## Hypothesis or change

An ambiguous parse or duplicate `qualifiedSelector` should fail-close only the
offending units. Unique symbols in the same file must still resolve and
project. The Isolated Semantic Engine stdin/stdout shape stays
`{ path, bytes }` in and `{ units, error }` out.

## What we did

`finishUnits` in `sidecar/treesitter/parse.mjs` now partitions by
`qualifiedSelector`. Count === 1 units stay. Count > 1 units drop. If any
unique units remain, the engine returns `{ units: unique, error: null }`. If
every unit collided, it still returns `{ units: [], error: "ambiguous" }`.
`parse-broken` still wipes the file.

`bench/independent-symbols.mjs` copies the same partition so gold spans for a
unique symbol still exist when a different name collides. The gold program
does not import the engine.

The disposable symbol-scope development pack from the unmerged
`cursor/symbol-scope-dev-pack-5152` work is restored so
`npm run ctxbench:symbol-pack` can prove flask `as_view` projects after nested
`view` functions collide. Gold matching uses `enumerateIndependentSymbols`.

No edit to `src/policy.mjs`, score weights, holdout gold, or sealed
`holdout-v0.2`.

## Architectural boundary

stdin/stdout contract unchanged. Blast radius is the colliding
`qualifiedSelector`, not the file. `src/` still does not import tree-sitter.

## Benchmarks run

Full TAP on this dest:

```
1..483
# tests 483
# pass 457
# fail 0
# skipped 26
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run ctxbench:symbol-pack` | yes | 0 | flask `as_view` Isolated Semantic Engine **pass**, 2995 bytes, gold present; express still −636 |
| `npm test` | yes | 0 | TAP above. +11 tests vs PCR 0120 |
| `npm run check` | yes | 0 | includes Isolated Semantic Engine parse.mjs |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; four hard gates true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |

`holdout-v0.2` cells were not opened.

## Metric snapshot

| metric | origin/main `ad0bf12` | this PCR | delta |
|---|---|---|---|
| `npm test` TAP `# tests` | 472 | **483** | **+11** |
| `npm test` TAP `# pass` | 446 | **457** | **+11** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| flask ISE `as_view` payload_bytes | 390 (`gold-absent`) | **2995** (`pass`) | **+2605**; gold now present |
| flask ISE vs CORVUS payload_bytes | −7083 (failed cell) | **−4478** | honest reduction after gold entered |
| express ISE vs CORVUS payload_bytes | −636 | −636 | 0 |
| `src/policy.mjs` / evaluate weights / holdout gold | untouched | untouched | 0 |

## Conflicts with constitutions

none observed. ADR 0004 fail-closed language now matches ARCHITECTURE's
"Unit ambiguous | Omit and report unresolved" row.

## Limitations

- Nested duplicate names still omit those units. There is no disambiguation
  by enclosing span.
- `parse-broken` remains a whole-file fail-close.
- Peak RSS is process `VmHWM`. Isolated Semantic Engine latency includes
  parse-process spawn.

## Next measurement

Keep the disposable symbol pack as a gate for localized fail-close. Do not
open sealed `holdout-v0.2` cells for tuning.
