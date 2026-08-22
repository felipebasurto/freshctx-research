# PCR 0045 — Hermes lifecycle persist (observe + select)

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (Hermes CLI live-session follow-up)
- Branch / PR: `cursor/hermes-zero-arg-engine-2820` (draft PR #38)
- Commit: `40b57e7`
- Merge-base: `620d7257dc35e8e7364bf641d2d3bd4b4c209928` (main at PCR 0043–0044)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `adapter-only`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

PCR 0042 fixed zero-arg construction (`EngineClass()` no longer raises). PCR 0044
documented a live Hermes CLI A-append re-run (post-ctor-fix plugin) where ctor
**yes** but gold **no** and `artifacts/freshctx-state/` stayed empty.

Non-binding hypothesis (verified in unit tests): `on_session_start` called parent
`ContextCompressor.on_session_start` first; when parent failed (e.g. missing
`session_db`), the entire hook aborted before `_freshctx_state_file` was set, so
`_call_bridge` returned `None` and `select_context` no-op'd.

**Change (adapter-only):**

1. Resolve state path under `{hermes_home}/artifacts/freshctx-state/` (or
   `FRESHCTX_STATE_DIR`) and seed an empty session JSON in
   `_ensure_state_file()` **before** calling parent `on_session_start` (parent
   failures swallowed).
2. Lazy `_ensure_state_file()` from `select_context` / `on_turn_complete` when
   hooks run without a prior successful parent bind.
3. Bridge `cwd` uses `TERMINAL_CWD` when set (Hermes workspace), else
   `os.getcwd()`.

Live A-append gold on the box is **not** claimed fixed here (see PCR 0046 for the
post-adapter live CLI finding).

## What we did

- Edited `adapters/hermes/__init__.py` lifecycle only (PCR 0042 ctor retained).
- Added `test/hermes-lifecycle.test.mjs`: observe→select rewrite, parent-failure
  survival, `artifacts/freshctx-state` bootstrap.
- Did **not** edit `src/anchors.mjs`, holdout v0.1 traces/gold,
  `bench/repos.lock.json`, `bench/hosts.lock.json`, or core policy.

## Host lock SHAs (unchanged)

| host | commit |
|---|---|
| pi | `c49906ec77788625aacbdc53ebca6fbe65bd20f5` |
| hermes | `999703fd43ab6d75c4a5c7bc8b610dd73ecece76` |

Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6`.  
`bench/repos.lock.json` blob unchanged (`79e29d09a9ec12b1128617f683f50a35a3c8809e`).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | +3 lifecycle adapter probes |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run holdout:verify --pack=holdout-v0.1` | yes | 0 | `resultSetHash` null |
| `npm run holdout:ci-guard` | yes | 0 | |

## Metric snapshot

| check | result |
|---|---|
| AUTORESEARCH_SCORE | 89.107165 (unchanged) |
| door blob | unchanged |
| repos.lock blob | unchanged |
| holdout traces/gold | untouched |
| unit: on_session_start creates state file | pass |
| unit: observe persists tracked read | pass |
| unit: select rewrites after disk append | pass |
| live A-append gold | not claimed (PCR 0046) |

## Limitations

- Unit probes call adapter hooks directly; they are not the Hermes CLI hook path
  (documented in PCR 0046).
- Parent `ContextCompressor` bind failures are swallowed; compression bind may
  still be incomplete without `session_db`.
- Bridge subprocess failures remain fail-open (Hermes contract).

## Protocol gap?

**No.** Adapter-only lifecycle fix; door, holdout seal, and benchmark score unchanged.

## Next measurement

See PCR 0046: live Hermes CLI re-run with this adapter and inspect whether the
host actually invokes `on_turn_complete` / `select_context` on real reads.
