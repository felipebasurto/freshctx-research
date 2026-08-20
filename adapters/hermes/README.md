# Hermes adapter

This preview engine subclasses Hermes' built-in `ContextCompressor`, so normal
Hermes compaction remains active. It adds `select_context()` for request-only
projection and `on_turn_complete()` for observation. A short-lived Node bridge
reuses the FreshCtx core and stores only tool-call-to-path mappings per session.

For a source checkout of Hermes, install this preview by symlinking the whole
directory into Hermes' documented context-engine plugin location. The symlink
is important because `bridge.mjs` imports the FreshCtx core from this repository:

```bash
ln -s "$PWD/adapters/hermes" "/path/to/hermes-agent/plugins/context_engine/freshctx"
```

Then select it in Hermes configuration:

```yaml
context:
  engine: freshctx
```

Requirements: Node.js 22+, a FreshCtx source checkout, and a Hermes version
whose `ContextEngine` exposes `select_context()` and `on_turn_complete()`.
Packaging through Hermes' user-plugin registry is a v0.3 gate; this command is
deliberately a source-development install, not a production installer.

The bridge recognizes OpenAI-format `read`, `read_file`, and `read_text_file`
tool calls. It synchronizes whole text files, rejects root escapes, symlinks
outside the workspace, binary data, and files over 512 KiB, and returns `None`
on bridge failure so Hermes uses its untouched request. It is a tested,
host-integrated preview scaffold, not yet a certified Hermes release. Schema fixtures,
concurrency tests, packaging, and a pinned Hermes compatibility matrix are v0.3
gates.

Official plugin contract:
<https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-engine-plugin.md>.
