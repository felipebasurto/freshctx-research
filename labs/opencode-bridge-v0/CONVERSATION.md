# FreshCtx × OpenCode — Conversation Log

Date: 2026-09-06. Workspace: `/Users/felipe/Downloads/freshctx` (`freshctx@0.1.0`, Node ≥ 22, ESM, MIT).

---

## 1. User: please scan my project and understand it

**Assistant summary:**

- **Purpose:** Local sidecar (`freshctx serve --stdio`) that keeps LLM code-context fresh without knowing model/provider/harness. A harness-owned bridge rewrites the native request; FreshCtx owns safe workspace reads, Tree-sitter symbol identity, revision archive, deterministic selection, budget-bound projection (`README.md`, `HARNESSES.md`, `SECURITY.md`).
- **Architecture:** One stdio JSONL RPC process per host `session_id`: `bin/freshctx.mjs → src/cli.mjs → src/server.mjs → src/session.mjs`, with `protocol + schema/freshctx-v1.json`, `jsonl + client` transport, `.freshctx/{config.json, sessions, blobs, locks}` state, Tree-sitter code intelligence + selection + projection.
- **Modules:** `cli` (init/serve/clean/doctor), `server` (single-session guard, dispatch), `protocol` (strict validation, 4 required capabilities), `client` (test/harness helper), `jsonl`, `errors`, `hash` (`fc_*` units, `fp_*` plans), `workspace` (relative-only, no symlinks, `O_NOFOLLOW`, triple-stat, 512 KiB, UTF-8), `store` (ownership model, atomic writes, PID locks), `treesitter` (6 vendored WASMs: python, javascript, typescript, tsx, go, rust), `session` (observe/prepare/commit/recover/status core), `selection` (rank/dedup/overlap), `projection` (`content-bytes` framing).
- **Protocol flow:** `hello` (4 caps or `host_incompatible`) → `observe` (archive exact bytes, resolve symbol or file-fallback) → `prepare` (declarative plan: `expected_sha256`, markers, one base64 projection) → bridge verifies + copy-replaces + inserts + self-validates → `commit` (revalidates, `stale_plan` if changed). `recover` returns archived bytes; `status` is bodiless counters.
- **Invariants:** never stale (history never rendered as current), workspace confinement, state ownership, determinism/idempotency, hard budget cap, conservative parsing (single unique symbol or file-fallback).
- **Tests:** `npm test` — 32 tests across `protocol/session/treesitter/workspace/cli/bridge` + `pack:check`.

---

## 2. User: how can we install freshctx in opencode? could we do some sort of visualization or plugin inside of opencode to see when it acts and how?

**Assistant answer:**

- `freshctx` is sidecar-only; the repo ships **no** OpenCode bridge (`HARNESSES.md`). You need (1) sidecar + (2) your own bridge plugin.
- **Sidecar install:** `npm install -g freshctx` (or `npm link`), `freshctx doctor` (must list 6 langs), `freshctx init` per workspace, bridge spawns `freshctx serve --stdio --root <workspace>`.
- **Bridge loop:** `hello` (4 caps) → `tool.execute.after` → `observe` → `experimental.chat.messages.transform` → `prepare` → verify every `expected_sha256`, `splice` replacements into a copy, insert projection, self-validate, discard plan on any failure → `commit` (on `stale_plan`, prepare again or fail open).
- **OpenCode gotcha:** mutate `output.messages` **in place** (`splice`), never reassign — reassignment is a silent no-op (anomalyco/opencode#25754).
- **Visualization:** yes, in the same plugin via `client.app.log({ service: "freshctx" })`, a `freshctx_status` tool, toasts, and logging decoded projection heads/markers.

---

## 3. User: yes please. lets do it. lets find a way to toggle it on and off

**Assistant action — created:**

- `.opencode/plugins/freshctx.ts` — bridge: `tool.execute.after` (read tool → `observe`), `experimental.chat.messages.transform` (`prepare` + atomic apply + `commit`, fail-open, in-place `splice` only), plus `freshctx_status` / `freshctx_enable` / `freshctx_disable` tools and logging via `client.app.log`.
- `.opencode/package.json` — `@opencode-ai/plugin` dependency.
- **Toggle (priority order):** (1) in-memory flag via tools / asking the agent (“disable freshctx”, resets on restart); (2) env `FRESHCTX_ENABLED=0|false|off|no|disabled` starts disabled, otherwise enabled. Envs: `FRESHCTX_BUDGET_BYTES` (default 12000), `FRESHCTX_COMMAND`, `FRESHCTX_DEBUG=1`, `FRESHCTX_SESSION`.
- **Verified:** `bun build` + `node --check` pass, `npm test` 32/32.
- **V1 caveat:** single shared FreshCtx session (`opencode-<basename>`) because `messages.transform` input is `{}` with no sessionID; observes `read` tool only; truncated/compacted outputs discard the plan (fail open).

---

## 4. User: give me a slash command here in opencode and some way of viewing it activated with some color idk

**Assistant action — created:**

- `.opencode/commands/freshctx.md` — `/freshctx [status|on|off]`: routes to `freshctx_status` / `freshctx_enable` / `freshctx_disable`, replies `🟢 ON` / `🔴 OFF`.
- `.opencode/scripts/freshctx-status.mjs` — ANSI-colored snapshot injected via `` !`node .opencode/scripts/freshctx-status.mjs` `` (green=on/ok, red=off/error, yellow=needs attention).
- **Plugin toasts** (`client.tui.showToast`, all try/catch): green `success` on applied plan / enable; yellow `warning` on disable / stale / skipped; red reserved for errors; blue `info` for status notes.
- **Verified:** plugin + script build/check pass, script renders `ON` by default and `OFF` with `FRESHCTX_ENABLED=0`, `npm test` 32/32.

---

## 5. User: and how can we see some stats like when the context was updated or something. i can already see % of context usage and tokens spent

**Assistant action — added stats tracking:**

- **Plugin** now records counters (`observes/prepares/applies/discards/stale`), timestamps (`lastObserveAt/lastPrepareAt/lastAppliedAt`), `lastBytes`, and a capped (20) history — persisted to `.opencode/freshctx-stats.json` (survives restarts, best-effort, never breaks the agent).
- **`freshctx_status` tool** returns the stats block + last 10 history entries + sidecar counts, and fires a headline toast.
- **Status script** reads the stats file and prints `context updated 30s ago (observes=… prepares=… applies=… discards=… stale=… last=…B)`, a `last: observe/prepare/applied` line, and the last 3 events color-coded (green `applied`, yellow `stale/discard`, gray rest).
- **Mental model:** OpenCode's `% context / tokens` = whole-request model usage; FreshCtx stats = how much of it was *fresh* code (`lastBytes` vs `FRESHCTX_BUDGET_BYTES`), when it was last refreshed, and what was skipped.
- **Verified:** render checked with a temporary fake stats file (then removed), `bun build` + `node --check` pass, `npm test` 32/32.

---

## 6. User: give me this conversation in a md file

This file.
