# Roadmap and release gates

This roadmap is a living inventory of repository facts and remaining evidence.
Completed work stays documented in the 145 Public Change Records under
`docs/lab/pcr/`; it is not kept here as an open milestone.

## Current behavior

- The provider-independent core uses only the Node.js standard library and
  implements stable unit identity, SHA-256 content identity, exact recovery,
  deterministic selection, and separate render ordering.
- Whole-file, line-region, and symbol scope are implemented.
- The out-of-process Tree-sitter implementation supports Python, JavaScript,
  TypeScript, Go, and Rust.
- Every selected unit carries its current bytes in every provider request
  ([PCR 0079](lab/pcr/0079-stateless-byte-exact-requests.md)).
- A same-turn refresh of an already observed unit may exceed the selection cap
  under the existing contract
  ([PCR 0080](lab/pcr/0080-refresh-over-budget.md)).
- Pi and Hermes transform request copies, preserve native tool pairing and
  persisted history, and return the original host request on adapter failure.
- MCP is available only as a possible inspection plane; host middleware remains
  the data plane that can rewrite a provider request.

## What the tests prove

The deterministic suite covers freshness, uniqueness, exact recovery,
revision-free stable markers, ambiguity and deletion safety, budget behavior,
selection/render-order separation, and stateless request bodies. Adapter replay
tests exercise capture, request-only transformation, native
assistant/tool/result pairing, and fail-open behavior without invoking a model.

Tree-sitter tests cover all five implemented languages and pin the process
boundary that keeps parser dependencies out of `src/`. Evaluate-routing tests
verify that this checkout selects `holdout-v0.3-apex` as its default physical
pack.

## Recorded evaluation

`holdout-v0.3-apex` is locally frozen, not production-GHA sealed. The recorded
measurement is:

- Isolated Semantic Engine: **8504 payload bytes**.
- Whole-file baseline: **36701 payload bytes**.
- Required recall: **5/5**.

`passAt1` is always `null` and out of scope. The measurement is evidence about
the pinned deterministic payload and oracle, not model task performance or a
broad production claim.

## P1: production boundaries

### Production freeze attestation

Consume and verify a real GitHub Actions freeze attestation for a protocol
fixture. The current apex pack remains locally frozen until this path succeeds
in production CI.

Exit gate: an authentic remote attestation verifies, while tampering and missing
attestation data fail closed with distinct errors.

### Durable local state

Move revision blobs and observation mappings from process memory to a
repository-scoped, permissioned local store with retention and garbage
collection.

Exit gate: session restart preserves exact recovery and tracked identity without
placing historical source bodies back in the provider request.

### Coherent workspace snapshots

Add a root-confined source provider with a request snapshot barrier, bounded
retry, no-follow symlink defaults, binary/size limits, and generation telemetry.

Exit gate: concurrent writes cannot produce a mixed-generation projection, and
unsafe paths contribute zero bytes.

### Released-host compatibility

Pin supported Pi and Hermes releases and capture the post-sanitizer request
through the no-model provider.

Exit gate: persisted host transcripts remain byte-identical, forced adapter
failure returns the untouched native request, and every satisfiable capture
passes the CtxBench correctness gates.

### Complete resource telemetry

Record refresh, resolve, select, rewrite, render, and serialization timing plus
peak memory for the core and both adapters.

Exit gate: raw rows include all stages under the performance procedure in
`EVALUATION.md`, with local CI measurements labeled as regression telemetry.

## P2: evaluation depth

### Broader structural corpus

Extend deterministic symbol sampling and independent gold extraction across the
full declared language and mutation matrix. Do not tune against locally frozen
or held-out packs.

Exit gate: released raw traces cover the declared matrix, reproduce from public
repository commits and hashes, and retain exact required bytes in satisfiable
cases.

### Independent whole-file baseline review

Keep `bench/corvus.mjs` and the `corvus-file` result key. Have a second
maintainer review the reproduction and its deviation table against the cited
paper.

Exit gate: the review records every material deviation and confirms identical
trace and budget treatment.

### Production packaging

Package the Pi and Hermes integrations with version ranges, session lifecycle,
locking, archive cleanup, and operator telemetry.

Exit gate: installation tests exercise the shipped layout and a compatibility
matrix identifies the exact host versions covered.

## P3: host and inspection expansion

### Oh My Pi codec

Build only after a stable request transformation seam is identified and can be
tested with byte-exact capture. Translation belongs under `adapters/`; no
host-specific message types enter `src/`.

Exit gate: the same semantic trace produces an equivalent live unit set while
preserving Oh My Pi's native protocol structure.

### Inspection API

Expose explicit track, refresh, recover, and status operations without routing
normal context bytes through MCP.

Exit gate: disabling the inspection API does not change request transformation,
and MCP failure cannot corrupt or block the host request.

## Evidence required for stronger public claims

Any broader public performance statement needs all correctness gates on the
declared development, validation, and remotely attested held-out traces; a
reviewed whole-file reproduction; a preregistered material improvement with no
material regression in other frozen metrics; coverage across the declared
languages; request capture through both released-host adapters; and public raw
results with negative cases.
