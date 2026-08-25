# PCR 0077 — skip re-injecting unchanged units

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0077-skip-unchanged-inject-6ed3` (draft PR)
- Commit: (this commit)
- Merge-base: `55c3a809fa930443c91f841cf4766eec30e90cfa` (main @ PCR 0076)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`
- Decision: **review** (skip unchanged inject; do not merge)

## Hypothesis or change

Pi live trials re-send full tracked file bodies on every model call even when disk
bytes are unchanged since the prior inject, defeating prefix-cache reuse. Track
`lastInjectedRevision` per unit across turns; when refresh yields the same
revision, render a marker-only `<freshctx-unit … unchanged="true" content-bytes="0">`
frame instead of repeating the body. When disk changes, inject NEW bytes as before.

Fail-open unchanged: empty registry or `context()` throw still returns
`undefined`.

Did **not** edit `src/anchors.mjs`, holdout gold, score weights, or persist-38.
Core ctxbench path does not pass `lastInjectedRevision` (opt-in at adapter).

Not a paper result. Not SOTA. Gold language-agnostic.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## What we did

- `src/projector.mjs` — opt-in `lastInjectedRevision` map; `renderUnit` emits
  empty body + `unchanged="true"` when revision matches last inject.
- `src/engine.mjs` — `project({ lastInjectedRevision })` updates the map after
  full-body injects.
- `adapters/pi/replay.mjs`, `adapters/pi/extension.ts` — in-process
  `lastInjectedRevision` map wired into every `onContext` / `context` hook.
- `adapters/hermes/bridge.mjs` — persist `lastInjectedRevision` in session state
  file across `selectContext` calls (Hermes parity).
- `bench/metrics.mjs` — recall / exact-current treat unchanged units whose
  `revision` matches gold digest as current (semantic parity, not body repeat).
- `test/pcr-0077-skip-unchanged-inject.test.mjs` — five replay boards.
- Holdout / smoke adapter parity helpers — projection-bytes may be **≤** core when
  final capture skips unchanged body; provider payload hash compares content digests.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **220 pass**, **22 skip**, **0 fail** (242 total; +5 vs 0076) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged |
| `npm run ctxbench:pi-smoke` | yes | 0 | freshness gates pass; failures `[]` |

## Metric snapshot

| metric | PCR 0076 ledger | this PCR | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| npm test pass | 215/215 runnable | 220/220 runnable | +5 tests |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `79e29d09…` | `79e29d09…` | 0 |

## Replay byte table (synthetic board, 40× line probe file)

| board | projection bytes | full body in projection? | notes |
|---|---|---|---|
| turn 1 — first inject | 1700 | yes (`T77_OLD`) | seeds `lastInjectedRevision` |
| turn 2 — disk unchanged | 394 | no | `unchanged="true"`; −1306 bytes vs turn 1 |
| turn 3 — disk changed | 1700 | yes (`T77_NEW`) | NEW bytes; freshness holds |

Measured on `test/pcr-0077-skip-unchanged-inject.test.mjs` replay harness only.
Not a general cheaper-in-production claim.

## Replay proof (synthetic)

| test | claim locked |
|---|---|
| projector skip | `lastInjectedRevision` match → empty body + `unchanged="true"` |
| two-turn unchanged | turn-2 projection omits `T77_OLD`; bytes drop |
| two-turn changed | turn-3 projection has `T77_NEW` only |
| empty registry fail-open | `onContext` → `undefined` |
| context throw fail-open | simulated `project()` throw → `undefined` |

## Limitations

- Unchanged skip is per process (Pi) or session state file (Hermes); Pi restart
  clears `lastInjectedRevision` (same as 0076 `callToUnit` honesty).
- When revision is unchanged, provider payload omits body bytes; models that do
  not retain prior-turn context rely on the unchanged marker + revision attribute.
- Smoke/holdout final captures on append-family traces may show lower
  `projectionBytes` than core when resolver revision is unchanged post-edit.

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter + opt-in projector path. Door, locks, and ctxbench payload
untouched.

## Next measurement

Live Pi trial replay with billing capture to confirm prefix-cache hit rate on
turn-2 unchanged boards (n=1 lab report only; not CtxBench).
