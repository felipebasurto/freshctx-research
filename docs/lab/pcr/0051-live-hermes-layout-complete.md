# PCR 0051 — Live Hermes layout complete (CLI list + observe)

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent (box layout-complete probe)
- Branch / PR: `cursor/pcr-0051-live-hermes-layout-036f` (new draft PR)
- Commit: (this docs commit)
- Merge-base: `09776e76c87ba9f72725efae4bb928394ce6c7d7` (main; PCR 0050 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `layout-complete`
- Decision: **review** (documentation only; no product change)

## Hypothesis or change

PCR 0050 traced live Hermes CLI hooks with a **hermes-only extract** plugin
(`832713a`) and found bridge subprocess rc=1 (`Cannot find module
'../request-prune.mjs'`). Live `select_context` returned `None`; state stayed
`{}`; observe never ran. The named hole was **plugin install layout**, not host
skip or persist algorithm.

This PCR runs the **next measurement** PCR 0050 prescribed: re-run the live
one-shot hook trace with persist2 plugin `832713a` **and sibling imports**
(`adapters/request-prune.mjs` + core `src/`). bun loaded `bridge.mjs` with no
`MODULE_NOT_FOUND`. Not a paper result. Not an A-append gold claim. No persist
merge.

Workdir (not in git): `/workspace/freshctx-live-2026-08-23-cli-layout/`
(`artifacts/hook_trace.jsonl`, `artifacts/gold/*`, state file). Thinker scored
the box files directly; not `REPORT.md`.

Session: `20260822_232051_a8cf8a` (`hermes-home-clean`).

## Named why

PCR 0050's import failure was **layout**, not bridge logic. With siblings
present, bun bridge rc=0 on both `select_context` calls. Call 1 (pre-tool,
0 read pairs) returns a **list** of length 2. Call 2 (post-`read_file`, 1 read
pair) returns a **list** of length 5 with FreshCtx projection (not only raw
Hermes tool payload). `on_turn_complete` observe rc=0;
`{"observedCalls":1}`. State file populated with `calls` + `tracked` for
`read_file` of `hook_probe.txt` containing `HOOK_PROBE_OK` — not empty `{}`.

**Collision (honest):** a later `--continue` overwrote some live turn-1 request
logs. Score from **gold captures** + current `hook_trace.jsonl`; do not hide the
collision.

## Hook table (from `artifacts/hook_trace.jsonl`)

Thinker scored the box files directly. Not `REPORT.md`.

| hook | fired | call | return_kind | return_len | n_messages | n_read_pairs | bridge_rc | notes |
|---|---|---|---|---|---|---|---|---|
| on_session_start | yes | 1 | none | — | — | — | — | session `20260822_232051_a8cf8a`; created state file |
| select_context | yes | 1 | **list** | 2 | 2 | 0 | 0 | pre-tool; bridge loaded (no MODULE_NOT_FOUND) |
| select_context | yes | 2 | **list** | 5 | 4 | 1 | 0 | post completed `read_file`; FreshCtx rewrite |
| on_turn_complete | yes | 1 | none | — | — | 1 | — | observe rc=0; stdout `{"observedCalls":1}` |

## select list vs None (0050 vs 0051)

| run | plugin layout | select call 1 | select call 2 | observe | state |
|---|---|---|---|---|---|
| PCR 0050 / hooktrace (hermes-only extract) | adapters/hermes only; missing siblings | **None** | **None** | never ran | `{}` |
| PCR 0051 (this box) | `832713a` + siblings (`request-prune.mjs` + `src/`) | **list** (len 2) | **list** (len 5) | rc=0 `observedCalls=1` | `calls` + `tracked` populated |

## First-chat gold (collision-safe)

Gold captures preserved for Thinker scoring. Live turn-1 request logs partially
overwritten by a later `--continue`; gold is authoritative for request shape.

| artifact | shape | token / projection |
|---|---|---|
| `artifacts/gold/req_001.json` | 2 msgs | no `HOOK_PROBE_OK` token |
| `artifacts/gold/req_002.json` | 5 msgs | `HOOK_PROBE_OK` present; **FreshCtx projection present** (rewrite, not only raw Hermes tool payload) |
| `artifacts/gold/state-after-turn1.json` | tracked | same `calls` / `tracked` shape as live state file |

## Box evidence

| item | value |
|---|---|
| Plugin layout | persist2 `832713a` **with siblings** (`adapters/request-prune.mjs` + `src/`) |
| Bridge load | bun loaded `bridge.mjs`; **no** `MODULE_NOT_FOUND` |
| Live `select_context` call 1 | return_kind=list; return_len=2; bridge_rc=0 |
| Live `select_context` call 2 | return_kind=list; return_len=5; n_read=1; bridge_rc=0 |
| Live `on_turn_complete` | observe rc=0; stdout `{"observedCalls":1}` |
| State file | `hermes-home-clean/artifacts/freshctx-state/233d965fd31f58e35ce1.json` — **`calls` + `tracked` populated** for `read_file` of `hook_probe.txt` (`HOOK_PROBE_OK`); not `{}` |
| Collision | later `--continue` overwrote some live turn-1 request logs; score from gold + `hook_trace.jsonl` |
| Model | `deepseek-chat` |
| Host | `999703fd` untouched |

## Honest finding

**Layout was the hole.** With sibling imports present, the bridge runs, live
`select_context` returns a **list** (not `None`), observe runs, and state
populates after a completed read pair. This closes PCR 0050's import/layout
diagnosis for the measured box path.

This is **not** a paper result, **not** an A-append gold claim, and **not**
evidence that a persist adapter should merge.

**PR 38 (closed, discard):** unit persist probes passed but did **not** clear
live gold. Do **not** merge any persist adapter. PCR 0045 / 0046 remain on
that closed PR only — not pending, not filed here.

## What we did

- Ran live Hermes CLI one-shot with persist2 plugin `832713a` **and sibling
  layout** (`request-prune.mjs` + `src/`) and captured hook trace, gold
  captures, and state file from box workdir.
- Did **not** edit `src/anchors.mjs`, door, holdout traces/gold,
  `bench/repos.lock.json`, `bench/hosts.lock.json`, adapter bridge logic, or
  persist behavior. Door stays `f8771c93894095348185ef3453a3c2498355b3c6`.
  `repos.lock` blob stays `79e29d09a9ec12b1128617f683f50a35a3c8809e`.
  `AUTORESEARCH_SCORE` stays 89.107165. `resultSetHash` stays null.

## Pins (unchanged)

| artifact | SHA |
|---|---|
| FreshCtx product | `4ccb0083` |
| Hermes Agent host | `999703fd` |
| Door | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `repos.lock` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| `AUTORESEARCH_SCORE` | 89.107165 |
| `resultSetHash` | null |
| Plugin source (layout-complete probe only; not in this PR) | `832713a` |

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` |
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` (unused) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | no | — | docs-only PCR |
| `hermes chat -q` live layout-complete hook trace | yes | 0 | box workdir; list + observe |
| A-append gold matrix | no | — | explicitly not re-run |

## Metric snapshot

| check | result |
|---|---|
| bridge import on layout-complete plugin | **pass** (no MODULE_NOT_FOUND; bridge_rc=0) |
| live `select_context` rewrite | **yes** (both calls return list) |
| state populated after read | **yes** (`calls` + `tracked`; not `{}`) |
| observe after turn 1 | **yes** (rc=0; `observedCalls=1`) |
| skip class (0048/0049/0050) | **closed for this box** — root cause was layout |
| class 1 (never calls) | **ruled out** (0049) |
| door / lock / score | unchanged |

## Comparison

- PCR 0045 / 0046 (closed PR 38, discard): persist adapter + A-append; live
  gold miss despite unit persist pass.
- PCR 0049: live hook trace; Hermes fires hooks; adapter None (pre-layout fix).
- PCR 0050: hermes-only extract omits siblings; import fail; live None.
- PCR 0051 (this note): siblings present; select returns list; observe ran;
  state populated; not SOTA; no persist merge.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note.

## Limitations

- Does not fix default plugin packaging / install for Hermes end users.
- PR 38 closed (discard); persist adapter not mergeable.
- Live turn-1 request logs partially overwritten; gold captures are authoritative.
- No A-append re-run. Workdir evidence is box-local; not vendored in git.

## Protocol gap?

**No.** Docs only. Holdout seal, door, and locks untouched.

## Next measurement

Harden plugin extract / install so siblings ship by default on Hermes install
(without manual sibling copy). Re-run live one-shot after packaging fix. Do
**not** merge any persist adapter. Do **not** re-run the A-append gold matrix.
