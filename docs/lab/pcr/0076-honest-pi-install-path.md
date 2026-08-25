# PCR 0076 — honest Pi install path (README + fail-open + two-turn replay)

- Date (UTC): 2026-08-25
- Author / agent: Cloud Agent
- Branch / PR: `cursor/pcr-0076-honest-pi-install-d464` (draft PR)
- Commit: (this commit)
- Merge-base: `a195210965937ce898b85287c6ba6b6656d29fa8` (main @ PCR 0075)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `pi-fresh`; `replay`; `adapter-only`
- Decision: **review** (README honesty + replay tests; no core change)

## Hypothesis or change

Strangers need one copy-pasteable Pi install path and documentation that matches
what the adapter actually does. PCR 0074 confirmed the official hook on a research
box; this PCR makes the repo-side story honest without repeating that live run
(Pi is not installed on this VM).

**Ship:**

1. README — one command (`pi -e ./adapters/pi/extension.ts`), one env var
   (`FRESHCTX_BUDGET_CHARS`), in-memory state table, refused reads, region +
   offset/limit scope (not “file-level only”), fail-open behavior, explicit
   not-supported list.
2. Replay tests — empty-registry fail-open, context-throw fail-open, in-memory
   `callToUnit` across two turns, two-turn interior edit without re-read, deleted
   file omits stale body.

Did **not** edit `src/anchors.mjs`, `src/policy.mjs`, `src/projector.mjs`,
`bench/traces`, holdout gold, `docs/EVALUATION.md`, Hermes adapter, or benchmark
weights. No persist-38. No v0.2. No `--relock`. No live model calls.

Not a paper result. Not SOTA. Gold language-agnostic.

### Door / locks (unchanged)

| artifact | git blob |
|---|---|
| Door (`src/anchors.mjs`) | `f8771c93894095348185ef3453a3c2498355b3c6` |
| `bench/repos.lock.json` | `79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## What we did

- Rewrote `adapters/pi/README.md` to match current adapter behavior.
- Added `test/pcr-0076-pi-honest-install.test.mjs` (5 replay tests).
- No changes to `adapters/pi/extension.ts`, `adapters/pi/replay.mjs`, or
  `adapters/request-prune.mjs` — existing fail-open and two-turn refresh logic
  already matched the README claims; tests lock them in.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | **215 pass**, **22 skip**, **0 fail** (237 total; +5 vs 0075) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run ctxbench:pi-smoke` | yes | 0 | regression unchanged |
| `pi -e ./adapters/pi/extension.ts` | **no** | — | Pi CLI not installed on this VM |

## Metric snapshot

| metric | PCR 0075 ledger | this PCR | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | 89.107165 | 89.107165 | 0 (tests only) |
| ctxbench payload sha256 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 0 |
| npm test pass | 210/210 runnable | 215/215 runnable | +5 tests |
| door blob | `f8771c93…` | `f8771c93…` | 0 |
| lock blob | `79e29d09…` | `79e29d09…` | 0 |

## Replay proof (synthetic)

| test | claim locked |
|---|---|
| empty registry fail-open | `onContext` → `undefined`; provider payload equals persisted |
| context throw fail-open | simulated `project()` throw → `undefined`; Pi would keep original |
| in-memory `callToUnit` | same `Map` entry across turn 1 and turn 2 in one process |
| two-turn edit, no re-read | turn-2 provider payload has `T76_NEW`, not stale `T76_OLD` |
| deleted file after read | stale tool-result body absent from provider payload |

## What users still cannot do

- Resume FreshCtx tracking after Pi process restart (no durable session store)
- Use Hermes Agent through this adapter (use `adapters/hermes/` instead)
- Symbol / Tree-sitter providers
- Rely on a pinned Pi release integration test (v0.2 gate)

## Conflicts with constitutions

none observed.

## Protocol gap?

**No.** Adapter README + replay tests only. Door, locks, and benchmark weights
untouched.

## Next measurement

Optional: repeat PCR 0074 live confirm after README lands so install docs and live
evidence cite the same command string. Holdout offset/limit replay remains a
separate PCR if needed.
