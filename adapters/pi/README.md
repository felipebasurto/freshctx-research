# Pi adapter

Reference extension for Pi's public `tool_result`, `turn_start`, and `context`
events. It captures successful text-file reads, keeps the persisted session
unchanged, replaces captured results only in the request copy, and appends one
live projection before every model call.

## Install

From a FreshCtx source checkout (requires Node.js and the
[`pi`](https://github.com/earendil-works/pi) CLI with
`@earendil-works/pi-coding-agent`):

```bash
pi -e ./adapters/pi/extension.ts
```

Optional projection budget (characters):

```bash
FRESHCTX_BUDGET_CHARS=24000 pi -e ./adapters/pi/extension.ts
```

That is the only supported install path and the only configuration env var this
adapter reads. There is no separate install script, session store, or packaging
step.

## What is in-memory

All FreshCtx state lives in the Pi process and is lost when Pi exits:

| State | Where | Survives restart? |
|---|---|---|
| Tracked read units (`FreshCtxEngine` registry) | extension heap | no |
| `toolCallId → unitId` map (`callToUnit`) | extension heap | no |
| `unitId → revision` last inject map (`lastInjectedRevision`) | extension heap | no |
| Persisted Pi session / tool results | Pi session (unchanged by adapter) | yes (Pi) |

The `callToUnit` mapping is a plain in-process `Map`. It lets turn 2 reuse
turn-1 read metadata without a re-read **within the same Pi process**. After
restart, previously tracked reads are not refreshed until Pi reads the file
again.

`lastInjectedRevision` records the revision hash last sent with a full body in
the live projection. When disk bytes are unchanged on the next `context` hook,
FreshCtx emits a marker-only unit frame (`unchanged="true"`, `content-bytes="0"`)
instead of repeating the file body, so the request suffix can stay stable for
prefix-cache reuse. When disk changes, NEW bytes are injected as before.

Deterministic replay (no Pi package required at bench time):

```bash
npm run ctxbench:pi-smoke
```

The replay harness in `adapters/pi/replay.mjs` mirrors the extension's
`tool_result`, `turn_start`, and `context` handlers. See
`docs/lab/pcr/0003-pi-smoke-capture.md`.

## Read scope

The adapter synchronizes:

- **Whole files** — path-only reads and pagination that promotes to file scope
  (Hermes-parity EOF rules; see PCR 0073/0074).
- **Regions** — explicit `scope: "region"` with `startLine`/`endLine`, or finite
  `offset`/`limit` mapped to line ranges.

Region reads store the observed tool-result body at track time plus disk line
count for refresh. Interior edits can project via `stored-line-span` without a
re-read when anchors still resolve.

## Refused reads

These remain ordinary Pi tool results (FreshCtx does not track or refresh them):

- Paths outside `ctx.cwd` (workspace escape)
- Symlinks whose canonical target escapes the workspace root
- Binary files (NUL byte present)
- Files larger than 512 KiB

If tracking fails, Pi's persisted tool result is untouched. If a previously
tracked read cannot be refreshed, FreshCtx does not inject last-known content:
the stale tool-result body is replaced by a marker or dropped from the provider
payload, and projection may be empty for that unit.

## Fail-open

When the FreshCtx registry is empty, or when the `context` handler throws, the
extension returns `undefined` and Pi sends its original request unchanged. Adapter
failure never blocks the model call.

## Not supported yet

- Resume after process restart (no durable `callToUnit` or unit registry)
- Hermes Agent integration (use `adapters/hermes/` instead)
- Symbol / Tree-sitter providers
- Session persistence beyond Pi's own session store
- Integration test pinned to a specific Pi release (v0.2 gate)

The source targets the current `@earendil-works/pi-coding-agent` package. Pi's
official extension contract is documented at
<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md>.
