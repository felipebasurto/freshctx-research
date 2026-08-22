# PCR 0049 — Live Hermes CLI hook trace (one-shot)

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent (box one-shot hook trace)
- Branch / PR: `cursor/pcr-0049-live-hermes-cli-hook-trace-8e52` (new draft PR)
- Commit: (this docs commit)
- Merge-base: `a0cab7031a989466ed0d732bc0ae8ed722f80364` (main; PCR 0048 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `hook-trace`; `fail-open-delivery`
- Decision: **review** (documentation only; no product change)

## Hypothesis or change

PCR 0048 (host read-only) named **class 4 — fail-open hook delivery** on the
wired CLI path: the host invokes `select_context` and `on_turn_complete`, but
adapter bridge failure or a no-op return leaves the seeded state JSON empty and
the request unchanged. Hook fire on the exact box run was **inferred**, not
traced.

This PCR runs the **next measurement** PCR 0048 prescribed: a one-shot hook
trace (not another A-append lottery). Single `hermes chat -q` turn. One real
`read_file` of `hook_probe.txt` (one line `HOOK_PROBE_OK`, real `0x0a`). No
mutation board. Official score is **token-in-request**. Language-agnostic gold.
Not a paper result.

Plugin: persist2 extract `832713a` with **adapter-side wrap only**
(`on_session_start` / `select_context` / `on_turn_complete` log JSON to
`artifacts/hook_trace.jsonl`). Wrapped copy only; plugin source not in this PR.
Host `999703fd` untouched. Door / lock untouched.

Workdir (not in git): `/workspace/freshctx-live-2026-08-23-cli-hooktrace/`.

## Hook table (from `artifacts/hook_trace.jsonl` + `REPORT.md`)

| hook | fired | n_calls | return_kind | n_messages | n_read_pairs | notes |
|---|---|---|---|---|---|---|
| on_session_start | yes | 1 | none | null | null | session `20260822_230411_d1afb4`; created state file |
| select_context | yes | 2 | none / none | 2 then 4 | 0 then 1 | call 1 pre-tool; call 2 after completed `read_file`; both returned None (no rewrite) |
| on_turn_complete | yes | 1 | none | 4 | 1 | `finalize_turn` notify |

**Pass criterion (PCR 0048):** both `select_context` and `on_turn_complete`
fired with ≥1 completed read pair on turn 1. **Met.**

## Box evidence

| item | value |
|---|---|
| Command | single `hermes chat -q` |
| Workspace file | `hook_probe.txt` — one line `HOOK_PROBE_OK`, real `0x0a` |
| Token-in-request | `HOOK_PROBE_OK` absent from `req_001` (2 msgs); present in `req_002` tool payload (4 msgs) |
| Model | `deepseek-chat` |
| Exit | 0 |
| Wall | 6.353 s |
| Engine | instantiated |
| `agent.log` | Context compressor initialized=1; no engine instance found=0 |
| State file | `hermes-home/artifacts/freshctx-state/dbb01b2eb78be347027e.json` body `{"calls":{},"tracked":{}}` |

## Honest finding

The host **does** call the engine on `hermes chat -q`. **Class 1 (host never
calls)** is dead.

`select_context` returns `None` even with a completed read pair, so the persist
bridge did not rewrite the request and observe did not populate state. This
**confirms PCR 0048 class 4 (fail-open delivery)** on a live one-shot.

The remaining hole is **why the adapter/bridge returns None**, not whether the
host wired the hooks.

## What we did

- Ran isolated `HERMES_HOME` with `context.engine: freshctx`, plugin persist2
  extract `832713a` (adapter-side hook trace wrap only).
- Single `-q` turn: one real `read_file` on `hook_probe.txt`; no marker
  mutation board.
- Captured hook trace JSONL, request captures, state file, and `agent.log`.
- Did **not** edit `src/anchors.mjs`, door, holdout traces/gold,
  `bench/repos.lock.json`, `bench/hosts.lock.json`, adapters, or tests.
  Door stays `f8771c93894095348185ef3453a3c2498355b3c6`. `repos.lock` blob stays
  `79e29d09a9ec12b1128617f683f50a35a3c8809e`. `AUTORESEARCH_SCORE` stays
  89.107165. `resultSetHash` stays null.

## Pins (unchanged)

| artifact | SHA |
|---|---|
| FreshCtx product | `4ccb0083` |
| Hermes Agent host | `999703fd` |
| Door | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `repos.lock` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| `AUTORESEARCH_SCORE` | 89.107165 |
| `resultSetHash` | null |
| Plugin source (wrapped copy only; not in this PR) | `832713a` |

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` |
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` (unused) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | no | — | docs-only PCR |
| `hermes chat -q` one-shot hook trace | yes | 0 | wall 6.353 s; see box evidence |
| A-append gold matrix | no | — | explicitly not re-run |

## Metric snapshot

| check | result |
|---|---|
| hook fire (turn 1) | **yes** — all three hooks |
| pass criterion (≥1 read pair on turn 1) | **met** |
| `select_context` rewrite | **no** (both calls returned None) |
| state populated after read | **no** (`calls` / `tracked` empty) |
| skip class confirmed | **fail-open delivery (class 4)** |
| class 1 (never calls) | **ruled out** |
| door / lock / score | unchanged |

## Comparison

- PCR 0045 / 0046 (draft PR 38): persist adapter + A-append; gold miss; hook
  fire inferred.
- PCR 0048: host read-only; named class 4; prescribed this one-shot trace.
- PCR 0049 (this note): live hook trace confirms fire + fail-open; not SOTA.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note.

## Limitations

- Does not diagnose bridge subprocess failure mode (node path, import, timeout).
- Does not merge PR 38 adapter or re-run A-append.
- Workdir evidence is box-local; not vendored in git.

## Protocol gap?

**No.** Docs only. Holdout seal, door, and locks untouched.

## Next measurement

Diagnose **why** persist bridge `select_context` returns `None` with a
completed read pair present (bridge subprocess exit, import, session id,
message shape). Do **not** re-run the A-append gold matrix until bridge
rewrite is understood or fixed.
