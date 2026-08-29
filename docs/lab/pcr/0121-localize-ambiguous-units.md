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

Validation results land in the follow-up commit after the required loop.

## Metric snapshot

Target: `AUTORESEARCH_SCORE` stays `89.107165`.

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
