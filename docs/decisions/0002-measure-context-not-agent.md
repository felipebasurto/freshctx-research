# ADR 0002: Measure the context transformer, not agent programming quality

Status: accepted.

## Context

Pass@1 and patch quality vary with model sampling, provider revisions, agent
policy, prompts, tool behavior, and repository tests. Using them as the main
objective would make it difficult to attribute an improvement to FreshCtx and
would make autoresearch expensive.

## Decision

CtxBench uses fixed mutation traces, public pinned workspaces, an independent
byte oracle, and a fake provider that captures the exact request. Correctness,
bytes, change amplification, prefix reuse, latency, and resource cost are the
primary metrics. Core evaluation makes no model call.

## Consequences

- The main loop is deterministic and costs zero model tokens.
- FreshCtx can make a narrow state-of-the-art context-transformer claim without
  claiming a better coding agent.
- Optional downstream model studies remain separate and cannot waive invariant
  failures.
- Public repositories, trace hashes, locks, raw payload hashes, and environment
  provenance become required evidence.
