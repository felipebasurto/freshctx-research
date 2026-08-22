# PCR 0046 — live Hermes CLI observe/select miss (gold still absent)

- Date (UTC): 2026-08-22
- Author / agent: UltraCtxt Thinker (box session; documented after the run)
- Branch / PR: `cursor/hermes-zero-arg-engine-2820` (draft PR #38)
- Commit: `40b57e7`
- Merge-base: `620d7257dc35e8e7364bf641d2d3bd4b4c209928` (main at PCR 0043–0044)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `post-lifecycle-fix`; `pre-hook-delivery`
- Decision: **review** (documentation only; no product change)

## Hypothesis or change

PCR 0045 landed adapter lifecycle persist (`_ensure_state_file`, lazy init,
`TERMINAL_CWD` bridge cwd) at adapter commit `832713a`. The box re-ran live
Hermes CLI two-turn A-append with that plugin extracted from PR 38 — **not** a
scripted driver and **not** the unit probe in `test/hermes-lifecycle.test.mjs`.

**Phase label:** **post-lifecycle-fix adapter / pre-CLI-hook delivery**.

**Finding (lab note, not a paper claim):** ctor **yes** (engine instantiated).
A session state **file** appeared under `artifacts/freshctx-state/`, but its
contents stayed `{"calls":{},"tracked":{}}` — the live read was never
observed. Turn-2 DeepSeek POST bodies (runs labelled **gold**, **iso2**, and
**persist2**) all lacked `ALPHA_NEW_MARKER_9c2b`; the stale turn-1 `read_file`
tool payload still carried only `ALPHA_OLD_MARKER_7f3a` while the on-disk file
had the real-newline append.

**Interpretation:** on this CLI path Hermes did **not** invoke
`on_turn_complete` / `select_context` for the live read (or did not reach the
adapter bridge with tool messages the probe understands). The PCR 0045 unit probe
exercises adapter hooks directly and is **not** the Hermes CLI hook path. This
note does **not** claim gold delivery and is **not** a paper result.

## What we did

- FreshCtx core `4ccb0083`; Hermes Agent host `999703fd`; DeepSeek
  `deepseek-v4-flash`. Isolated venv and isolated `HERMES_HOME`.
- Installed Hermes plugin from PR 38 adapter tree at `832713a` (PCR 0045 persist
  logic; PCR 0042 ctor retained).
- Ran live two-turn A-append via `hermes chat -q` (three labelled attempts:
  gold, iso2, persist2).
- Inspected turn-2 request JSON for marker presence and read
  `artifacts/freshctx-state/*.json`.
- Did **not** edit `src/anchors.mjs`, door, holdout traces/gold,
  `bench/repos.lock.json`, `bench/hosts.lock.json`, or adapter code in this note.
  Did **not** retune policy or rerun A-append in CI (no DeepSeek key on Cloud VM).

Full request JSON is not archived in git.

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` |
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` (unused) |

Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6`.  
`repos.lock` blob: `79e29d09a9ec12b1128617f683f50a35a3c8809e`.  
`AUTORESEARCH_SCORE`: 89.107165. `resultSetHash`: null.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | no | — | docs-only PCR |
| live Hermes CLI A-append (×3) | yes | 0 | gold / iso2 / persist2; gold miss on all |
| DeepSeek HTTP | yes | 200 | same session family as PCR 0041 |

## Metric snapshot

| check | result |
|---|---|
| adapter source | PR 38 / `832713a` (PCR 0045 persist) |
| ctor | **yes** |
| state file on disk | **yes** (path under `artifacts/freshctx-state/`) |
| state JSON `calls` / `tracked` | `{}` / `{}` |
| gold in turn-2 request (`ALPHA_NEW_MARKER_9c2b`) | **no** (gold, iso2, persist2) |
| stale token in request (`ALPHA_OLD_MARKER_7f3a`) | **yes** |
| unit probe path | not exercised on CLI |
| door blob | unchanged |
| official score delta | n/a (live host) |

## Comparison

- PCR 0041: scripted driver; hermes-fresh delivered current markers on file-scope cells.
- PCR 0044: post-ctor-fix plugin; empty state dir; gold miss.
- PCR 0045: adapter persist unit tests pass; **does not** imply CLI hooks fire.
- PCR 0046 (this note): post-0045 adapter; state file seeded but never populated;
  CLI hook delivery gap. Not SOTA. Not a paper result.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note.

## Limitations

- n=1 workspace, synthetic markers, three CLI attempts on one mutation path.
- Full turn-2 POST bodies not in git.
- Does not diagnose which Hermes CLI code path skips `on_turn_complete` /
  `select_context`; host-side follow-up required.
- Does **not** invalidate PCR 0045 unit coverage; paths differ by construction.

## Protocol gap?

**No.** Docs only. Holdout seal, door, locks, and adapter SHA at `832713a` unchanged by this note.

## Next measurement

Trace Hermes CLI / gateway turn finalization for `context.engine: freshctx` and
confirm `_notify_context_engine_turn_complete` and
`_apply_context_engine_selection` run on real `read_file` tool pairs before the
turn-2 provider POST.
