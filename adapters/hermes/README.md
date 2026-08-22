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

The bridge recognizes OpenAI-format `read`, `read_file`, and `read_text_file`
tool calls. It synchronizes whole text files, rejects root escapes, symlinks
outside the workspace, binary data, and files over 512 KiB, and returns `None`
on bridge failure so Hermes uses its untouched request. It is a tested,
host-integrated preview scaffold, not yet a certified Hermes release. Schema fixtures,
concurrency tests, packaging, and a pinned Hermes compatibility matrix are v0.3
gates.

Official plugin contract:
<https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-engine-plugin.md>.
