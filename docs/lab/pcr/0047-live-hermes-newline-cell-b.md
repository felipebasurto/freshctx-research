# PCR 0047 — live Hermes newline-fixed cell B rerun

- Date (UTC): 2026-08-22
- Author / agent: UltraCtxt Thinker (box session; documented after the run)
- Branch / PR: `cursor/pcr-0047-live-hermes-newline-cell-b-2331` (new draft PR)
- Commit: (this docs commit)
- Merge-base: `620d7257dc35e8e7364bf641d2d3bd4b4c209928` (main; PCR 0043–0044 docs)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `newline-fixed`; `region-miss`
- Decision: **review** (documentation only; no product change)

## Hypothesis or change

PCR 0041 recorded the first live DeepSeek session on Hermes Agent with a
scripted driver. Cell B in that pack is **not** a clean region test: the
driver wrote literal two-character `\\n` into a one-line file and then
asked for `startLine=2`. See [0041](0041-live-deepseek-hermes-session.md) and
[METHODS.md](../live-2026-08-22/METHODS.md).

This PCR re-runs **only** the B / B2 interior pair on the same mutation
board after fixing the driver to write real `0x0a` newlines. Workdir on the
research box: `/workspace/freshctx-live-2026-08-22-b/` (not in git).

**Finding (lab note, not a paper claim):** with honest newlines, cell B is a
**real region miss** on hermes-fresh (`BETA_OLD_INTERIOR` in turn-2 request;
`BETA_NEW_INTERIOR` absent). B2 (whole-file read on the same disk mutation)
remains current. Do **not** cite PCR 0041 cell B as the last word on
region-grain behavior.

Other cells (A/C/D/E/G) ran on the same board for continuity; this PCR
documents B vs B2 only. Do not treat them as a leftover coverage or latency
board.

**Not a paper result. Not SOTA.**

## What we did

- FreshCtx product `4ccb008385e223c0e67eb95080d5398dc3f8cc5e`; main docs at
  `620d7257`. Hermes Agent host `999703fd`; DeepSeek `deepseek-v4-flash`
  (default). Isolated venv and `hermes-home/config.yaml`.
- Scripted driver with real LF bytes on disk (not literal `\\n`).
- Official score = **token-in-request** on turn-2 request JSON
  (`json.dumps(request)` length). Language-agnostic gold (marker tokens in
  request, not model FRESH/STALE prose).
- Ran B-interior and B2-file-scope-interior × hermes-fresh / hermes-native.
- Did **not** edit `src/`, door, holdout traces, `bench/repos.lock.json`,
  `bench/hosts.lock.json`, adapters, or tests on this branch. Door stays
  `f8771c93894095348185ef3453a3c2498355b3c6`. `repos.lock` blob stays
  `79e29d09a9ec12b1128617f683f50a35a3c8809e`. `AUTORESEARCH_SCORE` stays
  89.107165. `resultSetHash` stays null.

### Newline proof

Box artifact `artifacts/newline_proof_region_b_before_mutation.json` (not in
git):

| field | value |
|---|---|
| path | `ws/region_b.txt` |
| bytes | 66 |
| `count_0x0a` | 3 |
| `literal_backslash_n` | 0 |
| `n_lines_splitlines` | 3 |
| line 2 | `BETA_OLD_INTERIOR keep this line unique` |

This is a real-LF three-line file. Cell B is no longer a driver-newline
confound.

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` |
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` (unused in this note) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | no | — | docs-only PCR |
| live driver B / B2 cells | yes | 0 | newline-fixed; 4 DeepSeek HTTP 200s |
| DeepSeek ping | yes | 200 | same session board |

## Metric snapshot

Official score is **token-in-request** on turn-2 request JSON, not the
model's FRESH/STALE sentence. Source:
`/workspace/freshctx-live-2026-08-22-b/artifacts/timings/cells.json`.

| cell | mode | stale-bytes | current-present | current tokens | old tokens | request bytes | projection bytes | model HTTP ms | DeepSeek model | error |
|---|---|---|---|---|---|---|---|---|---|---|
| B-interior | hermes-fresh | yes | no | (none) | BETA_OLD_INTERIOR | 806 | 389 | 2069 | deepseek-v4-flash | no |
| B-interior | hermes-native | yes | no | (none) | BETA_OLD_INTERIOR | 655 | 275 | 1617 | deepseek-v4-flash | no |
| B2-file-scope-interior | hermes-fresh | no | yes | BETA_NEW_INTERIOR | (none) | 1101 | 758 | 1564 | deepseek-v4-flash | no |
| B2-file-scope-interior | hermes-native | yes | no | (none) | BETA_OLD_INTERIOR | 563 | 275 | 1600 | deepseek-v4-flash | no |

### Findings

1. **After real newlines, B-interior hermes-fresh is a real region miss.**
   Stale `BETA_OLD_INTERIOR` in request; `BETA_NEW_INTERIOR` on disk but
   absent from request. This is distinct from PCR 0041, where the invalid
   one-line / literal-`\\n` file confounded the region call.

2. **B2 (same mutation, whole-file read) still works.** hermes-fresh carried
   `BETA_NEW_INTERIOR` in the turn-2 request. File-scope projection on the
   identical disk edit succeeds where region-scoped interior does not.

3. **hermes-native** held stale tool-result bytes on both cells (expected).

4. **Do not cite PCR 0041 cell B** as evidence of region-grain product
   behavior. That run had a driver-newline confound; this note supersedes
   only the B confound interpretation, not the broader 0041 file-scope
   findings (A, D, E, G, B2).

## Comparison

- PCR 0041: full 15-cell Hermes live matrix; cell B confounded (literal
  `\\n`). File-scope fresh on A, D, E, G, B2.
- PCR 0043: Pi official-hook CLI with real newlines; B-interior pi-fresh was
  fresh via file-scope fallback (different host, different read semantics).
- PCR 0044: post-ctor-fix Hermes ctor re-run; lifecycle gold miss on
  A-append (unrelated to this B rerun).
- PCR 0045 / 0046: reserved on draft PR 38 (persist adapter, CLI hook miss).
  **Not filed here.**
- Holdout bake-off remains PCR 0038–0040. Not SOTA. Not a paper result.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note.

## Limitations

- n=1, synthetic markers, scripted turn sequence (not interactive Hermes chat).
- Full turn-2 request JSON not archived in git (table + box-local evidence).
- Box workdir `/workspace/freshctx-live-2026-08-22-b/` not in git.
- Only B / B2 cells published here; other board cells not tabulated.
- Model FRESH/STALE prose is not the score.
- Region miss on B does not imply holdout regression; live host ≠ sealed replay.

## Protocol gap?

**No.** Docs only. Holdout seal, door, and locks untouched.

## Next measurement

After region-scoped adapter or projector work (if any): repeat B-interior
with the same newline proof artifact and confirm `BETA_NEW_INTERIOR` appears
in turn-2 request. Compare hermes-fresh vs pi-cli on the same cell with an
explicit label column and honest `scope:region` read args.
