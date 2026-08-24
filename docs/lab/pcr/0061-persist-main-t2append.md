# PCR 0061 — Product main holds two-turn append (no persist-38)

- Date (UTC): 2026-08-24
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0061-persist-main-t2append-5bf3` (draft PR)
- Commit: (this docs commit)
- Merge-base: `3bcbfb5b89fdb25645d27c6a2eaed2ae1202451e` (main; PCR 0057 after 0059 docs)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `pack-install`; `t2-append`; `measurement`
- Decision: **review** (measurement lock + regression test; no product change; no persist-38)

## Hypothesis or change

PCR 0054 measured turn-2 append on an older main extract (`516297d6`). Closed PR 38
(persist-38) proposed `_ensure_state_file` + `artifacts/freshctx-state` helpers that
product main never shipped. The open question on **current main**
(`3bcbfb5b89fdb25645d27c6a2eaed2ae1202451e`) was whether the two-turn append cell
still holds without persist-38 overlay code.

**Finding (live-confirmed 2026-08-24, independently re-scored from gold files):**

Product main **holds**. Request-only lifecycle (`on_session_start` +
`select_context` + `on_turn_complete`) re-reads disk on the next projection. A
38 overlay is **not** required. Do **not** revive or merge persist-38.

Not a paper result. Not SOTA. Not holdout.

## Scored cell (language-agnostic)

| field | value |
|---|---|
| Cell | `t2append-main-hold` — same session, two turns |
| Extract SHA | `3bcbfb5b89fdb25645d27c6a2eaed2ae1202451e` |
| Install | real `adapters/hermes/install.mjs` (no PR 38 overlay) |
| Hermes adapter `__init__.py` blob | `0a6e1711478217943e331173af2eea20fc91a2c5` (not persist-38 `10bd19e6`) |
| persist-38 helpers | **absent** — no `_ensure_state_file`; no `artifacts/freshctx-state` path |
| State root | `HERMES_HOME/freshctx/{session-key}.json` via `on_session_start` |
| Probe before turn 1 | first line `T2APPEND_OLD_a3f1` + real newline (`0x0a`); **18 bytes**; one `0x0a`; no literal backslash-n |
| Mutate (between turns) | append `T2APPEND_NEW_c91e` + real newline; disk **36 bytes**; two `0x0a` |
| Turn-2 first model POST | **NEW present** in live whole-file projection unit (`content-bytes=36`, lines 1–3); OLD also present (append, not replace); tool slot stub |

### Byte invariant (exact)

| phase | first line | last line | span | content-bytes | newlines |
|---|---|---|---|---|---|
| turn 1 observe | `T2APPEND_OLD_a3f1` | (empty line 2) | lines 1–2 | 18 | 1 × `0x0a` |
| after mutate | `T2APPEND_OLD_a3f1` | `T2APPEND_NEW_c91e` | lines 1–3 | 36 | 2 × `0x0a` |
| turn 2 projection | `T2APPEND_OLD_a3f1` | `T2APPEND_NEW_c91e` | lines 1–3 | 36 | whole-file resolution |

Location: tracked whole-file read of probe path under workspace `ws/`. No Go parser.
No treesitter. Gold scored on first/last lines, span, location, exact bytes only.

## Mechanism (product main, not persist-38)

1. **`on_session_start`** allocates state file under `HERMES_HOME/freshctx/`.
2. **Turn 1 `on_turn_complete`** observes completed `read_file`; tracked content
   is the turn-1 tool payload (OLD bytes only).
3. **Between turns** the workspace file grows on disk (append NEW line).
4. **Turn 2 `select_context`** merges tracked calls, runs `engine.refresh()` against
   current workspace bytes, and projects the **live whole-file** unit. NEW appears
   because refresh reads disk — not because persist-38 updated tracked snapshots.

State after turn 2 may still record turn-1 OLD snapshot in tracked metadata; NEW
reaches the provider projection via disk re-read. That matches PCR 0054 semantics
on the request-only adapter.

## What we did

- Added `docs/lab/pcr/0061-persist-main-t2append.md` locking the invariant above.
- Added `test/pcr-0061-persist-main-t2append.test.mjs`: Hermes replay two-turn
  synthetic board using product-main lifecycle (`observeTurn` + `selectContext`);
  asserts turn-2 projection contains appended last line at `content-bytes=36`.
- Updated `docs/lab/INDEX.md` and `docs/lab/METRICS.md` for PCR 0061 only.
- Did **not** edit `src/anchors.mjs` (frozen door), adapter bridge logic, or add
  persist-38 code. Did **not** change benchmark fixtures, gold labels, or score
  weights.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| Hermes `__init__.py` (main) | `0a6e1711478217943e331173af2eea20fc91a2c5` |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 133 pass, 22 skip (repo fetch) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165`; ctxbench payload sha unchanged |
| live Hermes t2-append reconfirm | yes (pre-merged) | 0 | gold re-scored 2026-08-24 on extract `3bcbfb5` |

## Metric snapshot

| check | result |
|---|---|
| two-turn append on product main | **hold** |
| NEW in turn-2 whole-file projection | **yes** (`content-bytes=36`) |
| persist-38 `_ensure_state_file` | **absent** on main |
| PR 38 overlay required | **no** |
| door / repos.lock blob | unchanged |
| `AUTORESEARCH_SCORE` | 89.107165 (not tuned) |

## Comparison

- PCR 0045 / 0046 (closed PR 38): persist adapter + hermes-only extract; live gold
  miss; layout confound. **Do not merge.**
- PCR 0054: install.mjs t2-append hold on older extract; same request-only disk
  re-read mechanism.
- PCR 0061 (this note): **locks hold on current main** (`3bcbfb5`); confirms
  persist is not missing for this cell; regression test added.

## Conflicts with constitutions

none observed. Gold remains language-agnostic (lines, span, exact bytes).

## Limitations

- Live gold workdir evidence is box-local; not vendored in git.
- Synthetic replay validates adapter lifecycle, not full Hermes CLI wiring in CI.
- Does not claim persist-38 tracked-update semantics; only that main already
  projects appended bytes on the next turn.
- Not n>1. Not region B. Not a paper result.

## Protocol gap?

**No.** Holdout seal, door blob, and locks untouched.

## Next measurement

**None** on this file-scope append hole. **Hold on main; no persist-38; do not
merge PR 38.** Region-grain live miss (0047) stays a later layer.
