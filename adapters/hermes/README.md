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

`select_context()` is read-only. It reads the session state file and never
writes it, so one request cannot change what the next request contains. The
bridge writes state from `on_turn_complete()` alone, and it stores only
tool-call and path mappings. A state file written by PCR 0077 may still carry a
`lastInjectedRevision` key. The bridge drops that key when it loads the file, so
the next ordinary write removes it.

Projection bytes for an unchanged selection are the same on the second call as
on the first, and they equal the core `freshctx-region` baseline exactly.

## Read scope and refusals

The bridge recognizes OpenAI-format `read`, `read_file`, and `read_text_file`
tool calls, plus single-file cat-class shell reads (`cat`, `head`, `tail`,
`sed -n`, `nl`) issued through `bash` or `shell`. It synchronizes whole text
files and line regions, including `offset` and `limit` pagination mapped to line
ranges under the same end-of-file rules as the Pi adapter.

It rejects root escapes, symlinks outside the workspace, binary data, and files
over 512 KiB, and it returns `None` on bridge failure so Hermes uses its
untouched request.

The default selection budget is 32 768 chars, and selection is all-or-nothing
per unit. A first-time whole-file read larger than the budget stays omitted. A
tracked file whose disk bytes change this turn is sent even over the cap
(PCR 0080). Override with `FRESHCTX_BUDGET_CHARS` or read the file in slices.

Single-path shell dumps of already-tracked files are marker-replaced in the
request copy (PCR 0081). Safe multi-path `cat`/`nl` dumps are also
marker-replaced when every named path is already tracked; a multi-path dump that
names any untracked path is left in place (PCR 0084).

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
