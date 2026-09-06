# OpenCode bridge lab v0

**Not a product package path.** Research-only host-integration experiment.

Date: 2026-09-06. Felipe ran this against a local FreshCtx checkout at `~/Downloads/freshctx` (`freshctx@0.1.0`) using OpenCode.

## Question

Can FreshCtx attach to OpenCode as a plugin bridge with visible toggle, status, and refresh stats — without claiming task win rates?

## What this lab is / is not

| Is | Is not |
| --- | --- |
| Sidecar + OpenCode plugin bridge sketch | Official FreshCtx OpenCode adapter in the product repo |
| Toggle / toast / stats UX experiment | Paired outcome bench (see `labs/pi-outcome-v1`) |
| Fail-open bridge notes + OpenCode splice gotcha | SWE or Pi live win-rate evidence |

Do **not** cite this lab as evidence that FreshCtx improves agent pass rates.

## Artifacts

- `CONVERSATION.md` — session log
- `plugin-snapshot/` — `.opencode/` pieces as of 2026-09-06 (freshctx.ts, commands-freshctx.md, freshctx-status.mjs, package.json)

Source on Felipe Mac: `~/Downloads/freshctx/.opencode/`.

## Bridge shape (v1)

1. Sidecar: `freshctx serve --stdio --root <workspace>`
2. `tool.execute.after` on read-like tools → `observe`
3. `experimental.chat.messages.transform` → `prepare` → verify expected_sha256 → in-place splice → insert projection → `commit`
4. Fail open on bridge failure
5. OpenCode gotcha: mutate output.messages in place (anomalyco/opencode#25754)

### Toggle / viz / limits

- `/freshctx status|on|off`, env FRESHCTX_ENABLED, FRESHCTX_BUDGET_BYTES default 12000
- Toasts + `.opencode/freshctx-stats.json`
- v1: single shared session; read tool only; truncated plans fail open

## Honesty

Tree-sitter named Tree-sitter. No invented Pass@1/USD. Not blog copy. Not product package.
