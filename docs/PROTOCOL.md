# Host Adapter Protocol

This document defines the proposed harness-neutral contract. It is narrower than
MCP because it runs on the provider-request path.

## Capabilities

An adapter negotiates:

```json
{
  "protocol": "freshctx/1",
  "capabilities": {
    "request_rewrite": true,
    "tool_result_identity": true,
    "workspace_barrier": false,
    "persistent_archive": false,
    "scopes": ["file", "region"]
  }
}
```

FreshCtx MUST refuse to claim its full invariant when `request_rewrite` or
stable tool-result identity is unavailable.

## Observe

After a successful text-code read:

```json
{
  "type": "freshctx.observe",
  "observation_id": "host-tool-call-id",
  "workspace_root": "/absolute/root",
  "path": "src/auth.ts",
  "scope": "region",
  "selector": "AuthService.refreshToken",
  "start_line": 40,
  "end_line": 72,
  "content_utf8": "...",
  "turn": 8
}
```

The host keeps its original transcript. FreshCtx returns stable unit identity
and observation revision. An observation is captured only if it can later be
matched to the exact host result and refreshed safely.

## Prepare request

Immediately before provider serialization:

```json
{
  "type": "freshctx.prepare",
  "workspace_root": "/absolute/root",
  "workspace_generation": "optional-host-sequence",
  "turn": 9,
  "task": "fixed task metadata",
  "budget_bytes": 24000,
  "messages": []
}
```

The response contains a request-only message list, projection decision record,
revision evidence, and stage timings. It never mutates the input list in place.

```json
{
  "protocol": "freshctx/1",
  "messages": [],
  "selected": ["fc_..."],
  "omitted": [],
  "unresolved": [],
  "workspace_generation": "observed-sequence",
  "payload_sha256": "...",
  "telemetry": {}
}
```

Returning no response, a protocol error, or an invalid message list means the
host uses its original request. A unit-level resolution failure is not a host
failure: FreshCtx returns a valid request with that unit omitted and identified.

## Stable marker

The marker depends only on stable unit identity and path, never current content,
revision, score, or turn:

```text
[freshctx:fc_0123456789abcdef path=src/auth.ts] Read body removed. Check the live projection.
```

Changing marker bytes for a file revision defeats prefix stability and is a
protocol regression.

The marker does not claim that the unit was selected. The projection records
every absent tracked unit by stable identity, path, and reason:

```text
<freshctx-omitted id="fc_0123456789abcdef" path="src/auth.ts" reason="budget"/>
```

`reason` is `budget` or `unresolved`. Omission records contain metadata only,
never last-known source bytes. They are sorted by stable unit identity
independently from selected-unit render order. This is an additive
`freshctx/1` rendering field: existing decoders that consume only
`freshctx-unit` bodies continue to decode selected code unchanged.

Projected units carry a `content-bytes` UTF-8 length. Evaluators and adapters
decode by that length, not by searching for the closing tag: source files may
legitimately contain FreshCtx-like delimiters. This framing preserves readable
raw code while giving the byte oracle an unambiguous boundary.

## Recover

```json
{
  "type": "freshctx.recover",
  "unit_id": "fc_0123456789abcdef",
  "revision": "sha256:..."
}
```

Recovery returns exact bytes plus provenance. It is a local inspection API and
does not automatically add historical bytes to a provider request.

## Telemetry

Telemetry carries no source bodies by default:

- counts and bytes observed, refreshed, selected, omitted, unresolved;
- revision hashes and resolution methods;
- workspace generation and retry count;
- refresh, resolve, select, rewrite, render, serialize, and total milliseconds;
- full payload and projection byte counts;
- previous/current payload hashes and prefix-reuse bytes;
- archive read/write counts and bytes;
- adapter/host/protocol versions.

Field additions are backward-compatible within protocol 1. Semantic changes
require a protocol version bump.

## Ordering constraints

The host calls FreshCtx after it has assembled the semantic message list but
before provider cache-control and wire serialization when possible. Provider
sanitizers may run afterward. The adapter must capture the final post-sanitizer
payload in integration tests because a valid FreshCtx list can still be changed
or rejected downstream.

## Concurrency

Each request identifies a session and workspace generation. Registry updates
are serialized per workspace or use optimistic compare-and-swap. Concurrent
sessions may share content-addressed blobs but not mutable working-set policy
state unless explicitly configured.
