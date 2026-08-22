# PCR 0048 — Hermes CLI hook skip (host-side)

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent (host read-only investigation)
- Branch / PR: `cursor/pcr-0048-hermes-cli-hook-skip-c248` (new draft PR)
- Commit: (this docs commit)
- Merge-base: `ce0c4aeb871b89bdb1ce2bdac805a2f17a37b21c` (main; PCR 0047 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `host-investigation`; `fail-open-delivery`
- Decision: **review** (documentation only; no product change)

## Hypothesis or change

PCR 0046 (draft PR 38) documented live Hermes CLI two-turn A-append with the
PCR 0045 persist adapter (`832713a`): ctor **yes**, state file seeded under
`artifacts/freshctx-state/`, but `calls` / `tracked` stayed `{}` and turn-2
POST lacked gold. Unit probes in `test/hermes-lifecycle.test.mjs` call adapter
hooks directly and pass; they are **not** the Hermes CLI hook path.

This PCR reads pinned Hermes Agent host `999703fd` (read-only tarball; not
vendored) and names the **host skip class** for why observe/select had no
effect on the live read.

**Skip class (fourth, provable): fail-open hook delivery on the wired CLI path.**
The host **does** invoke both seam entry points on `hermes chat -q` →
`Agent.run_conversation` → `conversation_loop.run_conversation`, but
`on_turn_complete` is **best-effort** (only from `finalize_turn`) and both
hooks are **fail-open** — adapter bridge failure or a no-op return leaves the
seeded state JSON empty and the turn-2 request unchanged. This is **not**
ABC-default short-circuit (FreshCtx was loaded; see box evidence below).

Classes 1–3 ruled for the wired path:

| class | claim | ruling |
|---|---|---|
| 1 — host never calls engine on CLI path | Hooks absent on `-q` | **Ruled out.** Both call sites sit on the normal CLI path (see Host cites). FreshCtx override prevents ABC short-circuit at `1662-1663` / `1744-1745`. |
| 2 — host calls with empty messages | `finalize_turn` / `select_context` get `[]` or no tool pairs | **Ruled out for turn 2.** Box turn-2 POST retained the turn-1 `read_file` tool payload (stale marker present). `_apply_context_engine_selection` receives the assembled `api_messages` list built from full session history (`2164-2298`). |
| 3 — wrong session id | State file keyed to a different session than observe/select | **Possible contributor for state file only**, not sufficient alone. Turn-2 `select_context` also runs `discoveredCalls()` inline on `request_messages` (`adapters/hermes/bridge.mjs`), so a session-id mismatch does not by itself explain stale bytes when tool pairs are present in the request. |

## Host cites (Hermes Agent `999703fd`, read-only)

### `select_context` — before every provider POST

| item | location |
|---|---|
| Call site (per API iteration) | `agent/conversation_loop.py:2395` |
| Implementation | `agent/conversation_loop.py:1630-1712` (`_apply_context_engine_selection`) |
| ABC no-op short-circuit (skip call entirely) | `agent/conversation_loop.py:1662-1663` |
| Fail-open on exception or invalid return | `agent/conversation_loop.py:1688-1695`, `1697-1698`, `1707-1711` |

CLI `-q` reaches this path via `cli.py:21337-21340` (quiet) or
`cli.py:21434` → `HermesCLI.chat` → `run_agent.py:8857-8869` →
`conversation_loop.run_conversation`.

### `on_turn_complete` — after turn loop (best-effort)

| item | location |
|---|---|
| Call site | `agent/turn_finalizer.py:641-660` |
| Implementation | `agent/conversation_loop.py:1715-1763` (`_notify_context_engine_turn_complete`) |
| ABC no-op short-circuit | `agent/conversation_loop.py:1744-1745` |
| Fail-open on exception | `agent/conversation_loop.py:1758-1763` |
| Only reached from main-loop fall-through | `agent/conversation_loop.py:8395-8414` |
| Early-return paths that **bypass** `finalize_turn` (no hook) | `agent/conversation_loop.py:3989-3996`, `7077-7084` |
| Documented best-effort contract | `website/docs/developer-guide/context-engine-plugin.md:135` |

Engine attach + session start (proves FreshCtx loaded, not built-in compressor):

| item | location |
|---|---|
| Config-driven engine load | `agent/agent_init.py:2639-2699` |
| `on_session_start` on `context_compressor` | `agent/agent_init.py:2884-2896` |

## Box evidence (from PCR 0046; not re-run here)

- Plugin: PR 38 adapter `832713a` (persist; PCR 0045 on PR 38 — not merged here).
- State file created under `artifacts/freshctx-state/` with body
  `{"calls":{},"tracked":{}}` — seeded by `on_session_start` /
  `_ensure_state_file`, never populated by observe.
- Turn-2 POST (gold / iso2 / persist2): stale `ALPHA_OLD_MARKER_7f3a` in
  turn-1 `read_file` tool payload; `ALPHA_NEW_MARKER_9c2b` absent despite disk
  mutation.

**Consistency check:** state path proves FreshCtx `on_session_start` ran on
the loaded `context_compressor`. ABC short-circuit would skip both hooks for
the built-in `ContextCompressor` and would **not** create that path. Empty
seeded state + unchanged request therefore points to **hook invoked but
fail-open** (adapter `_call_bridge` returned `None` → host kept original
messages per `1697-1698`), not to “host never wired the CLI path.”

## What we did

- Fetched Hermes Agent `999703fd` read-only (GitHub tarball); no host vendoring.
- Traced `_apply_context_engine_selection` and
  `_notify_context_engine_turn_complete` from CLI `-q` entry through
  `run_conversation` / `finalize_turn`.
- Cross-checked PCR 0044 / 0046 box notes and PR 38 adapter contract.
- Did **not** edit `src/anchors.mjs`, door, holdout traces/gold,
  `bench/repos.lock.json`, `bench/hosts.lock.json`, adapters, or tests.
  Door stays `f8771c93894095348185ef3453a3c2498355b3c6`. `repos.lock` blob stays
  `79e29d09a9ec12b1128617f683f50a35a3c8809e`. `AUTORESEARCH_SCORE` stays
  89.107165. `resultSetHash` stays null.

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` |
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` (unused) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | no | — | docs-only PCR |
| host tarball read | yes | 0 | read-only; no Hermes install |
| live CLI re-run | no | — | uses PCR 0046 box evidence |

## Metric snapshot

| check | result |
|---|---|
| skip class | **fail-open hook delivery (fourth, provable)** |
| `select_context` wired on CLI `-q` | **yes** (`conversation_loop.py:2395`) |
| `on_turn_complete` wired | **yes**, best-effort (`turn_finalizer.py:641-660`) |
| ABC short-circuit on FreshCtx | **no** (override; state path proves engine loaded) |
| box: state populated after read | **no** (0046) |
| box: turn-2 gold in request | **no** (0046) |
| door / lock / score | unchanged |

## Comparison

- PCR 0041: scripted driver; gold on file-scope cells (not CLI hooks).
- PCR 0044: ctor yes; empty state; gold miss (pre-persist adapter).
- PCR 0045 (PR 38): adapter persist unit probes pass; not CLI path.
- PCR 0046 (PR 38): post-persist CLI; same gold miss; asked for this host read.
- PCR 0047: newline-fixed B/B2 only; unrelated to A-append hook delivery.
- PCR 0048 (this note): names host skip class + next measurement. Not SOTA.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note.

## Limitations

- Host investigation is static source read; hook fire on the exact box run is
  inferred from wiring + box symptoms, not a live trace in this PCR.
- Does not diagnose bridge subprocess failure mode (node path, import, timeout).
- Does not merge PR 38 adapter or re-run A-append.

## Protocol gap?

**No.** Docs only. Holdout seal, door, and locks untouched.

## Next measurement

**One-shot hook trace (not another A-append lottery).** In an isolated
`HERMES_HOME` with `context.engine: freshctx` and plugin at `832713a`:

1. Single `-q` turn that performs one real `read_file` on a tiny workspace file
   (no marker mutation board).
2. Before the run, enable Hermes debug logging or inject a one-line host probe
   (allowed only to prove hook fire) at:
   - `_apply_context_engine_selection` entry/exit (`conversation_loop.py:1630`)
   - `_notify_context_engine_turn_complete` entry/exit (`conversation_loop.py:1715`)
3. Record per hook: `session_id`, `len(messages)`, count of completed
   `read_file` tool pairs, and whether the adapter bridge subprocess ran /
   exit code.
4. Pass criterion: log shows both hooks fired with ≥1 completed read pair on
   turn 1; fail criterion: `finalize_turn` path not reached or hooks skipped by
   ABC short-circuit.

Do **not** re-run the A-append gold matrix until hook fire is confirmed.
