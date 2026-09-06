---
description: FreshCtx live-context status and toggle (usage /freshctx [status|on|off])
---

Live shell snapshot (terminal shows green=on/ok, red=off/error, yellow=needs attention):

!`node .opencode/scripts/freshctx-status.mjs`

User argument: $ARGUMENTS

- Empty or `status`: call the `freshctx_status` tool, then reply with one short block using these colored words: `🟢 ON` or `🔴 OFF`, sidecar `ok/unreachable`, tracked reads count, last action. Keep it under 8 lines.
- `on` or `enable`: call `freshctx_enable` (a green success toast appears in the TUI), then confirm `🟢 FreshCtx ON`.
- `off` or `disable`: call `freshctx_disable` (a yellow warning toast appears), then confirm `🔴 FreshCtx OFF — original requests go through`.
- Anything else: show usage `/freshctx [status|on|off]`.
