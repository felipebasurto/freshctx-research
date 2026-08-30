# PCR 0124 — Nested helper Isolated Semantic Engine granularity showdown

- Date (UTC): 2026-08-30
- Author / agent: Cursor Grok 4.6
- Branch / PR: `feat/nested-helper-showdown`
- Merge-base: `f10d73f` (origin/main, PCR 0123 / PR 120)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `synthetic`; `measurement`
- Decision: **review**

## Hypothesis or change

A disposable cell that requests Flask’s nested `if@0` view helper by its full
enclosing-span path should refresh only that helper and beat parent-method and
whole-file payloads on `payload_bytes`.

## What we did

Added `NESTED_HELPER_SHOWDOWN` in `bench/generate-symbol-pack.mjs`. The cell
tracks `class View::method as_view::if@0::function view`. It is not a
`SYMBOL_PACK_TARGETS` row. Official pack gold stays the independent enumerator.

Three granularity tiers share one interior edit inside the `if@0` helper
(`self = view.view_class(`):

1. Isolated Semantic Engine on the nested path.
2. Isolated Semantic Engine on `class View::method as_view`.
3. CORVUS on the whole `src/flask/views.py` file.

Spans come from Isolated Semantic Engine parse. Nested helpers are still not
independent-gold units. `runNestedHelperShowdown()` writes
`nested-helper-showdown.md` and `nested-helper-showdown.jsonl`. It does not
overwrite official `results.jsonl`.

No edit to `src/policy.mjs`, score weights, holdout gold, or sealed
`holdout-v0.2`.

## Architectural boundary

Official `generateSymbolPack()` still emits two traces. The showdown is a
separate writer. `src/` still does not import tree-sitter.

## Benchmarks run

```
1..495
# tests 495
# pass 469
# fail 0
# skipped 26
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run ctxbench:symbol-pack` | yes | 0 | official flask `as_view` Isolated Semantic Engine **2995**; showdown table below |
| `npm test` | yes | 0 | TAP above. +4 vs PCR 0123 (491/465) |
| `npm run check` | yes | 0 | includes `bench/generate-symbol-pack.mjs` |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; four hard gates true |
| `npm run ctxbench` | yes | 0 | payload sha256 `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`; six hard gates true |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression`, `valid: true` |

`holdout-v0.2` cells were not opened.

## Metric snapshot

Official pack (independent gold, `return view` sentinel):

| cell | payload_bytes | vs CORVUS |
|---|---|---|
| Isolated Semantic Engine flask `as_view` | 2995 | −4478 |
| CORVUS flask file | 7473 | 0 |
| Isolated Semantic Engine express `createApplication` | 1316 | −636 |

Nested helper showdown (engine spans, `view.view_class` sentinel):

| tier | system | selector | payload_bytes | vs coarser | vs CORVUS |
|---|---|---|---|---|---|
| 1 | isolated-semantic-engine | `class View::method as_view::if@0::function view` | **1058** | −1937 | −6424 |
| 2 | isolated-semantic-engine | `class View::method as_view` | **2995** | −4487 | −4487 |
| 3 | corvus-file | whole file | **7482** | | 0 |

Tier 3 is 9 bytes above official flask CORVUS because the showdown sentinel sits
on `self = view.view_class(`, not `        return view`.

| metric | origin/main `f10d73f` (PCR 0123) | this PCR | delta |
|---|---|---|---|
| `npm test` TAP `# tests` | 491 | **495** | **+4** |
| `npm test` TAP `# pass` | 465 | **469** | **+4** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | 0 |
| ctxbench payload sha256 | `697e74e3…` | `697e74e3…` | 0 |
| flask ISE `as_view` payload_bytes | 2995 (`pass`) | **2995** (`pass`) | 0 |
| flask nested helper ISE payload_bytes | (not measured) | **1058** (`pass`) | new |
| nested helper vs parent method | | **−1937** | new |
| nested helper vs showdown CORVUS | | **−6424** | new |
| `src/policy.mjs` / evaluate weights / holdout gold | untouched | untouched | 0 |

## Comparison

This is a synthetic Isolated Semantic Engine vs documented CORVUS whole-file
reproduction on one Flask smoke file. It is not a holdout result and not a
Level 4 claim.

## Conflicts with constitutions

none observed. Official pack gold stays independent. Sealed `holdout-v0.2` was
not opened.

## Limitations

- Nested-helper spans are Isolated Semantic Engine units, not independent gold.
- Short selector `view` still fail-closes when both nested helpers exist.
- Showdown CORVUS bytes are not comparable to official flask CORVUS without
  noting the different sentinel.
- Same-block same-name units still omit.

## Next measurement

Keep the official symbol pack as the gate. Do not promote the nested cell into
`SYMBOL_PACK_TARGETS` until an independent nested gold enumerator exists. Do
not open sealed `holdout-v0.2` cells for tuning.
