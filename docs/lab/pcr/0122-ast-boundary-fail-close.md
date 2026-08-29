# PCR 0122 — Fail-close ERROR and sibling-overlapping AST spans

- Date (UTC): 2026-08-29
- Author / agent: Cursor Grok 4.6
- Branch / PR: `cursor/ast-boundary-fail-close-3f89`
- Merge-base: `2148630` (origin/main, PCR 0121 / PR 118)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

## Hypothesis or change

A missing `}` or other syntax error must fail-close **that unit**. The Isolated
Semantic Engine and the independent gold enumerator must never emit a span that
silently consumes a sibling declaration.

## What we did

PR 116's brace scan used `findBraceEnd` → EOF on an unmatched `{`. The next
top-level header then sat at brace-depth 1 and was skipped, so `alpha` ate
`beta`. Tree-sitter recovery did the same for TypeScript and Go: the broken
node spanned the sibling. `hasError` then wiped the file (PCR 0111), which hid
the bleed instead of localizing it.

The Isolated Semantic Engine now drops a unit when its node is `ERROR` /
`hasError`, when an `ERROR` node starts on its declaration line, or when its
span overlaps a same-or-shallower sibling. Remaining well-bounded units still
emit. `error: "parse-broken"` means none remained.

The gold enumerator no longer treats EOF as a successful close. Unmatched
braces and same-or-shallower overlaps fail-close that header only. Nesting uses
indent, not a running brace depth that an earlier missing `}` poisons.

ADR 0004 now matches this localized fail-close. INDEX/METRICS record PCR 0121's
483-test TAP that PR 118 reported but did not index.

No edit to `src/policy.mjs`, score weights, holdout gold, or sealed
`holdout-v0.2`.

## Architectural boundary

stdin/stdout stays `{ path, bytes }` in and `{ units, error }` out. Gold still
does not import the engine. Blast radius is the broken or overlapping unit, not
the file.

## Benchmarks run

Full TAP on this dest:

```
1..485
# tests 485
# pass 459
# fail 0
# skipped 26
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| targeted missing-`}` suite | yes | 0 | Isolated Semantic Engine + gold enumerator; watched RED then GREEN |
| `npm test` | yes | 0 | TAP above. +2 tests vs PCR 0121 |
| `npm run check` | yes | 0 | includes Isolated Semantic Engine parse.mjs |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; four hard gates true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |

`holdout-v0.2` cells were not opened.

## Metric snapshot

| metric | origin/main `2148630` | this PCR | delta |
|---|---|---|---|
| `npm test` TAP `# tests` | 483 | **485** | **+2** |
| `npm test` TAP `# pass` | 457 | **459** | **+2** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| `src/policy.mjs` / evaluate weights / holdout gold | untouched | untouched | 0 |

## Conflicts with constitutions

none observed. PCR 0111's whole-file `hasError` wipe was the conservative
predecessor. This PCR keeps fail-closed freshness and localizes the blast
radius the same way PCR 0121 localized `ambiguous`.

## Limitations

- Go Tree-sitter often parses the sibling inside the broken `block` as a
  `func_literal`, so the engine omits both rather than recovering `Beta`.
  That is fail-closed omission, not sibling consumption. The gold enumerator
  still recovers the sibling header.
- Python stdlib `ast` still fail-closes the whole file on `SyntaxError`.
- Nested duplicate names still omit those units.

## Next measurement

Keep the missing-`}` fixture as a gate on both extractors. Do not open sealed
`holdout-v0.2` cells for tuning.
