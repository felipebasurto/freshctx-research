# PCR 0123 — Enclosing-span disambiguation for Isolated Semantic Engine units

- Date (UTC): 2026-08-30
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/enclosing-span-disambiguation-362e`
- Merge-base: `1dc2a94` (origin/main, PCR 0122 / PR 119)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

Renumbered from a draft PCR 0122 after PR 119 claimed that number for
`0122-ast-boundary-fail-close`.

## Hypothesis or change

Identically named nested units should resolve when their enclosing AST path
differs. Ambiguity stays keyed on `qualifiedSelector`. Same-block same-name
units still fail-close. Direct class methods stay `class Owner::method name`.

## What we did

`ise/treesitter/grammars.mjs` walks from each unit to the root. Named
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

PR 119's ERROR / sibling-overlap fail-close is kept: `hasError` on the unit
node, declaration-line ERROR spans, and indent-based sibling overlap still
drop that unit only.

No edit to `src/policy.mjs`, score weights, holdout gold, or sealed
`holdout-v0.2`.

## Architectural boundary

stdin/stdout contract unchanged. `{ path, bytes }` in. `{ units, error }` out.
`qualifiedSelector` is now the structural path, not nearest-class-plus-name.
`src/` still does not import tree-sitter.

## Benchmarks run

Post-merge TAP on this dest (includes PCR 0122):

```
1..491
# tests 491
# pass 465
# fail 0
# skipped 26
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run ctxbench:symbol-pack` | yes | 0 | flask `as_view` Isolated Semantic Engine **pass**, 2995 bytes, gold present; express still −636 |
| `npm test` | yes | 0 | TAP above. +6 vs PCR 0122 (485/459) |
| `npm run check` | yes | 0 | includes `ise/treesitter/grammars.mjs` |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; four hard gates true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |

`holdout-v0.2` cells were not opened.

## Metric snapshot

| metric | origin/main `1dc2a94` (PCR 0122) | this PCR | delta |
|---|---|---|---|
| `npm test` TAP `# tests` | 485 | **491** | **+6** |
| `npm test` TAP `# pass` | 459 | **465** | **+6** |
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
PCR 0121 still drops same-block duplicates. PCR 0122's ERROR / sibling-overlap
fail-close is preserved.

## Limitations

- Same-block same-name units still omit. There is no ordinal on the unit
  itself, because that identity would shift when a neighbor is inserted.
- `parse-broken` now means no well-bounded unit remained (PCR 0122).
- Tracking `selector: "view"` still fail-closes when two unique nested views
  exist. Callers that want one of them must pass the full
  `qualifiedSelector`.
- Gold still enumerates top-level units only. Nested helpers are engine
  units, not gold spans.

## Next measurement

Keep the disposable symbol pack as the gate. Try tracking a nested helper by
its enclosing path on a new disposable cell. Do not open sealed
`holdout-v0.2` cells for tuning.
