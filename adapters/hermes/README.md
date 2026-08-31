# Hermes adapter

This preview engine subclasses Hermes' built-in `ContextCompressor`, so normal
Hermes compaction remains active. It adds `select_context()` for request-only
projection and `on_turn_complete()` for observation. A short-lived Node bridge
reuses the FreshCtx core and stores only tool-call-to-path mappings per session.

## Install (layout-complete)

`bridge.mjs` imports sibling modules from this repository (`request-prune.mjs`
and `src/`). Symlinking only `adapters/hermes` into Hermes leaves those imports
unreachable and the bridge exits 1 — live `select_context` returns `None`.

From a FreshCtx source checkout, run the install script against your Hermes
Agent `plugins/` directory (the folder that contains `context_engine/`):

```bash
node /path/to/freshctx/adapters/hermes/install.mjs /path/to/hermes-agent/plugins
```

This stages three symlinks by default:

| Hermes path | FreshCtx source |
|---|---|
| `plugins/context_engine/freshctx/` | `adapters/hermes/` |
| `plugins/context_engine/request-prune.mjs` | `adapters/request-prune.mjs` |
| `plugins/src/` | `src/` |

Verify the staged layout (fails on hermes-only extracts):

```bash
node /path/to/freshctx/adapters/hermes/verify-layout.mjs /path/to/hermes-agent/plugins
```

Then select the engine in Hermes configuration:

```yaml
context:
  engine: freshctx
```

Requirements: Node.js 22+, a FreshCtx source checkout, and a Hermes version
whose `ContextEngine` exposes `select_context()` and `on_turn_complete()`.
Packaging through Hermes' user-plugin registry is a v0.3 gate; this install
script is the source-development path, not a registry publish.

## Stateless requests

Every unit the bridge selects carries its full current bytes in every request.
That holds on the first `select_context()` call and on every later one, whether
or not the file changed in between. `content-bytes` is the UTF-8 length of the
rendered body and is 0 only when the current unit itself is empty. There is no
`unchanged` attribute and no cross-request revision map.

A unit is either sent with its current bytes or counted as unresolved or
budget-omitted in the envelope. A revision hash in place of the body would make
the request depend on what Hermes sent earlier, and a provider is not obliged to
have kept it. See `docs/lab/pcr/0079-stateless-byte-exact-requests.md`.

`on_turn_complete()` writes tool-call and path mappings. `select_context()`
also writes, but only the pending-ack fields (`pendingInjectedRevision` and
`pendingAckAfterUserIndex`) that PCR 0097 needs so a later turn can apply the
request-only ack. It does not write the durable mapping tables. A state file
written by PCR 0077 may still carry a `lastInjectedRevision` key. The bridge
drops that key when it loads the file, so the next ordinary write removes it.

Projection bytes for an unchanged selection are the same on the second call as
on the first, and they equal the core `freshctx-region` baseline exactly.

On later turns where the live tail collapses to the already-served stub or
omits entirely (PCR 0099/0100), bounded current unit bytes are inlined at the
original read tool-result slot in the **request copy only** so every selected
tracked unit stays quoteable (PCR 0103/0105). Persisted Hermes tool results
remain observation-time; only the ephemeral provider payload changes.

## Read scope and refusals

The bridge recognizes OpenAI-format `read`, `read_file`, and `read_text_file`
tool calls, plus single-file cat-class shell reads (`cat`, `head`, `tail`,
`sed -n`, `nl`) issued through `bash` or `shell`. It synchronizes whole text
files and line regions, including `offset` and `limit` pagination mapped to line
ranges under the same end-of-file rules as the Pi adapter.

Official file-scope reads track `observation.content` from the persisted tool
message. Pi official file reads track disk bytes at `tool_result` instead.
Region and symbol reads track the tool-result body on both hosts.

The live Hermes bridge does not read `FRESHCTX_SIDECAR`. Replay can pass
`sidecarRunner` explicitly. `FRESHCTX_SIDECAR=off` is a Pi extension and
harness knob only.

The bridge also tracks `scope: "symbol"` reads and refreshes them through the
sidecar when a runner is present. File and region refresh use the sidecar only
for `.py`, `.js`, `.mjs`, `.cjs`, `.ts`, and `.tsx`.

It rejects root escapes, symlinks outside the workspace, binary data, and files
over 512 KiB, and it returns `None` on bridge failure so Hermes uses its
untouched request.

The default selection budget is 32 768 chars, and selection is all-or-nothing
per unit. A first-time whole-file read larger than the budget stays omitted. A
tracked file whose disk bytes change this turn is sent even over the cap
(PCR 0080). Override with `FRESHCTX_BUDGET_CHARS` or read the file in slices.

The shell parser is deliberately narrow. It refuses any command containing a
pipe, semicolon, ampersand, redirect, backtick, dollar sign, parenthesis, or
newline before it looks at the verb, so `cat src/app.py | head -50` is never
tracked and stays an ordinary shell result. The multi-path stale-dump matcher is
a separate pass that does split on unquoted pipes, because it only decides
whether to replace an already-tracked dump body with a marker. It never creates
a tracked unit.

The bridge has no environment switch for the Tree-sitter sidecar. The Python
engine never sends `sidecarRunner`, so `select_context()` always builds the
engine with the default sidecar runner. `FRESHCTX_SIDECAR=off` works in the Pi
extension only. Turning the sidecar off under Hermes needs a new bridge input.
The replay harness in `adapters/hermes/replay.mjs` is the only current way to
inject a null runner.

Symbol scope ships. A recognized OpenAI-format read with `scope: "symbol"` and
a selector tracks a symbol unit the same way Pi does. File and region refresh
on Go and Rust stay on whole-file and anchor paths. See ADR 0004.

Single-path shell dumps of already-tracked files are marker-replaced in the
request copy (PCR 0081). Safe multi-path `cat`/`nl` dumps are also
marker-replaced whenever at least one named path is already tracked; if the
dump also names unmatched paths, the marker explicitly says those named paths
are not supplied, and exact path matching still stays fail-closed (PCR 0084,
PCR 0091).

## Remaining gates

This is a tested, host-integrated preview, not a certified Hermes release. These
items are still open:

- packaging through Hermes' user-plugin registry, so the install stops depending
  on a FreshCtx source checkout and its sibling symlinks;
- a compatibility matrix pinned to released Hermes versions, and integration
  tests against them rather than against the current `main` contract;
- per-session locking. Two Hermes sessions pointed at one state file can
  interleave `on_turn_complete()` writes, and nothing serializes them today;
- schema fixtures for the plugin contract, and archive lifecycle cleanup.

Official plugin contract:
<https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-engine-plugin.md>.
