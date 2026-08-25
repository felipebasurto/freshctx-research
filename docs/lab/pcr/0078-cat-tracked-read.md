# PCR 0078 — track cat-class shell reads; modest default budget

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0078-cat-tracked-read-f532` (draft PR)
- Commit: (this commit)
- Merge-base: `fc0924e8274e29a9c627a54e77a199494ebae884` (main @ PCR 0077)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (cat tracked; do not merge)

## Hypothesis or change

Pi live trial (`docs/lab/pi-trial/REPORT.md`, n=1): when whole-file reads were
budget-omitted at 24k, the model used `bash cat`. FreshCtx only tracked official
`read`, so those bytes were invisible and stale shell bodies looked like FreshCtx
had failed.

**Primary fix:** on `tool_result`, recognize single-file workspace reads issued
via Pi/Hermes shell tools (`bash`/`shell`: `cat`, `head`, `tail`, `sed -n`, `nl`)
and route them through the same `safeWorkspaceFile` + `trackRead` path as official
reads. Cat remains last resort for refuse cases (binary, oversized,
outside-workspace, missing, ambiguous shell).

**Budget:** do not dump the world. Raise the live adapter default from **24 000**
to **32 768** chars (policy selection budget). Replay shows 20 ordinary modules +
one 64k-char file whose official read stays budget-omitted while a tracked
`head` slice is served. Whole-repo dumps still require `FRESHCTX_BUDGET_CHARS`
override; we did not raise the 512 KiB refuse cap (no real text file hit it).

Fail-open unchanged. Door/lock/score/payload unchanged.

Not a paper result. Not SOTA. Gold language-agnostic.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## What we did

- `adapters/shell-read.mjs` — pattern-match cat-class commands; shared
  `tryTrackShellRead` + Hermes `shellCallsFromMessages`.
- `adapters/pi/replay.mjs`, `adapters/pi/extension.ts` — shell hook + prune set.
- `adapters/hermes/bridge.mjs` — shell parity on observe/select.
- `adapters/request-prune.mjs` — export `DEFAULT_BUDGET_CHARS = 32_768`.
- `test/pcr-0078-cat-tracked-read.test.mjs` — 15 replay boards.
- `adapters/pi/README.md`, `docs/lab/pi-trial/run.mjs` — default/override docs.

Did **not** edit `src/anchors.mjs`, holdout gold, score weights, persist-38, or
512 KiB refuse cap.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **235 pass**, **22 skip**, **0 fail** (257 total; +15 vs 0077) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged |
| `npm run ctxbench:pi-smoke` | yes | 0 | freshness gates pass; failures `[]` |

## Metric snapshot

| metric | PCR 0077 ledger | this PCR | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| npm test pass | 220/220 runnable | 235/235 runnable | +15 tests |
| live default budget (chars) | 24 000 | 32 768 | +8 768 |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `79e29d09…` | `79e29d09…` | 0 |
| 512 KiB refuse cap | 512 KiB | 512 KiB | 0 (not raised) |

## Default budget (replay-derived)

| | chars | note |
|---|---|---|
| old default | 24 000 | viajante n=1: five whole-file reads → 2 selected / 3 budget-omitted → model `bash cat` (pre-0078 untracked) |
| new default | 32 768 | large-workspace board: 20×30-line modules + 64k file; whole-file read omitted, tracked `head` slice served |
| not chosen | 200 000 | pi-trial override; not used as default |

Large files are served as **read slices** (region units from `head`/`tail`/`sed
-n`) within working-set budget, not by inflating default to fit every whole file.

## Large-workspace byte table (synthetic board)

20 small modules (~870 chars each) + one 64k-char `src/large.ts`. Turn 1: official
`read` of large file (budget-omitted) + `bash head -n 120` (tracked region served).
Measured at `@ DEFAULT_BUDGET_CHARS` (32 768); identical at 24 000 on this board.

| board | projection bytes | notes |
|---|---|---|
| turn 1 — first inject | 26 593 | 21 selected (20 small + head region); 1 budget-omitted (large file-scope); no `TAIL_ONLY` leak |
| turn 2 — disk unchanged | 5 036 | 0077 `unchanged="true"` skip |
| turn 2 — head line edit | 8 893 | `LARGE_NEW` in live projection; stale 64k shell body not provider copy |

## Cat vs official-read replay table

| board | tool path | tracked? | turn-2 after disk edit |
|---|---|---|---|
| probe file | official `read` | yes | NEW in projection (0073/0076/0077 guard) |
| probe file | `bash cat` | yes | NEW in projection; stale cat body not live copy |
| outside path | `bash cat` | no | fail-open / ordinary shell |
| binary | `bash cat` | no | last-resort shell |
| >512 KiB | `bash cat` | no | last-resort shell (cap not raised) |
| empty registry | n/a | n/a | fail-open (`undefined`) |

## Limitations

- Shell parser is conservative: no pipes, subshells, multi-file `cat`, or
  command execution. Unrecognized shell stays last-resort.
- Full-file `bash cat` of a large text file under budget is tracked but may remain
  budget-omitted in projection; models should prefer official `read` or slice
  commands (`head`/`sed -n`) for huge files.
- Hermes shell parity wired in bridge; no live Hermes shell bypass trial in this PCR.
- Default 32 768 does not fit five viajante-scale whole-file reads (~100k chars);
  that path still needs override or slice reads — cat tracking closes the stale
  bypass, not unlimited whole-file inject.
- Pi restart clears in-process maps (0076/0077 honesty unchanged).

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter-only. Door, locks, ctxbench payload, and score untouched.

## Next measurement

Live Pi replay at default 32 768 (no override): five-file viajante battery with
cat-class tracking enabled; confirm model stays on FreshCtx path when whole-file
reads omit.
