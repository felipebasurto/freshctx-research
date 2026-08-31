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

Optional projection budget override (characters; default is 32768):

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
| Persisted Pi session / tool results | Pi session (unchanged by adapter) | yes (Pi) |

The `callToUnit` mapping is a plain in-process `Map`. It lets turn 2 reuse
turn-1 read metadata without a re-read **within the same Pi process**. After
restart, previously tracked reads are not refreshed until Pi reads the file
again.

The adapter keeps no record of what earlier requests contained. See
[stateless requests](#stateless-requests).

When a tracked file's disk bytes change this turn, that body is sent even if it
exceeds the 32,768-character default cap (PCR 0080). First-time whole-file reads
still compete for the cap: a ~39 kB file that was never injected stays omitted
until it changes.

If `bash` / `shell` names **exactly one** already-tracked path, or a recognized
multi-path dump that names at least one already-tracked path, and that call is
not served by the live projection, the request copy replaces the dump body with
a `freshctx:stale-dump` marker and keeps the tool pair so the model does not
retry (PCR 0081, PCR 0084, PCR 0091). Pi-native `toolCall` / `toolResult`
messages are walked, not only OpenAI `tool_calls`. When a recognized multi-path
dump also names unmatched paths, the marker explicitly says those named paths
are not supplied; exact path matching still stays fail-closed.

Deterministic replay (no Pi package required at bench time):

```bash
npm run ctxbench:pi-smoke
```

The replay harness in `adapters/pi/replay.mjs` mirrors the extension's
`tool_result`, `turn_start`, and `context` handlers. See
`docs/lab/pcr/0003-pi-smoke-capture.md`.

## Generic host codec

`codec.mjs` is the first production-shaped consumer of
`adapters/host-codec.mjs`. It accepts Pi-native `toolCall` content parts paired
with `toolResult` messages, decodes successful text `read` results, and composes
the existing replay transformer on an ephemeral request copy. It does not
replace the extension, invoke a model, use MCP as a data plane, or implement an
Oh My Pi adapter.

Its capability record is:

| Field | Value |
|---|---|
| `host` | `pi` |
| `hostVersion` | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` (Pi 0.84.2) |
| `adapter` | `freshctx-pi-host-codec` |
| `adapterVersion` | `0.1.0` |
| `canRewriteRequest` | `true` |

The host commit is the immutable Pi revision in `bench/hosts.lock.json`. Every
codec application reconstructs adapter state from the untouched Pi history,
refreshes against the supplied `cwd`, validates native pairing, and serializes
deterministically. Any capture, transformation, validation, or serialization
failure returns the exact original request object through `applyHostCodec()`.

## Stateless requests

Every unit the adapter selects carries its full current bytes in every request.
That holds on the first turn, on the tenth turn, and whether or not the file
changed in between. `content-bytes` is the UTF-8 length of the rendered body and
is 0 only when the current unit itself is empty. There is no `unchanged`
attribute and no cross-turn revision map.

A unit is either sent with its current bytes or counted as unresolved or
budget-omitted in the envelope. Sending a revision hash in place of the body
would make the request depend on what Pi sent earlier, and a provider is not
obliged to have kept it. See
`docs/lab/pcr/0079-stateless-byte-exact-requests.md`.

This costs bytes on repeated turns. Projection bytes for an unchanged
selection are the same on turn 2 as on turn 1, and the adapter's projection
bytes equal the core `freshctx-region` baseline exactly.

On later turns where the live tail collapses to the already-served stub or
omits entirely (PCR 0099/0100), bounded current unit bytes are inlined at the
original read tool-result slot in the **request copy only** so every selected
tracked unit stays quoteable (PCR 0103/0104). Persisted Pi tool results remain
observation-time; only the ephemeral provider payload changes.

When a first-time whole-file read is budget-omitted (PCR 0080), turn 1 keeps the
truthful `freshctx:omitted-read` marker. On later unchanged turns, after apply-ack
recorded the prior budget omit, the latest read slot carries bounded current bytes
from the refreshed registry so quoteability does not depend on a region reread
(PCR 0108). Fresh same-turn over-cap rereads and non-latest historical reads stay
omitted markers (PCR 0089).

## Read scope

The adapter synchronizes:

- **Whole files.** Path-only reads, and pagination that promotes to file scope
  under the Hermes-parity end-of-file rules (see PCR 0073 and PCR 0074).
- **Regions.** Explicit `scope: "region"` with `startLine` and `endLine`, or a
  finite `offset` and `limit` pair mapped to a line range.
- **Symbol scope.** Explicit `scope: "symbol"` reads refresh through the
  out-of-process Tree-sitter implementation for Python, JavaScript, TypeScript,
  Go, and Rust.
- **Cat-class shell reads.** A single-file `cat`, `head`, `tail`, `sed -n`, or
  `nl` issued through the `bash` or `shell` tool goes through the same workspace
  guard and tracking path as an official `read` (see PCR 0078). The parser is
  deliberately narrow. It rejects pipes, subshells, multiple files, and anything
  it does not recognize, and those stay ordinary shell results.

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

## Budget limits

The default selection budget is 32 768 chars. Selection is all-or-nothing per
unit. A first-time whole-file read larger than the budget stays omitted and is
reported in the envelope's `budget-omitted` count. A tracked file whose disk
bytes change this turn is sent even over the cap (PCR 0080). Raise
`FRESHCTX_BUDGET_CHARS` for a first read of that file, or read it in slices, which the
cat-class `head`, `tail`, and `sed -n` paths and the official `offset`/`limit`
reads both produce as region units.

Raising the default further was rejected in PCR 0078. A default that fits every
whole file is a whole-repo dump.

## Not supported yet

- Resume after process restart (no durable `callToUnit` or unit registry)
- Hermes Agent integration (use `adapters/hermes/` instead)
- Session persistence beyond Pi's own session store
- Integration test pinned to a specific Pi release (v0.2 gate)

The source targets the current `@earendil-works/pi-coding-agent` package. Pi's
official extension contract is documented at
<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md>.
