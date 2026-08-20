# Pi adapter

This is a reference extension for Pi's public `tool_result`, `turn_start`, and
`context` events. It captures successful text-file reads, keeps the persisted
session unchanged, replaces captured results only in the request copy, and
appends one live projection before every model call.

From this repository:

```bash
pi -e ./adapters/pi/extension.ts
```

Optional configuration:

```bash
FRESHCTX_BUDGET_CHARS=24000 pi -e ./adapters/pi/extension.ts
```

The adapter refuses paths outside `ctx.cwd`, symlinks escaping that root,
binary files, and files larger than 512 KiB. Unsupported reads remain normal Pi
results. The current adapter is file-level and in-memory; session persistence,
partial-read fidelity, symbol providers, and an integration test pinned to a Pi
release are v0.2 release gates.

The source targets the current `@earendil-works/pi-coding-agent` package. Pi's
official extension contract is documented at
<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md>.
