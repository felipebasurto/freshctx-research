# PCR 0043 — live Pi official-hook CLI (`pi-cli`)

- Date (UTC): 2026-08-22
- Author / agent: UltraCtxt Thinker (box session; documented after the run)
- Branch / PR: `cursor/pcr-0042-0043-live-sessions-9a84`
- Commit: (this docs commit)
- Merge-base: `4ccb008385e223c0e67eb95080d5398dc3f8cc5e` (PCR 0040 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `pi-fresh`; `pi-cli`
- Decision: **review** (documentation only; no product change)

## Hypothesis or change

After PCR 0041 (Hermes live) and the separate **pi-adapter-replay** pass (replay
harness + `REPORT.md` on the research box), this PCR records the **official Pi
CLI hook** path: `pi -e adapters/pi/extension.ts`, one RPC process per cell,
real DeepSeek on turn 2.

Label: **`pi-cli`** (distinct from **`pi-adapter-replay`**). Same mutation board
as the Hermes live session, but through Pi's published extension seam with real
`0x0a` newlines (not literal `\\n`).

**Not a paper result. Not SOTA.**

## What we did

- Workdir on research box: `/workspace/freshctx-live-2026-08-22-pi/` (not in
  git; evidence summarized here).
- Pins: FreshCtx `4ccb008385e223c0e67eb95080d5398dc3f8cc5e`, Pi host
  `c49906ec77788625aacbdc53ebca6fbe65bd20f5`, isolated Node v22.23.2, isolated
  `@earendil-works/pi-coding-agent` 0.84.2.
- Official hook: `pi -e adapters/pi/extension.ts`. Isolated `HOME`. Real
  newline bytes on disk.
- Score = token-in-request on the first turn-2 DeepSeek POST
  (`json.dumps(request)` length). Capture stub unused.
- Eight cells × two modes (`pi-fresh`, `pi-native`). Turn 2 never re-read.
- Did **not** edit `src/`, door, holdout traces, `bench/repos.lock.json`, or
  adapters. Door stays `f8771c93894095348185ef3453a3c2498355b3c6`.
  `repos.lock` blob stays `79e29d09…`. `AUTORESEARCH_SCORE` stays 89.107165.
  `resultSetHash` stays null.

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` |
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` (unused tonight) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | no | — | docs-only PCR |
| `pi -e adapters/pi/extension.ts` × 16 cells | yes | 0 | official hook; RPC one process per cell |
| DeepSeek turn-2 POST | yes | 200 | all cells; `deepseek-v4-flash` |

## Metric snapshot

Official score is **token-in-request** on turn-2 request JSON. Transform ms was
not instrumented on the Pi CLI path (`n/a` below).

| cell | mode | stale-bytes | current-present | request bytes | projection bytes | transform ms | model HTTP ms | DeepSeek model | error |
|---|---|---|---|---|---|---|---|---|---|
| A-append | pi-fresh | no | yes | 4005 | 583 | n/a | 1278 | deepseek-v4-flash | no |
| A-append | pi-native | yes | no | 3374 | 0 | n/a | 1327 | deepseek-v4-flash | no |
| B-interior | pi-fresh | no | yes | 3997 | 547 | n/a | 1669 | deepseek-v4-flash | no |
| B-interior | pi-native | yes | no | 3492 | 0 | n/a | 1748 | deepseek-v4-flash | no |
| B2-file-scope | pi-fresh | no | yes | 3964 | 547 | n/a | 1270 | deepseek-v4-flash | no |
| B2-file-scope | pi-native | yes | no | 3405 | 0 | n/a | 1249 | deepseek-v4-flash | no |
| C-delete | pi-fresh | no | yes | 3555 | 178 | n/a | 1483 | deepseek-v4-flash | no |
| C-delete | pi-native | yes | yes | 3354 | 0 | n/a | 1310 | deepseek-v4-flash | no |

### Findings

1. **Official hook, RPC one process per cell, turn 2 never re-read.** Each cell
   started a fresh Pi process; no cross-cell session reuse.

2. **B-interior pi-fresh was fresh** (not a miss). Pi's built-in read used
   `offset=2` / `limit=1` but carried **no** `scope:region`, so the adapter
   file-scoped the projection. This **differs** from the earlier
   **pi-adapter-replay** B miss (replay path without live read semantics). Do
   **not** claim region-scope success on B; file-scope fallback explains the
   fresh result.

3. **C-delete pi-fresh dropped `GAMMA`** while the engine stayed alive across
   `unlink` (empty envelope in request). Replay C **fail-opened** (stale bytes
   remained). Same pattern as PCR 0041 Hermes delete cell.

4. **pi-native** held stale tool-result bytes on every cell where mutation
   occurred; projection bytes 0 on all native rows (no FreshCtx projection).

5. **CLI vs replay:** this note is **`pi-cli`**. The box-local
   **pi-adapter-replay** `REPORT.md` is a separate label; do not merge tables
   without the label column.

## Comparison

- PCR 0003 / holdout replay: Node replay harness, not live Pi package.
- PCR 0041: Hermes live session on the same mutation names (different host).
- pi-adapter-replay (box only): replay harness live run; B-interior miss there,
  fresh here — read-tool semantics differ.
- Holdout bake-off: PCR 0038–0040. Not comparable as SOTA.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note.

## Limitations

- n=1, synthetic markers, scripted turn sequence (not interactive Pi chat).
- Full request JSON not archived in git (table + box-local evidence only).
- Transform ms not measured on CLI path.
- B-interior fresh result is file-scope, not region-grain; do not cite as
  region-scope product behavior.
- Model FRESH/STALE prose is not the score.

## Protocol gap?

**No.** Docs only. Holdout seal, door, and locks untouched.

## Next measurement

Region-scoped live cell only after Pi read args carry `scope:region` with real
newlines and offset/limit that address a multi-line file honestly. Compare
pi-cli vs pi-adapter-replay on the same cell with explicit label column.
