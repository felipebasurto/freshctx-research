# FreshCtx: A Live, Versioned Context Substrate for Coding Agents

## Engineering thesis, version 0.1

### Abstract

Coding agents typically operate over an append-only trajectory containing user
requests, reasoning, tool calls, and tool results. This representation is
appropriate for events but structurally wrong for mutable workspace state. A
file read captures a point-in-time snapshot. Once appended, that snapshot
remains in the prompt even after the agent, a concurrent agent, or a human
modifies the file. Re-reading adds another snapshot rather than replacing the
old one. The resulting request can contain several conflicting versions of the
same code, spend tokens on redundant content, reduce prompt-cache efficiency,
and cause edits based on stale evidence.

FreshCtx proposes that code observations should be treated as synchronized
state references rather than immutable conversational records. A read result is
stored exactly outside the prompt and represented in history by a stable unit
identifier. Before every inference call, FreshCtx resolves the active units
against the current workspace and injects a single bounded projection at the
end of the request. The first implementation targets code regions and then
symbols, using deterministic policies and conservative resolution rather than
LLM summarization.

The central research hypothesis is that a symbol-level, cache-aware,
automatically collected live working set can produce a more correct and more
efficient request projection than file-level synchronization. “More correct”
means byte-exact freshness, uniqueness, recoverability, and deterministic
handling of ambiguity. “More efficient” means fewer projected bytes, lower
transformation latency, less context-delta amplification, and a more stable
cacheable prefix. These properties are evaluated without invoking a model.

FreshCtx does not use task completion or “the agent programs better” as its
primary claim. Model sampling, provider behavior, and harness policy would make
that outcome non-deterministic and difficult to attribute to the context layer.
Downstream agent studies may be reported as exploratory evidence, but they are
outside the acceptance test for the systems contribution. The thesis is
intentionally falsifiable and defines deterministic baselines, measurements,
failure conditions, and publication gates for a state-of-the-art context
transformer claim.

## 1. Problem statement

Let a repository contain files \(F = \{f_1, \dots, f_n\}\), where the contents
of file \(f_i\) at turn \(t\) are \(c_i(t)\). A conventional coding agent
records a read performed at turn \(k\) as an observation containing
\(c_i(k)\). Its trajectory at a later turn \(t\) still contains \(c_i(k)\),
even if \(c_i(t) \ne c_i(k)\).

If the agent reads the file again, the prompt may contain both \(c_i(k)\) and
\(c_i(t)\). Therefore an append-only trajectory provides no uniqueness or
freshness guarantee for mutable code. Conventional compaction can later
summarize or remove observations, but it reacts after the contradictory state
has already entered the trajectory.

FreshCtx separates two classes of information:

- **Events** remain in chronological history: user intent, decisions, tool
  calls, failures, test outcomes, and explanations.
- **Mutable workspace state** lives in a synchronized registry and is projected
  into each request from its current source of truth.

This is conceptually similar to separating an event log from a materialized
view. The transcript records that a read occurred; the live projection answers
what the relevant code is now.

## 2. Why existing primitives are insufficient

The project is not motivated by an absence of good coding-agent tools. The
opposite is true: by 2026, the strongest harnesses have already optimized many
obvious primitives.

### 2.1 Search and repository navigation

Cursor documents automatic codebase indexing, embeddings, Instant Grep, and an
Explore subagent that searches in a separate context window. Claude Code exposes
ripgrep-backed search and optional LSP navigation. Oh My Pi includes fast
search, AST summarization, and LSP integration. Independent projects such as
SDL-MCP expose symbol graphs, budgeted slices, live indexing, and change-impact
information.

These systems improve *which code is found*. They do not necessarily change the
representation of code after it enters a host's chronological message history.
Explicit retrieval can return a fresh result while the older result remains in
the request.

### 2.2 Editing

Claude Code's public Edit interface uses exact string replacement and guards
against ambiguous matches. Hermes implements a nine-strategy fuzzy patcher and
syntax checks. Oh My Pi uses hash-anchored editing and LSP-aware writes.
CodeStruct demonstrates that AST-level `readCode` and `editCode` primitives can
improve pass rates and reduce tokens for multiple models.

FreshCtx is complementary to these mechanisms. Hashes and structured edits can
prevent a stale write from landing, but rejecting the write still costs an
error, a re-read, another inference cycle, and additional context. FreshCtx aims
to prevent the stale reasoning state that produced the write.

### 2.3 Compaction and memory

Pi extensions can transform messages before each model call. Hermes supports
lossy compression as well as pluggable context engines; Hermes LCM preserves
raw messages in a DAG and retrieves them after compaction. These are important
solutions to long-horizon memory.

FreshCtx addresses a different lifetime. It does not ask how to remember an old
message. It asks whether a mutable file snapshot should ever be retained as a
message. It acts continuously, including long before a compaction threshold.

### 2.4 Verification

Hermes includes project verification recipes and evidence handling, while most
harnesses can run project tests, linters, and builds through a terminal. Better
verification can detect the consequences of stale context, but it does not
remove the underlying duplicated state.

## 3. Closest research baseline: CORVUS

[CORVUS](https://arxiv.org/abs/2607.22711) identifies the same structural
problem and replaces inline file reads with a `sync_file` operation. Registered
files are refreshed before every reasoning cycle and injected as a current
file set. On SWE-PolyBench Verified and SWE-Bench Pro, the authors report:

- 9-50% lower average input-token use;
- 15-32% shorter final requests;
- up to 37% fewer reasoning cycles;
- up to 86% fewer duplicate file reads;
- comparable pass rates across the evaluated configurations.

CORVUS establishes that proactive synchronization is a credible direction. It
also defines the immediate research frontier. Its discussion identifies whole-
file granularity, the absence of a `desync_file` operation, robust partial
tracking, and prompt-cache interaction as open problems.

FreshCtx should not be described as novel merely for synchronizing files. Its
novelty target is the combination of:

1. symbol- or region-level synchronization with conservative relocation;
2. automatic working-set collection and eviction;
3. cache-aware deterministic projection;
4. exact recoverability without keeping raw snapshots in the prompt;
5. implementation as a portable context substrate for multiple harnesses.

## 4. System hypothesis

Let \(S_t\) be the active set of code units at turn \(t\). Each unit \(u\) has:

- a stable identity \(id(u)\);
- a source path and structural selector;
- current resolved content \(content(u,t)\);
- a revision hash \(rev(u,t)\);
- relevance and lifecycle metadata;
- zero or more exact historical revisions stored outside the request.

The chronological trajectory stores only a marker such as:

```text
[freshctx:tracked unit=u_2e9d4a path=src/auth.ts]
```

Before inference, the engine builds a projection \(P_t\) under budget \(B\):

\[
P_t = \operatorname{render}(\operatorname{select}(S_t, B), t)
\]

The request contains historical markers plus \(P_t\). It must satisfy:

### Freshness

Every injected unit is resolved from workspace state observed for the current
request. An unresolved or ambiguous unit is reported but not injected with its
last-known content.

### Uniqueness

No selected unit has more than one full revision in the request.

### Recoverability

Every masked historical observation remains addressable in local storage by
content hash or event identifier.

### Determinism

The same registry, task, workspace state, budget, and policy produce byte-
identical output.

### Boundedness

Except for explicitly pinned safety-critical units, the rendered projection
does not exceed its assigned budget.

## 5. Unit resolution

The prototype begins with observed line regions and whole files. A region is
identified by path plus stable textual anchors derived from meaningful boundary
lines. On refresh, resolution proceeds conservatively:

1. If the previous content occurs exactly once, relocate it directly.
2. Otherwise find unique normalized boundary anchors in the current file.
3. Accept only an ordered, unambiguous region.
4. If resolution fails, mark the unit unresolved and omit stale content.

The production design replaces or supplements these anchors with Tree-sitter
and LSP selectors:

```text
src/auth.ts :: class AuthService :: method refreshToken
```

AST identity alone is not sufficient. Renames, overloads, duplicated anonymous
constructs, generated files, parse errors, and cross-language boundaries require
fallbacks. The intended resolution hierarchy is:

1. provider identity from LSP/SCIP when stable and available;
2. Tree-sitter qualified structural path;
3. content hash plus boundary anchors;
4. exact observed range when the full-file revision is unchanged;
5. unresolved, never guessed.

FreshCtx must expose resolution confidence and method in benchmark traces.

## 6. Working-set selection and eviction

Synchronizing every file forever recreates a context-growth problem in a new
location. FreshCtx therefore treats selection as an online cache-management
problem.

The initial deterministic policy scores units using:

- recency of observation and use;
- whether the unit changed in the current turn;
- lexical overlap with task terms;
- explicit pinning;
- prior edit involvement;
- graph proximity once structural providers exist;
- unit size and estimated token cost;
- uncertainty or failed resolution.

Selection and rendering order are separate decisions. The highest-utility units
are selected first, while rendering order aims to preserve a stable cached
prefix. A simple initial heuristic orders low-change-frequency units before
high-change-frequency units. Later policies should optimize actual provider
cache reads and writes rather than relying on this proxy.

Eviction removes a unit from the active set, not from durable local history. A
unit may be reactivated by a new read, edit, stack trace, test failure, symbol
reference, or explicit recovery call.

## 7. Autoresearch formulation

FreshCtx is designed so that its policy can be improved by an autonomous coding
researcher without changing the evaluation rules.

The mutable search surface is deliberately small:

- unit scoring;
- budget allocation;
- eviction thresholds;
- resolution strategy ordering;
- projection formatting and cache layout.

The inner loop uses recorded traces and immutable snapshots of public
repositories. It never invokes an evaluator LLM. Before research begins, the
agent must download and verify every required paper in `papers/manifest.json`,
read the required set, and record the corpus digest in the experiment ledger.
For each candidate it computes:

- byte-exact current-unit precision and required-set recall;
- stale and duplicate units and bytes;
- exact historical-revision recovery;
- output determinism across repeated runs;
- projection bytes and optional tokenizer-specific counts;
- update propagation and transform latency at p50, p95, and p99;
- context-delta amplification and cache-prefix reuse;
- unresolved-unit rate, peak RSS, and throughput.

An example normalized replay score is:

\[
R = 100R_g - 100S - 30D - 10U - 5T - 5C
\]

where \(R_g\) is gold-unit recall, \(S\) stale-code rate, \(D\) duplicate-code
rate, \(U\) unresolved rate, \(T\) normalized provider-payload bytes, and \(C\)
normalized cache churn. Tokenizer-specific counts may be reported as a
secondary view, but the core metric is deterministic and model-independent.
Weights are fixed before a search run and reported with results.

The scalar is only a search convenience. Correctness is lexicographic: any
candidate that injects stale content, duplicates a current unit, corrupts
recovery, violates the budget, or becomes nondeterministic is invalid regardless
of its score. Valid candidates are compared as a Pareto frontier over bytes,
latency, memory, required-set recall, and cache-prefix reuse.

No full agent run is required to accept a context-engine improvement. Adapter
integration uses deterministic request-capture providers: a scripted trace
causes reads and mutations, the harness builds the provider payload, and
CtxBench compares that payload with a byte-exact oracle. Optional model-based
studies are kept in a separate results namespace and cannot change the core
claim.

## 8. Evaluation design

### 8.1 Baselines

At minimum, the evaluation should include:

1. stock append-only context;
2. conservative stale-result pruning;
3. lossless compaction/retrieval where supported;
4. a faithful whole-file CORVUS reproduction;
5. FreshCtx without autoresearch optimization;
6. the best frozen FreshCtx policy selected on training tasks.

### 8.2 Harnesses

The first two target harnesses are Pi and Hermes because both expose a
per-request context transformation seam. Pi provides a non-destructive
`context` event before each model call. Hermes ContextEngine plugins provide
`select_context()` for request-only message replacement. A fake provider records
the exact payload and returns a fixed sentinel response, so compatibility can be
tested without sampling a model or judging generated code.

Oh My Pi is a high-value third target because its optimized read/edit/LSP stack
makes it a stronger baseline than a minimal harness. Closed products such as
Cursor and Claude Code should not be used for architectural claims unless an
SDK surface allows the same request transformation and measurement.

### 8.3 Trace suites

The planned progression is:

1. deterministic synthetic mutation fixtures;
2. schema-valid message replays for each supported harness;
3. generated mutation traces over pinned public repository commits;
4. repository-history traces with known before/after trees and affected symbols;
5. long-horizon co-editing traces where a deterministic second process changes,
   moves, duplicates, or deletes code units;
6. held-out repositories and mutation families not inspected during tuning.

### 8.4 Primary metrics

- stale-unit and stale-byte rate;
- duplicate-current-unit and duplicate-byte rate;
- byte-exact required-set precision and recall;
- ambiguity safety and deletion correctness;
- exact revision-recovery success;
- deterministic output hash agreement;
- projection bytes and context-delta amplification;
- cacheable-prefix reuse between consecutive payloads;
- refresh, resolution, selection, serialization, and total transform latency;
- throughput, peak RSS, and budget compliance.

Latency results report distribution percentiles, warmup policy, repetitions,
hardware, OS, filesystem, and cold/warm cache conditions. Repository URL, commit
SHA, trace hash, policy hash, adapter version, and environment image are pinned.
The normative formulas and public corpus appear in `docs/EVALUATION.md`.

Task success, pass@1, reasoning quality, and generated patch quality are
explicitly non-primary. They may be explored in a separate study, but FreshCtx
will not use stochastic model output to prove that the deterministic context
transformation is correct or fast.

## 9. Claim ladder

FreshCtx uses a strict claim ladder:

### Level 0: invariant prototype

The implementation passes deterministic tests showing freshness, uniqueness,
recoverability, and conservative ambiguity handling.

### Level 1: replay improvement

On held-out traces, FreshCtx reduces stale and duplicate context while retaining
gold code under the same budget.

### Level 2: public-repository improvement

On pinned public repositories, FreshCtx improves the correctness/bytes/latency
Pareto frontier over append-only and whole-file synchronization baselines.

### Level 3: portable request transformation

The exact result reproduces through request-capture adapters for Pi and Hermes
without a real provider call.

### Level 4: state-of-the-art claim

FreshCtx outperforms the strongest reproduced context baseline, including
whole-file CORVUS-style synchronization, on pre-registered deterministic
metrics and held-out repository traces while passing every correctness gate.
Only Level 4 supports wording such as “state of the art context transformer.”
It does not support the broader wording “best coding agent.”

## 10. Security and correctness risks

FreshCtx sits on the path between tools and the model, making failure modes
important:

- **Incorrect relocation:** a unit is resolved to similar but wrong code.
  Mitigation: uniqueness checks, structural identity, revision evidence, and
  fail-closed omission.
- **Prompt injection in source:** live code comments can contain adversarial
  instructions. Mitigation: explicit data boundaries and preservation of host
  security policy; FreshCtx must never treat code as system instructions.
- **Secret retention:** exact historical revisions may contain credentials.
  Mitigation: local-only storage, repository-scoped permissions, retention
  policy, and optional redaction before persistence.
- **Symlink/path escape:** a tracked path can leave the project root.
  Mitigation: canonical-path validation and no-follow defaults.
- **Cache regression:** frequent projection changes can increase provider cache
  writes even while reducing raw tokens. Mitigation: measure cache economics
  directly and keep dynamic content at the request tail.
- **Hidden uncertainty:** silently omitting a relevant unit can make a model
  overconfident. Mitigation: visible omitted/unresolved counts and recovery
  handles.

## 11. Scope

FreshCtx is responsible for:

- tracking mutable code observations;
- resolving their current state;
- choosing a bounded live working set;
- masking historical snapshots;
- rendering a deterministic request projection;
- exposing exact recovery and telemetry.

FreshCtx is not responsible for:

- choosing the foundation model;
- planning or task decomposition;
- general long-term user memory;
- repository-wide semantic search;
- applying code edits;
- running tests or judging task completion;
- sandboxing arbitrary commands.

Keeping this boundary narrow makes improvements attributable and adoption
possible inside existing harnesses.

## 12. Expected contribution

If the hypothesis is confirmed, FreshCtx contributes three things to the agent
community:

1. an open implementation of synchronized context that harness authors can
   embed rather than re-create;
2. a public benchmark separating context freshness from general model ability;
3. an autoresearch environment where context policies can improve through
   measurable code changes instead of prompt folklore.

If the hypothesis is falsified, the negative result is still valuable. It may
show that provider caching outweighs token savings, that models depend on
chronological file snapshots, that symbol selection drops essential context, or
that whole-file CORVUS is already near the practical optimum. Those outcomes
must be published rather than hidden.

## References

- Zheng et al., [CORVUS: Context Optimization and Reduction Via Underlying
  Synchronization for LLM Coding Agents](https://arxiv.org/abs/2607.22711),
  2026.
- Kim et al., [CodeStruct: Code Agents over Structured Action
  Spaces](https://arxiv.org/abs/2604.05407), 2026; source implementation at
  [amazon-science/CodeStruct](https://github.com/amazon-science/CodeStruct).
- Cursor, [Agent Search documentation](https://cursor.com/docs/agent/tools/search).
- Anthropic, [Claude Code tools reference](https://code.claude.com/docs/en/tools-reference).
- Pi, [Usage](https://pi.dev/docs/latest/usage) and
  [Extensions](https://pi.dev/docs/latest/extensions) documentation.
- Nous Research, [Hermes built-in tools](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/tools-reference.md)
  and [Context Engine plugin API](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-engine-plugin.md).
- Bölük et al., [Oh My Pi](https://github.com/can1357/oh-my-pi).
- Schoettler, [Hermes LCM](https://github.com/stephenschoettler/hermes-lcm).
- GlitterKill, [Symbol Delta Ledger](https://github.com/GlitterKill/sdl-mcp).
- Lindenbauer et al., [The Complexity Trap: Simple Observation Masking Is as
  Efficient as LLM Summarization for Agent Context
  Management](https://arxiv.org/abs/2508.21433), 2025.
- Cassano and Rush, [View-oriented Conversation Compiler for Agent Trace
  Analysis](https://arxiv.org/abs/2603.29678), 2026.
- [Self-GC: Self-Governing Context for Long-Horizon LLM
  Agents](https://arxiv.org/abs/2607.00692), 2026.
- Liu et al., [Lost in the Middle: How Language Models Use Long
  Contexts](https://arxiv.org/abs/2307.03172), 2023.
- Gim et al., [Prompt Cache: Modular Attention Reuse for Low-Latency
  Inference](https://arxiv.org/abs/2311.04934), 2023.
- [Don't Break the Cache: An Evaluation of Prompt Caching for Long-Horizon
  Agentic Tasks](https://arxiv.org/abs/2601.06007), 2026.
- Pan et al., [SmoothAgent: Efficient Long-Horizon LLM-Based Agent Serving with
  Lookahead Context Engineering](https://arxiv.org/abs/2607.00151), 2026.
- [A Survey of Context Engineering for Large Language
  Models](https://arxiv.org/abs/2507.13334), 2025.

The executable paper manifest is `papers/manifest.json`; this reference list is
descriptive, while the manifest is the source of truth for required downloads.
