# Competitive and Research Landscape

Snapshot: 2026-08-21. This document separates prior algorithms from host
integration surfaces. It links primary papers, official documentation, and
source repositories; it does not infer closed-product internals.

## Closest algorithms

| Work | Mechanism | What it already establishes | FreshCtx must add or beat |
|---|---|---|---|
| [CORVUS](https://arxiv.org/abs/2607.22711) | Masks historical reads and synchronizes current whole files | Live trajectory/workspace synchronization is viable; strongest direct baseline | Finer units, eviction, recovery, cache layout, lower transform cost |
| [The Complexity Trap](https://arxiv.org/abs/2508.21433) | Simple observation masking | A cheap deterministic mask is a strong baseline against LLM summaries | Show that live refresh adds value beyond masking, without model-based scoring |
| [CodeStruct](https://arxiv.org/abs/2604.05407) | AST-addressed `readCode` and `editCode` | Named structural units are useful agent actions | Reuse structural identity for continuous synchronization, not claim AST reads as novel |
| [VOCC](https://arxiv.org/abs/2603.29678) | Compiled views over agent traces | Trace views can be explicit and analyzable | A mutable-code-specific materialized view with byte-exact oracles |
| [Self-GC](https://arxiv.org/abs/2607.00692) | Indexed recoverable context objects and lifecycle actions | Context can be managed as objects rather than a flat token buffer | Deterministic code-state lifecycle without an LLM planner |
| [Prompt Cache](https://arxiv.org/abs/2311.04934) | Modular attention-state reuse | Stable prompt modules have systems value | Projection order and change metrics compatible with prefix caching |
| [Don't Break the Cache](https://arxiv.org/abs/2601.06007) | Provider caching study on agentic tasks | Dynamic tool results can undermine naive caching strategy | Measure cache-prefix reuse and transformation overhead directly |
| [SmoothAgent](https://arxiv.org/abs/2607.00151) | Lookahead context transformation and cache preparation | Transform latency and cache invalidation can dominate | Separate background propagation from blocking request latency |

These papers are executable inputs to the project. The authoritative list and
download commands are under `papers/`.

## Harnesses and products

| System | Relevant public capability | Integration implication |
|---|---|---|
| [Pi](https://github.com/earendil-works/pi) | Public extension events include a modifiable `context` event before each LLM call and `tool_result` after reads | Best first zero-fork adapter and deterministic request replay surface |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Pluggable `ContextEngine`; `select_context()` replaces one request and `on_turn_complete()` observes turns | FreshCtx can compose with the built-in compressor as a plugin |
| [Oh My Pi](https://github.com/can1357/oh-my-pi) | Public terminal harness with hashline edits, LSP/DAP, subagents, memory, and an optimized tool stack | Strong third integration target; FreshCtx should complement rather than duplicate tool quality |
| [Cursor Search](https://cursor.com/docs/agent/tools/search) | Official docs describe automatic codebase indexing and agent search | Retrieval/indexing is adjacent; closed request construction prevents architectural claims without an exposed capture seam |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) | Built-in file/search/command tools, compaction, memory, subagents, hooks, MCP, and Agent SDK | A hook/SDK study may be possible, but identical request replacement must be proven before support is claimed |
| [SDL-MCP](https://github.com/GlitterKill/sdl-mcp) | Symbol graph, cards, bounded slices, and incremental repository context | Potential structural provider; MCP alone cannot mask old host transcript entries |

## What does not count as novelty

FreshCtx must not claim any of these as new:

- masking old observations;
- synchronizing whole files;
- retrieving code by AST symbol;
- repository search, embeddings, or symbol graphs;
- generic message compaction or lossless archival;
- prompt/KV caching;
- exact or hash-anchored code edits.

The proposed contribution is the intersection: continuous region/symbol state
synchronization, stable historical references, automatic bounded lifecycle,
cache-aware deterministic projection, exact recovery, and portable host
middleware—evaluated as a context transformer rather than as a model.

## Benchmark order

1. Beat append-only and re-read baselines on freshness and duplication.
2. Beat observation masking by supplying current required bytes automatically.
3. Match a faithful CORVUS reproduction at file scope.
4. Improve the public-repo bytes/latency/delta frontier at region/symbol scope.
5. Reproduce the exact transformation through Pi and Hermes capture surfaces.

The project should stop or change thesis if whole-file synchronization remains
on the Pareto frontier after a serious structural implementation. Negative
evidence is publishable.
