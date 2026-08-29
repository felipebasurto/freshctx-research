# ADR 0004: Tree-sitter sidecar, not a native addon in `src/`

Status: **accepted**

## Context

EVALUATION §5.1 wants symbol-shaped units. `resolveRegion` today takes only
`{ previousContent, currentFileContent, anchors }`. There is no structural
provider hook. Putting a Tree-sitter native addon inside the Node process
would break the stdlib-only rule for `src/` and couple CI to node-gyp.

Hermes already spawns a process across a language boundary
(`adapters/hermes/bridge.mjs`). A sidecar repeats that shape.

Gold extractors must stay a second program. A candidate parser that writes
gold would make sabotage invisible.

PCR 0079 forbids caching prior request bodies. A sidecar that remembered the
last payload would reintroduce that hole.

LSP is out of scope for this phase.

## Decision

Use a **sidecar process** at `sidecar/treesitter/`.

- Command boundary: JSON on stdin (`{ path, bytes }`) and JSON on stdout
  (`{ units, error }`).
- `src/` stays Node stdlib. Core may receive an **injected runner**. It must
  not `import` `tree-sitter` or any grammar package.
- Fail closed when the Isolated Semantic Engine is missing or a unit is
  ambiguous. Duplicate `qualifiedSelector` values omit those units only.
  Remaining unique units still emit with `error: null`. `error: "ambiguous"`
  means every extracted unit collided. `parse-broken` still wipes the file.
- `qualifiedSelector` is the structural path from file root to the unit.
  Named ancestors (class, impl type, function, method) and control-flow
  blocks (if, else, elif, for, while, match) are appended with `::`.
  An `if` consequence is `if`. An `if` alternative is `else`. Repeated
  anonymous siblings of the same type get `@k`. A function is a `method`
  only when its nearest named ancestor is a class or impl. Nested
  functions in different parents or different blocks therefore resolve
  instead of colliding. Same-block same-name units still drop. Direct
  class methods stay `class Alpha::method render`.
- The sidecar must not store prior request bodies. Each call is stateless.
- Selected units still carry current bytes. No `unchanged` or digest-only
  selected unit.
- Gold extractors (`bench/gold-extract.mjs`) read generator offsets or
  sandbox bytes. They must not call the Isolated Semantic Engine resolve API.
  Symbol candidates may be enumerated by `bench/independent-symbols.mjs`,
  which is a second program. Python uses the stdlib `ast` module. Other
  supported languages use a bench-only declaration scan. Gold bytes still
  come from generator offsets after the mutation, never from engine spans.
- Neovim C and Lua stay out of this phase.

## Consequences

- A later tree-sitter WASM or native grammar pack may replace the extractor
  behind the same stdin/stdout contract without touching `src/`.
- Root `package.json` stays free of runtime dependencies.
- This ADR does not authorize a Level 4 claim.
