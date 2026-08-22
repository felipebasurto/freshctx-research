# PCR 0050 — Hermes bridge extract import failure (live CLI None)

- Date (UTC): 2026-08-23
- Author / agent: Cloud Agent (box bridge import probe)
- Branch / PR: `cursor/pcr-0050-hermes-bridge-extract-import-536c` (new draft PR)
- Commit: (this docs commit)
- Merge-base: `25aae6cf3b846af5d7dec90f02b4fa6a2560ba4c` (main; PCR 0049 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `failing-probe`; `extract-layout`
- Decision: **review** (documentation + layout probe; no product change)

## Hypothesis or change

PCR 0049 traced live Hermes CLI hooks and confirmed Hermes **fires** `select_context`
with a completed read pair, but the adapter returns `None` and state stays empty.
The remaining hole named there was **why** the bridge subprocess fails.

This PCR runs the **next measurement** PCR 0049 prescribed: diagnose bridge
subprocess exit / import / layout. Live one-shot and persist2 plugin runs used a
`git archive` of **only** `adapters/hermes` from plugin source `832713a`. The
extracted `bridge.mjs` retains top-level ESM imports on sibling paths that the
archive omits:

- `../request-prune.mjs`
- `../../src/index.mjs`

Those files are missing next to the extract. Not a paper result.

Workdir (not in git): `/workspace/freshctx-live-2026-08-23-cli-noneprobe/`
(`REPORT.md`, `logs/probe_select.json`, `logs/raw_bridge_control.json`).

## Bridge probe table (from box logs)

Thinker scored the box files directly. Not `REPORT.md`.

| probe | layout | runtime | rc | stdout | stderr / error | elapsed | bridge result |
|---|---|---|---|---|---|---|---|
| live call 1 | hermes-only extract `832713a` | bun | 1 | empty | `Cannot find module '../request-prune.mjs'` | ~0.015–0.091 s | `_call_bridge` → None; `select_context` → None |
| live call 2 (req_002) | hermes-only extract `832713a` | bun | 1 | empty | same import fail | ~0.015–0.091 s | `_call_bridge` → None; `select_context` → None |
| live call 1 | hermes-only extract `832713a` | node | 1 | empty | `ERR_MODULE_NOT_FOUND` … `/plugin/request-prune.mjs` | ~0.015–0.091 s | same |
| live call 2 (req_002) | hermes-only extract `832713a` | node | 1 | empty | same | ~0.015–0.091 s | same |
| control (req_002) | in-tree `adapters/hermes` (siblings present) | node | 0 | JSON | — | — | `messages` list of 5 dicts; `applied=true`; `selected=1` |

**req_002 context:** Hermes `api_messages` with one completed `read_file` pair
(`discoveredCalls=1`). Live call 1 (0 pairs) also returned None — same import
fail, so message shape is not the differentiator.

**Ruled out for this box run:** timeout, `state_file` None, session-id mismatch,
message shape as sole cause.

## Box evidence

| item | value |
|---|---|
| Plugin extract | `git archive` of **only** `adapters/hermes` @ `832713a` |
| Missing siblings | `adapters/request-prune.mjs`, `src/index.mjs` |
| Bridge failure mode | ESM import resolution; rc=1; stdout empty; sub-100 ms (not timeout) |
| Live `select_context` | returns None (both calls) |
| Live `observe` | never ran (`calls` / `tracked` empty) |
| Control | identical `bridge.mjs` bytes in-tree + req_002 → rc=0, rewrite applied |
| Model | `deepseek-chat` |
| Host | `999703fd` untouched |

## Honest finding

**The live `None` is an incomplete plugin extract / install layout, not a host
skip and not a persist-algorithm miss.**

In-tree layout works. Isolated hermes-only extract fails at import time before
bridge logic runs. This closes PCR 0049’s “why bridge returns None” hole for the
measured box path: subprocess never reached `discoveredCalls()` or observe.

**PR 38 (closed, discard):** unit persist probes passed but did **not** clear
live gold. Do **not** merge any persist adapter. PCR 0045 / 0046 remain on
that closed PR only — not pending, not filed here.

## What we did

- Ran live Hermes CLI one-shot with persist2 extract `832713a` (hermes-only
  archive) and captured bridge subprocess probes + control replay.
- Added invariant probe `test/hermes-bridge-extract-layout.test.mjs`: hermes-only
  layout fails import; in-tree layout succeeds.
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
| Plugin source (extract probe only; not in this PR) | `832713a` |

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` |
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` (unused) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | +1 layout probe; no metric delta |
| `hermes chat -q` live bridge probe | yes | 0 | box workdir; import fail on extract |
| in-tree bridge control (req_002) | yes | 0 | rc=0; applied=true |
| A-append gold matrix | no | — | explicitly not re-run |

## Metric snapshot

| check | result |
|---|---|
| bridge import on hermes-only extract | **fail** (rc=1; MODULE_NOT_FOUND) |
| bridge import in-tree | **pass** (rc=0) |
| live `select_context` rewrite | **no** (subprocess never started) |
| state populated after read | **no** (`observe` never ran) |
| skip class (0048/0049) | **fail-open delivery** — root cause here: import/layout |
| class 1 (never calls) | **ruled out** (0049) |
| door / lock / score | unchanged |

## Comparison

- PCR 0045 / 0046 (closed PR 38, discard): persist adapter + A-append; live
  gold miss despite unit persist pass.
- PCR 0049: live hook trace; Hermes fires hooks; adapter None; asked for bridge
  subprocess diagnosis.
- PCR 0050 (this note): hermes-only extract omits sibling imports; live None
  explained; in-tree control passes; not SOTA.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note.

## Limitations

- Does not fix plugin packaging / install layout for Hermes.
- PR 38 closed (discard); persist adapter not mergeable.
- No A-append re-run. Workdir evidence is box-local; not vendored in git.
- Probe test simulates extract layout; does not re-run live Hermes CLI in CI.

## Protocol gap?

**No.** Docs + layout probe only. Holdout seal, door, and locks untouched.

## Next measurement

Fix plugin extract / install layout so `bridge.mjs` siblings (`request-prune.mjs`,
core `src/index.mjs` or bundled equivalent) ship with the Hermes plugin. Re-run
live one-shot hook trace **after** layout fix. Do **not** merge any persist
adapter. Do **not** re-run the A-append gold matrix.
