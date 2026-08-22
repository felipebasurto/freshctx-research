# PCR 0034 — budget-pressure live Hermes summarizer

- Date (UTC): 2026-08-22
- Author / agent: repository maintainers
- Branch / PR: `cursor/pcr-0034-live-hermes-summarizer-6113`
- Commit: (see final report HEAD)
- Merge-base vs PCR 0033 squash: `fa6e2011d08b2f5f0ace283d866c0ea6a416b8af`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `budget-pressure-live-dev`; `native-host`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

PCR 0033 proved `ContextCompressor.compress()` can run on budget-pressure traces, but the auxiliary reply was the capture-provider stub (`FRESHCTX_CAPTURE_OK`). This pack reuses the same six cells, gold, fillers, `budgetChars=4000`, and budget-pressure window (`contextLength = max(256, rough*1.1)`) while requiring a **live** auxiliary model — no `FRESHCTX_CAPTURE_OK`, no stub base URL.

**Hypothesis (non-binding):** the PCR 0033 table is a compress-harness photo, not a live-summarizer photo.

## What we did

- Added live runner `bench/native-budget-pressure-live.mjs` (`ctxbench:native-budget-pressure-live`) and env guard `bench/live-hermes-env.mjs`.
- Reused existing traces in `bench/traces/lab/budget-pressure-dev-v0.1/` (no holdout copy).
- Report label `budget-pressure-live-dev-v0.1` → [`bench/reports/budget-pressure-live.md`](../../../bench/reports/budget-pressure-live.md).
- Runner fail-closed: requires `OPENAI_API_KEY` or `HERMES_API_KEY`, rejects stub base URL (`127.0.0.1:8787`), never sets `FRESHCTX_CAPTURE_OK`, exits 1 if any Hermes cell is stub or non-`compress`.
- Did **not** edit `src/anchors.mjs`, holdout v0.1 traces/gold, `bench/repos.lock.json`, benchmark weights, or seal state.

## Host lock SHAs (unchanged)

| host | commit |
|---|---|
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` |
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` |

`bench/repos.lock.json` blob unchanged (`79e29d09…` / sha256 `4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067`).

Door `src/anchors.mjs` blob unchanged (`f8771c93894095348185ef3453a3c2498355b3c6`).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | CI-safe; live Hermes tests skip without checkout/key |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run holdout:verify --pack=holdout-v0.1` | yes | 0 | `resultSetHash` null; trace-set hash unchanged |
| `npm run holdout:ci-guard` | yes | 0 | |
| `npm run ctxbench:native-budget-pressure-live` | yes | 1 | **blocked** — no live API key on Cloud Agent VM |

## Live vs stub

**Blocked on this runner.** `OPENAI_API_KEY` and `HERMES_API_KEY` unset; default base URL is capture-provider stub. Did not fall back to stub; no metrics table generated.

## Hermes mode summary

| repo | family | hermes-mode | live? |
|---|---|---|---|
| — | — | — | blocked (no table) |

Re-run with live credentials and `bench/hosts/hermes` checkout to populate the table. All six cells must show `compress` with non-stub payload.

## Limitations

- Cloud Agent VM had no live auxiliary-model credentials; honest blocked stop, not a performance measurement.
- Host checkouts gitignored; live Hermes tests skip when `bench/hosts/hermes` absent.
- Lab pack only; holdout v0.1 untouched; `resultSetHash` null.

## Protocol gap?

**No.** Live budget-pressure dev pack is intentionally outside holdout v0.1.

## Next measurement

Re-run `ctxbench:native-budget-pressure-live` on a runner with `OPENAI_API_KEY` or `HERMES_API_KEY` plus non-stub `OPENAI_BASE_URL`/`HERMES_BASE_URL`, then compare live summarization recall vs PCR 0033 stub table and FreshCtx region projection.
