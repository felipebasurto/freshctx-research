# PCR 0044 — live Hermes ctor re-run (gold miss)

- Date (UTC): 2026-08-22
- Author / agent: UltraCtxt Thinker (box session; documented after the run)
- Branch / PR: `cursor/pcr-0042-0043-live-sessions-9a84` (PR 37)
- Commit: (this docs commit)
- Merge-base: `4ccb008385e223c0e67eb95080d5398dc3f8cc5e` (PCR 0040 squash)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `live-host`; `hermes-fresh`; `live-ctor`; `post-ctor-fix`; `pre-lifecycle-fix`
- Decision: **review** (documentation only; no product change)

## Hypothesis or change

PCR 0041 recorded the first live DeepSeek session on Hermes Agent with a
scripted driver. This PCR re-runs one cell after confirming the Hermes plugin
**constructor** (`FreshCtxContextEngine()`) succeeds — a separate check from
whether gold bytes reach the turn-2 request.

**Phase label:** **post-ctor-fix / pre-lifecycle-fix**. The box run extracted
the PR 36 Hermes plugin from FreshCtx commit `f2048257` (PCR 0042 on PR 36:
zero-arg engine). Ctor **yes** because that plugin is installed; gold **no**
because lifecycle/observe wiring still did not persist state.

**Finding (lab note, not a paper claim):** ctor **yes**, gold **no**. The engine
instantiated (zero-arg `FreshCtxContextEngine`). Turn-2 request contained only
`ALPHA_OLD_MARKER_7f3a`; `ALPHA_NEW_MARKER_9c2b` was on disk but **not** in the
request. `freshctx-state` was empty. This is a lifecycle / observe-path gap,
not a door or projector regression.

A lifecycle follow-up is in flight. **This docs PR does not implement that fix.**

## What we did

- FreshCtx core `4ccb0083`; Hermes Agent host `999703fd`; DeepSeek
  `deepseek-v4-flash`. Isolated venv and `hermes-home/config.yaml`.
- Installed Hermes plugin from PR 36 tree at `f2048257` (post-ctor-fix adapter,
  not main `4ccb0083` adapters).
- Re-ran the A-append mutation path with ctor verification before the matrix cell.
- Confirmed `FreshCtxContextEngine()` constructs without error.
- Inspected turn-2 request JSON for marker presence (official score =
  token-in-request).
- Did **not** edit `src/`, door, holdout traces, `bench/repos.lock.json`, or
  adapters on this branch. Door stays `f8771c93894095348185ef3453a3c2498355b3c6`.
  `repos.lock` blob stays `79e29d09…`. `AUTORESEARCH_SCORE` stays 89.107165.
  `resultSetHash` stays null.

Evidence for the broader Hermes session lives under
[docs/lab/live-2026-08-22/](../live-2026-08-22/). This ctor re-run is a
box-local note; full request JSON is not archived.

## Host lock SHAs (unchanged)

| host | commit | repo |
|---|---|---|
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` | `NousResearch/hermes-agent` |
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` | `earendil-works/pi` (unused in this note) |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | no | — | docs-only PCR |
| live ctor + A-append cell | yes | 0 | post-ctor-fix plugin; gold miss on turn-2 request |
| DeepSeek ping | yes | 200 | same session as PCR 0041 |

## Metric snapshot

| check | result |
|---|---|
| phase | **post-ctor-fix / pre-lifecycle-fix** |
| plugin source | PR 36 / `f2048257` (zero-arg ctor adapter) |
| ctor (`FreshCtxContextEngine()`) | **yes** |
| gold in turn-2 request (`ALPHA_NEW_MARKER_9c2b`) | **no** |
| stale token in request (`ALPHA_OLD_MARKER_7f3a`) | **yes** |
| `freshctx-state` on disk | empty |
| door blob | `f8771c93…` unchanged |
| official score delta | n/a (live host; not `npm run evaluate`) |

On the same disk mutation, PCR 0041's scripted driver **did** put
`ALPHA_NEW_MARKER_9c2b` into the hermes-fresh request (see
[REPORT.md](../live-2026-08-22/REPORT.md) cell A-append). This re-run shows
that zero-arg ctor success (PCR 0042 / PR 36) does not by itself guarantee
observe/state wiring; compare 0041 (driver path) vs this note (ctor-verified
re-run with post-ctor-fix plugin).

## Comparison

- PCR 0041: full 15-cell Hermes live matrix; file-scope fresh on A, D, E, G, B2.
- PCR 0042 (PR 36): zero-arg `FreshCtxContextEngine` adapter fix — not duplicated
  here.
- PCR 0044 (this note): post-ctor-fix plugin installed; gold miss on A-append when
  `freshctx-state` stayed empty. Not a duplicate of 0041; documents remaining
  lifecycle gap after ctor fix.
- Holdout bake-off remains PCR 0038–0040. Not SOTA. Not a paper result.

## Conflicts with constitutions

none observed. Labelled `synthetic` / lab note.

## Limitations

- n=1, single cell, synthetic markers.
- Full turn-2 request body not archived in git.
- Records post-ctor-fix / pre-lifecycle-fix behavior only; lifecycle follow-up
  may change gold delivery.
- Model FRESH/STALE prose is not the score.

## Protocol gap?

**No.** Docs only. Holdout seal, door, and locks untouched.

## Next measurement

After lifecycle follow-up lands: repeat this re-run with the same pins and
confirm `ALPHA_NEW_MARKER_9c2b` appears in turn-2 request and
`freshctx-state` is non-empty after observe.
