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

Filled after the required loop.

## Metric snapshot

Expect `AUTORESEARCH_SCORE=89.107165` and ctxbench payload
`697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644`. The default
evaluate path does not inject the sidecar.

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
