# PCR 0054 — Live Hermes install.mjs two-turn append (NEW in request)

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent (box install.mjs two-turn append probe)
- Branch / PR: `cursor/pcr-0054-live-hermes-install-t2-append-02cf` (new draft PR)
- Commit: (this docs commit)
- Merge-base: `dd2f58d4fec085a209626fd89f10770c4fa07ce6` (main; PCR 0053 docs)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `pack-install`; `t2-append`
- Decision: **review** (documentation only; no product change; 0052/0053 already shipped+confirmed install.mjs; this is the unconfounded turn-2 append)

## Hypothesis or change

PCR 0052 shipped `adapters/hermes/install.mjs` and `verify-layout.mjs`. PCR 0053
confirmed the **turn-1** live path: one-shot `hermes chat -q` + one `read_file`
after `node freshctx-src/adapters/hermes/install.mjs <host>/plugins`. The open
question was whether a **turn-2 append** (NEW content added to disk between
turns) appears in the live projection on the **same install layout**, without
persist-38 or hermes-only extract confounds.

This PCR runs the **unconfounded turn-2 append** on install.mjs staging. Not a
paper result. Not region B. Not n>1. No persist merge from PR 38.

Workdir (not in git): `/workspace/freshctx-live-2026-08-23-cli-t2append/`
(`artifacts/gold/turn1/`, `artifacts/gold/turn2/`, state file). Thinker scored
**gold/** of the **CLEAN rerun** only; not `REPORT.md`. Not
`artifacts/contaminated-run1/` (first pass broke `request-prune.mjs` with an
unquoted `->` redirect and dirtied the probe).

Session: `20260823_104105_ae1250` (`t2append-oneshot`). Isolated `HERMES_HOME`.

## Scored cell

Thinker scores the **box gold files directly**; not `REPORT.md`. Not
contaminated-run1.

| field | value |
|---|---|
| Scored cell | `t2append-oneshot` **two turns** (turn1 + turn2 gold) |
| Session | `20260823_104105_ae1250` |
| Install | `node freshctx-src/adapters/hermes/install.mjs <host>/plugins` from packinstall extract `516297d6` (same packaging as 0052; main `dd2f58d4` is docs 0053 on top). NOT hermes-only archive. NOT persist-38 / `832713a`. |
| `hook_trace.jsonl` turn1 | select **list/2** then **list/5** (`n_read` 0 then 1); bridge rc=0 |
| `hook_trace.jsonl` turn2 | select **list/7** then **list/9** (`n_read` 1 then 2); bridge rc=0 |
| `on_turn_complete` | **yes** turn1 (observe rc=0 `{"observedCalls":1}`); **yes** turn2 (observe rc=0 `{"observedCalls":2}`) |
| State file after t2 | first tracked key still OLD snapshot `file_size=18`; NEW in projection via disk re-read, not persist-38 tracked update; second tracked empty (model read offset 3 past EOF) |

## Named why

PCR 0053 proved install.mjs closes the packaging hole for **turn 1**. PCR 0046
(persist-38, closed PR 38) had a turn-2 A-append gold miss, but that cell used
hermes-only extract (layout confound) and persist adapter — not install.mjs
siblings. This box isolates: same install path as 0053, disk append between
turns, score turn2 gold only for NEW presence.

Turn 1: probe `T2APPEND_OLD_e41b` + real `0x0a` (18 bytes); NEW absent. Turn 2
after mutate: disk `b'T2APPEND_OLD_e41b\nT2APPEND_NEW_7c90\n'` (36 bytes, two
`0x0a`, no literal `\n`). First DeepSeek POST in turn2 gold shows
`T2APPEND_NEW_7c90` **PRESENT** in the live projection unit
(content-bytes=36, lines 1–3, sha256:`3342d23b…`). OLD also present (append,
not replace). State first tracked key still OLD snapshot; NEW reached projection
via disk re-read, not persist-38.

**No collision:** score from **CLEAN rerun gold** + `hook_trace.jsonl` only.
`artifacts/contaminated-run1/` is excluded.

## Hook table (from `artifacts/hook_trace.jsonl`)

Thinker scored the box files directly. Not `REPORT.md`.

| hook | fired | call | return_kind | return_len | n_messages | n_read_pairs | bridge_rc | notes |
|---|---|---|---|---|---|---|---|---|
| on_session_start | yes | 1 | none | — | — | — | — | session `20260823_104105_ae1250`; isolated HERMES_HOME |
| select_context | yes | 1 | **list** | 2 | 2 | 0 | 0 | turn1 pre-tool |
| select_context | yes | 2 | **list** | 5 | 4 | 1 | 0 | turn1 post completed `read_file`; OLD only in projection |
| on_turn_complete | yes | 1 | none | — | — | 1 | — | turn1 observe rc=0; stdout `{"observedCalls":1}` |
| select_context | yes | 3 | **list** | 7 | 6 | 1 | 0 | turn2 pre-tool (post-mutate) |
| select_context | yes | 4 | **list** | 9 | 8 | 2 | 0 | turn2 post completed `read_file`; NEW + OLD in projection |
| on_turn_complete | yes | 2 | none | — | — | 2 | — | turn2 observe rc=0; stdout `{"observedCalls":2}` |

## Turn1 vs turn2 projection (0053 vs 0054)

| run | turns | install | turn2 NEW in projection | state after t2 | observe |
|---|---|---|---|---|---|
| PCR 0053 (turn-1 only) | 1 | install.mjs siblings | n/a (no mutate) | `calls` + `tracked` for turn1 read | `observedCalls=1` |
| PCR 0046 (persist-38, closed) | 2 | hermes-only extract | **absent** (layout confound) | empty / persist miss | gold miss |
| PCR 0054 (this box) | 2 | install.mjs siblings (same as 0053) | **present** (content-bytes=36) | first tracked OLD snapshot; NEW via disk re-read | `observedCalls=2` |

## Two-turn gold

Gold captures preserved for Thinker scoring. Score `artifacts/gold/turn1/` and
`artifacts/gold/turn2/` only.

| artifact | shape | token / projection |
|---|---|---|
| `artifacts/gold/turn1/req_001.json` | 2 msgs | no NEW token |
| `artifacts/gold/turn1/req_002.json` | 5 msgs | `T2APPEND_OLD_e41b` only in projection unit (content-bytes=18); tool slot `[freshctx:…]` stub |
| `artifacts/gold/turn1/state-after-turn1.json` | tracked | OLD `file_size=18`; no NEW |
| `artifacts/gold/turn2/req_001.json` | first POST turn2 | **`T2APPEND_NEW_7c90` PRESENT** in live projection unit (content-bytes=36, lines 1–3, sha256:`3342d23b…`); OLD also present (append, not replace); tool slot still stub |
| `artifacts/gold/turn2/state-after-turn2.json` | tracked | first key OLD snapshot `file_size=18`; second tracked empty (offset 3 past EOF) |

**NEW in turn2 gold is a FreshCtx live projection rewrite, not persist-38
tracked update.** The first tracked key still holds the turn1 OLD snapshot.
NEW appears because the adapter re-read disk after mutate (`logs/mutate.txt`).

## Box evidence

| item | value |
|---|---|
| Install command | `node freshctx-src/adapters/hermes/install.mjs <host>/plugins` |
| Extract SHA | `516297d6` (same packaging as 0052; main `dd2f58d4`) |
| `verify-layout` | exit 0 (`layout-complete`); bun `IMPORT_OK` |
| `probe_engine` | `has_ensure=False` (main adapter, not persist-38); `has_select` / `has_turn_complete` / `has_session_start` True |
| Probe before t1 | `T2APPEND_OLD_e41b` + real `0x0a` (18 bytes); NEW absent |
| Mutate (between turns) | append `T2APPEND_NEW_7c90` + real `0x0a`; disk `b'T2APPEND_OLD_e41b\nT2APPEND_NEW_7c90\n'` (36 bytes); `logs/mutate.txt` |
| Turn1 select | list/2 then list/5; bridge rc=0; observe `observedCalls=1` |
| Turn2 select | list/7 then list/9; bridge rc=0; observe `observedCalls=2` |
| Turn2 gold projection | NEW present content-bytes=36; OLD present (append) |
| State after t2 | first tracked OLD snapshot; NEW in projection not tracked; second tracked empty |
| Restore | extras gone (prune + src absent); `freshctx` → `repos/freshctx/adapters/hermes`; host still `999703fd` |
| Model | `deepseek-chat` |
| Host | `999703fd` untouched |
| Excluded | `artifacts/contaminated-run1/` (broken request-prune.mjs redirect) |

## Honest finding

**install.mjs + disk append puts NEW in the turn-2 live projection.** Same
install path as PCR 0053; turn 2 after mutate shows `T2APPEND_NEW_7c90` in the
first DeepSeek POST projection unit alongside OLD. Observe counts 2. State first
tracked key remains the turn1 OLD snapshot — NEW reached projection via disk
re-read, not persist-38 lifecycle.

This is **not** a paper result, **not** region B, **not** n>1, and **not**
evidence that persist-38 should merge.

**PR 38 (closed, discard):** unit persist probes passed but did **not** clear
live gold on hermes-only extract. Do **not** merge any persist adapter. PCR 0045
/ 0046 remain on that closed PR only — not pending, not filed here.

## What we did

- Ran live Hermes CLI two-turn append after `install.mjs` and captured hook
  trace, turn1/turn2 gold captures, and state file from box workdir.
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
| Extract packaging (install.mjs) | `516297d6` |

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` |
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` (unused) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | no | — | docs-only PCR |
| `node adapters/hermes/install.mjs` | yes | 0 | three staged links |
| `node adapters/hermes/verify-layout.mjs` | yes | 0 | layout-complete; bun IMPORT_OK |
| `hermes chat -q` live install two-turn append | yes | 0 | box workdir; CLEAN rerun gold |
| A-append gold matrix | no | — | explicitly not re-run |

## Metric snapshot

| check | result |
|---|---|
| install.mjs sibling staging | **pass** (verify-layout rc=0) |
| bridge import on install layout | **pass** (bridge_rc=0 all select calls) |
| turn1 live projection | **OLD only** (content-bytes=18) |
| turn2 NEW in live projection | **yes** (content-bytes=36; sha256:`3342d23b…`) |
| turn2 OLD still present | **yes** (append, not replace) |
| observe after turn 2 | **yes** (rc=0; `observedCalls=2`) |
| state: NEW via disk re-read | **yes** (not persist-38 tracked update) |
| contaminated-run1 excluded | **yes** (not scored) |
| door / lock / score | unchanged |

## Comparison

- PCR 0045 / 0046 (closed PR 38, discard): persist adapter + A-append on
  hermes-only extract; live gold miss; layout confound.
- PCR 0050: hermes-only extract omits siblings; import fail; live None.
- PCR 0051: manual sibling copy; select returns list; observe ran; state
  populated.
- PCR 0052: install.mjs ships siblings; verify guard.
- PCR 0053: install.mjs live confirm turn-1 only; list/2 then list/5 +
  observe 1.
- PCR 0054 (this note): same install path; turn-2 append; NEW in turn2
  projection; observe 2; not SOTA; no persist merge.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note.

## Limitations

- Symlink install assumes a FreshCtx source checkout remains reachable.
- PR 38 closed (discard); persist adapter not mergeable. Do not claim
  persist-38 updated tracked for NEW.
- Workdir evidence is box-local; not vendored in git. contaminated-run1
  excluded from score.
- Not a paper result. Not n>1. Not region B.
- Does not reopen persist-38, A-append, door, coverage, or latency
  measurement. Region-grain live miss (0047) stays a later layer.

## Protocol gap?

**No.** Docs only. Holdout seal, door, and locks untouched.

## Next measurement

**None** required on this file-scope append hole. Do **not** reopen persist-38.
Do **not** launch coverage/latency/door. Region-grain live miss (0047) stays a
later layer. Do **not** merge any persist adapter.
