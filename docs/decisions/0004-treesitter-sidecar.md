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
- Fail closed when the sidecar is missing or the parse is ambiguous.
- The sidecar must not store prior request bodies. Each call is stateless.
- Selected units still carry current bytes. No `unchanged` or digest-only
  selected unit.
- Gold extractors (`bench/gold-extract.mjs`) read generator offsets or
  sandbox bytes. They must not call the sidecar resolve API.
- Neovim C and Lua stay out of this phase.

## Consequences

- A later tree-sitter WASM or native grammar pack may replace the extractor
  behind the same stdin/stdout contract without touching `src/`.
- Root `package.json` stays free of runtime dependencies.
- This ADR does not authorize a Level 4 claim.
