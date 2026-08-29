# PCR 0122 — Enclosing-span disambiguation for Isolated Semantic Engine units

- Date (UTC): 2026-08-29
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/enclosing-span-disambiguation-362e`
- Merge-base: `2148630` (origin/main, PCR 0121 / PR 118)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

## Hypothesis or change

Identically named nested units should resolve when their enclosing AST path
differs. Ambiguity stays keyed on `qualifiedSelector`. Same-block same-name
units still fail-close. Direct class methods stay `class Owner::method name`.

## What we did

`sidecar/treesitter/grammars.mjs` walks from each unit to the root. Named
scopes (class, impl type, function, method) and control-flow blocks (if, else,
elif, for, while, match) become path segments. An `if` consequence is `if`.
An `if` alternative is `else`. Repeated anonymous siblings of the same type
get `@k`. A function is a `method` only when its nearest named ancestor is a
class or impl.

Flask `View.as_view` nested helpers that previously both collapsed to
`class View::method view` now emit as

- `class View::method as_view::if@0::function view`
- `class View::method as_view::else::function view`

`as_view` itself stays `class View::method as_view`. The gold enumerator is
unchanged and still lists top-level units only.

No edit to `src/policy.mjs`, score weights, holdout gold, or sealed
`holdout-v0.2`.

## Architectural boundary

stdin/stdout contract unchanged. `{ path, bytes }` in. `{ units, error }` out.
`qualifiedSelector` is now the structural path, not nearest-class-plus-name.
`src/` still does not import tree-sitter.

## Benchmarks run

Full TAP on this dest:

```
1..489
# tests 489
# pass 463
# fail 0
# skipped 26
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run ctxbench:symbol-pack` | yes | 0 | flask `as_view` Isolated Semantic Engine **pass**, 2995 bytes, gold present; express still −636 |
| `npm test` | yes | 0 | TAP above. +6 tests vs PCR 0121 |
| `npm run check` | yes | 0 | includes Isolated Semantic Engine `grammars.mjs` |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; four hard gates true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |

`holdout-v0.2` cells were not opened.

## Metric snapshot

| metric | origin/main `2148630` | this PCR | delta |
|---|---|---|---|
| `npm test` TAP `# tests` | 483 | **489** | **+6** |
| `npm test` TAP `# pass` | 457 | **463** | **+6** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| flask ISE `as_view` payload_bytes | 2995 (`pass`) | **2995** (`pass`) | 0 |
| flask ISE vs CORVUS payload_bytes | −4478 | **−4478** | 0 |
| express ISE vs CORVUS payload_bytes | −636 | −636 | 0 |
| flask nested `view` units emitted | 0 (collided) | **2** (unique paths) | **+2** |
| `src/policy.mjs` / evaluate weights / holdout gold | untouched | untouched | 0 |

## Conflicts with constitutions

none observed. Freshness fail-close is unchanged. Localized blast radius from
PCR 0121 still drops same-block duplicates.

## Limitations

- Same-block same-name units still omit. There is no ordinal on the unit
  itself, because that identity would shift when a neighbor is inserted.
- `parse-broken` remains a whole-file fail-close.
- Tracking `selector: "view"` still fail-closes when two unique nested views
  exist. Callers that want one of them must pass the full
  `qualifiedSelector`.
- Gold still enumerates top-level units only. Nested helpers are engine
  units, not gold spans.

## Next measurement

Keep the disposable symbol pack as the gate. Try tracking a nested helper by
its enclosing path on a new disposable cell. Do not open sealed
`holdout-v0.2` cells for tuning.
