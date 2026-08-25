# PCR 0080 — send a refreshed file even when it is larger than the cap

- Date (UTC): 2026-08-25
- Author / agent: Cursor Grok 4.6
- Branch / PR: `pcr/0079-0080-refresh-and-stale-dumps`
- Commit: (this commit)
- Merge-base: `9741d00` (main @ PCR 0079 stateless byte-exact)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`; `live-host`
- Decision: **review** (refresh over cap)

Numbering: main already used PCR 0079 for the 0077 revert. This is the
refresh-over-cap change from the Pi 2.1 hole, rebased onto that revert. It does
**not** restore `lastInjectedRevision` or marker-only bodies.

## Hypothesis or change

Pi trial 2.1 (`docs/lab/pi-trial/REPORT-2.1.md`, n=1, `live-host`): README stayed
current because it fits the 32,768-char default cap. `src/viajante/cli.py` is
~39 kB, so first-read omit left it at CL0 after disk flipped to CL1.

**Primary fix:** if `refresh()` finds new disk bytes for a tracked unit
(`changeCount >= 1` and `changedAt === turn`), always select it this turn even
when `content.length` exceeds the cap. First-time reads still compete for the
cap: a 64 kB cold file stays omitted (0078 large board). Selected units still
carry their full current bytes (PCR 0079). Do not raise `DEFAULT_BUDGET_CHARS`.

Fail-open unchanged. Door/lock/score/payload unchanged.

Not a paper result. Not SOTA. Gold language-agnostic.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## What we did

- `src/policy.mjs` — `refreshedThisTurn`, two-pass `selectWorkingSet` that
  force-selects same-turn refreshes before the budget pass.
- `src/index.mjs` — re-export `refreshedThisTurn`.
- `test/pcr-0080-refresh-over-budget.test.mjs` — first-read 39k omit; refresh
  injects CL1 over cap.

Did **not** edit `src/anchors.mjs`, holdout gold, score weights, persist-38, or
`DEFAULT_BUDGET_CHARS`. Did **not** set `FRESHCTX_BUDGET_CHARS=200000`. Did **not**
reintroduce PCR 0077 marker-only inject.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **243 pass**, **22 skip**, **0 fail** (265 total; +9 vs PCR 0079) |
| `npm run evaluate` | yes | (this PR) | `AUTORESEARCH_SCORE=89.107165` |
| `npm run ctxbench` | — | — | payload sha256 unchanged on prior 0079/0080 tree |
| Live Pi 2.2 battery | yes | 0 | with-arm cell 2: request has CL1, reply `CLI=CL1`; [REPORT-2.2](../pi-trial/REPORT-2.2.md) |

## Metric snapshot

| metric | PCR 0079 ledger | this PCR | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| live cell 2 with-arm | trial 2.1: 163,726; CL1 count 0 | 266,986; CL1 count 2; CL0 count 0 | CL1 present (pass); bytes up because over-cap CLI inject + cell-1 tool loop |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `79e29d09…` | `79e29d09…` | 0 |

## Replay board

Track a 39 kB `cli.py` at cap 32,768. Turn 0 omits it (`reason: budget`, no CL0
in projection). Flip the disk marker to CL1 and `refresh()`. Turn 1 projection
contains CL1 and not CL0, even though the body still exceeds the cap.

## Limitations

- Several files refreshed in one turn, each larger than the cap: the request
  grows. That is the honest cost of showing current bytes.
- A 64 kB file that was never injected and then edits on disk is now force-selected
  (0078 head-line-edit board). First-read omit of that same cold file is unchanged.
- Live Pi cell-2 CL1 held on the 2.2 battery (reply `CLI=CL1`, request CL0 count 0). See [REPORT-2.2](../pi-trial/REPORT-2.2.md).

## Conflicts with constitutions

none observed. PCR 0079 (stateless bodies) is preserved: over-cap refresh still
sends the full current body, not a revision marker.

## Protocol gap?

**No.** Door, locks, evaluate score untouched. Force-select of a same-turn
refresh applies in core `selectWorkingSet`.

## Next measurement

Live size after PCR 0081 dump markers is still above the 160 kB floor (cell 5 = 222,450). Multi-path concat dumps are 0081's leftover, not an 0080 miss.
