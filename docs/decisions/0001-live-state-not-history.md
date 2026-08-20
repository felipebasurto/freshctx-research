# ADR 0001: Code observations are live state, not transcript history

Status: accepted.

## Context

Append-only transcripts preserve the bytes returned by a read even after the
workspace changes. Re-reading adds conflicting copies. Summarization is delayed
and may destroy exact evidence.

## Decision

The transcript records that an observation occurred and carries a stable unit
reference. Exact historical bytes live in a local revision archive. One current
materialized view is generated from the workspace for each provider request.

## Consequences

- FreshCtx requires request-context middleware; MCP alone is insufficient.
- Historical bytes must be recoverable and protected locally.
- Ambiguous current state is omitted rather than guessed.
- Provider cache layout becomes an explicit design variable.
- The stored host transcript can remain untouched.
