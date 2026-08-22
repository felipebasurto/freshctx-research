# PCR 0053 — Live Hermes install.mjs one-shot (CLI list + observe)

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent (box install.mjs one-shot probe)
- Branch / PR: `cursor/pcr-0053-live-hermes-install-oneshot-25c6` (new draft PR)
- Commit: (this docs commit)
- Merge-base: `0a4e382919eb78464c4bc6f87ce61c78b134b1db` (main; PCR 0052 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `pack-install`
- Decision: **review** (documentation only; no product change; 0052 already shipped install.mjs; this is the live confirm)

## Hypothesis or change

PCR 0052 shipped `adapters/hermes/install.mjs` and `verify-layout.mjs` so Hermes
plugin installs symlink siblings by default (`freshctx/`, `request-prune.mjs`,
`src/`). PCR 0051 confirmed layout-complete behavior with **manual sibling
copy**; the open question was whether the **install script** reproduces the same
live CLI path without hand-staging.

This PCR runs the **live confirm** PCR 0052 prescribed: one-shot `hermes chat -q`
+ one `read_file` after `node freshctx-src/adapters/hermes/install.mjs
<host>/plugins`. Not a paper result. Not an A-append gold claim. No persist
merge from PR 38.

Workdir (not in git): `/workspace/freshctx-live-2026-08-23-cli-packinstall/`
(`artifacts/gold/*`, state file). Thinker scored the box files directly; not
`REPORT.md`. No collision-resume folder.

Session: `20260822_233121_df5bc0` (`packinstall-oneshot`).

## Scored cell

Thinker scores the **box files directly**; not `REPORT.md`.

| field | value |
|---|---|
| Scored cell | `packinstall-oneshot` **first turn** |
| Session | `20260822_233121_df5bc0` |
| Install | `node freshctx-src/adapters/hermes/install.mjs <host>/plugins` (not manual sibling copy) |
| `hook_trace.jsonl` | select **list/2** then **list/5** (`n_read` 0 then 1); bridge rc=0 |
| `on_turn_complete` | **yes** (observe rc=0) |
| State file | `1c38f4f079e05b733c93.json` — `calls` + `tracked` (`HOOK_PROBE_OK`); not `{}` |

## Named why

PCR 0052's install script stages the same sibling layout PCR 0051 proved with
manual copy. This box confirms end-to-end: `verify-layout` exit 0
(`layout-complete`); bun `IMPORT_OK`; bridge rc=0 on both `select_context`
calls. Call 1 (pre-tool, 0 read pairs) returns a **list** of length 2. Call 2
(post-`read_file`, 1 read pair) returns a **list** of length 5 with FreshCtx
projection (not only raw Hermes tool payload). `on_turn_complete` observe rc=0;
`{"observedCalls":1}`. State file populated with `calls` + `tracked` for
`read_file` of `ws/hook_probe.txt` containing `HOOK_PROBE_OK` — not empty `{}`.

**No collision:** this workdir has no `artifacts/collision-resume/` folder.
Score from **gold captures** + `hook_trace.jsonl` only.

## Hook table (from `artifacts/hook_trace.jsonl`)

Thinker scored the box files directly. Not `REPORT.md`.

| hook | fired | call | return_kind | return_len | n_messages | n_read_pairs | bridge_rc | notes |
|---|---|---|---|---|---|---|---|---|
| on_session_start | yes | 1 | none | — | — | — | — | session `20260822_233121_df5bc0`; created state file |
| select_context | yes | 1 | **list** | 2 | 2 | 0 | 0 | pre-tool; bridge loaded (no MODULE_NOT_FOUND) |
| select_context | yes | 2 | **list** | 5 | 4 | 1 | 0 | post completed `read_file`; FreshCtx rewrite |
| on_turn_complete | yes | 1 | none | — | — | 1 | — | observe rc=0; stdout `{"observedCalls":1}` |

## select list vs None (0050 vs 0053)

| run | plugin layout | select call 1 | select call 2 | observe | state |
|---|---|---|---|---|---|
| PCR 0050 / hooktrace (hermes-only extract) | adapters/hermes only; missing siblings | **None** | **None** | never ran | `{}` |
| PCR 0053 (this box) | install.mjs staged siblings | **list** (len 2) | **list** (len 5) | rc=0 `observedCalls=1` | `calls` + `tracked` populated |

## First-chat gold

Gold captures preserved for Thinker scoring.

| artifact | shape | token / projection |
|---|---|---|
| `artifacts/gold/req_001.json` | 2 msgs | no `HOOK_PROBE_OK` token |
| `artifacts/gold/req_002.json` | 5 msgs | `HOOK_PROBE_OK` present via **FreshCtx rewrite** (not raw Hermes read payload); see below |
| `artifacts/gold/state-after-turn1.json` | tracked | same `calls` / `tracked` shape as live state file |

**`HOOK_PROBE_OK` in gold `req_002` is a FreshCtx rewrite, not the raw Hermes
read.** The tool slot reads `[freshctx:fc_…] Current content is supplied in the
live projection.` The token appears in the **extra projection user message**.
The raw `read_file` payload lives in state `tracked`, not in the rewritten tool
slot.

## Box evidence

| item | value |
|---|---|
| Install command | `node freshctx-src/adapters/hermes/install.mjs <host>/plugins` |
| Staged links (`logs/staged-links.txt`) | `context_engine/freshctx` → extract `adapters/hermes`; `context_engine/request-prune.mjs` → extract `request-prune.mjs`; `plugins/src` → extract `src` |
| `verify-layout` | exit 0 (`layout-complete`); bun `IMPORT_OK` |
| Extract SHA | `516297d6` (same packaging as squash `0a4e3829`) |
| `probe_engine` | `has_ensure=False` (main adapter, not persist-38); `has_select` / `has_turn_complete` / `has_session_start` True; zero-arg ctor ok |
| Live `select_context` call 1 | return_kind=list; return_len=2; bridge_rc=0 |
| Live `select_context` call 2 | return_kind=list; return_len=5; n_read=1; bridge_rc=0 |
| Live `on_turn_complete` | observe rc=0; stdout `{"observedCalls":1}` |
| State file | `1c38f4f079e05b733c93.json` — **`calls` + `tracked` populated** for `read_file` of `ws/hook_probe.txt` (`HOOK_PROBE_OK`); not `{}` |
| Probe file | `HOOK_PROBE_OK` + real `0x0a` (14 bytes) |
| Restore | extras gone (prune + src absent); `freshctx` → `repos/freshctx/adapters/hermes`; host still `999703fd` |
| Model | `deepseek-chat` |
| Host | `999703fd` untouched |

## Honest finding

**install.mjs closes the packaging hole live.** With siblings staged by the
install script (not manual copy), the bridge runs, live `select_context`
returns a **list** (not `None`), observe runs, and state populates after a
completed read pair. Same hook/gold shape as PCR 0051; this cell used
`install.mjs`.

This is **not** a paper result, **not** an A-append gold claim, and **not**
evidence that a persist adapter should merge.

**PR 38 (closed, discard):** unit persist probes passed but did **not** clear
live gold. Do **not** merge any persist adapter. PCR 0045 / 0046 remain on
that closed PR only — not pending, not filed here.

## What we did

- Ran live Hermes CLI one-shot after `install.mjs` and captured hook trace,
  gold captures, and state file from box workdir.
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
| Extract packaging (install.mjs) | `516297d6` (squash `0a4e3829`) |

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
| `hermes chat -q` live install one-shot | yes | 0 | box workdir; list + observe |
| A-append gold matrix | no | — | explicitly not re-run |

## Metric snapshot

| check | result |
|---|---|
| install.mjs sibling staging | **pass** (three links; verify-layout rc=0) |
| bridge import on install layout | **pass** (no MODULE_NOT_FOUND; bridge_rc=0) |
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
- PCR 0051: manual sibling copy; select returns list; observe ran; state
  populated; packaging still manual.
- PCR 0052: install.mjs ships siblings; verify guard; no live re-run in that
  PCR.
- PCR 0053 (this note): install.mjs live confirm; same list/2 then list/5 +
  observe 1 + projection; not SOTA; no persist merge.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note.

## Limitations

- Symlink install assumes a FreshCtx source checkout remains reachable.
- PR 38 closed (discard); persist adapter not mergeable.
- No A-append re-run. Workdir evidence is box-local; not vendored in git.
- Does not reopen persist-38, A-append, door, coverage, or latency measurement.

## Protocol gap?

**No.** Docs only. Holdout seal, door, and locks untouched.

## Next measurement

**None** on this CLI-hook/packaging hole. Do **not** reopen persist-38,
A-append, door, coverage, or latency. Do **not** merge any persist adapter.
Do **not** re-run the A-append gold matrix.
