# PCR 0042 — Hermes zero-arg FreshCtxContextEngine

- Date (UTC): 2026-08-22
- Author / agent: Cloud Agent (Hermes CLI live-session follow-up)
- Branch / PR: `cursor/hermes-zero-arg-engine-2820`
- Commit: `2ca2958`
- Merge-base: `64e8af0bb8261efcb9559d79a03375647502d6dd` (PCR 0041 live-session lab note)
- Paper-manifest digest: unchanged
- Result labels used: `synthetic`; `hermes-fresh`; `adapter-only`
- Decision: **review** (draft only; do not merge)

## Hypothesis or change

Tonight's real Hermes CLI A-append session loaded the FreshCtx plugin symlink but
logged `freshctx loaded but no engine instance found` on both turns. Hermes
constructs context engines with `EngineClass()` — zero arguments. FreshCtx's
`FreshCtxContextEngine` inherited `ContextCompressor.__init__`, which requires
`model`; zero-arg construction raised `TypeError` and Hermes fell back to the
built-in compressor (native-stale).

**Change:** adapter-only `__init__` on `FreshCtxContextEngine` that accepts zero
args and defaults `model`, `api_key`, and optional `base_url` from environment:

| param | resolution order |
|---|---|
| `model` | arg → `HERMES_MODEL` → `OPENAI_MODEL` → `deepseek-chat` |
| `api_key` | arg → `DEEPSEEK_API_KEY` → `OPENAI_API_KEY` → `HERMES_API_KEY` → `""` |
| `base_url` | arg → `OPENAI_BASE_URL` → `HERMES_BASE_URL` (only passed when set) |

Explicit args still win. No live API calls in the unit test (fake parent when
Hermes checkout absent).

## What we did

- Edited `adapters/hermes/__init__.py` only for product behavior (plus PCR/docs/test).
- Added `test/hermes-zero-arg-engine.test.mjs`: Python probe with fake
  `ContextCompressor` parent; asserts zero-arg construct and default model.
- Did **not** edit `src/anchors.mjs`, holdout v0.1 traces/gold,
  `bench/repos.lock.json`, `bench/hosts.lock.json`, or core rendering.
- Did **not** truncate \(C_t\), add desync, or set `FRESHCTX_CAPTURE_OK`.

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
| `npm test` | yes | 0 | +1 zero-arg engine probe |
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
| hermes-fresh holdout parity vs region | unchanged (adapter construct fix only) |

## Limitations

- Live Hermes CLI re-run on the A-append cell is recommended but not part of this PCR's CI gate.
- Default model `deepseek-chat` matches tonight's DeepSeek session; other providers need explicit env or args.
- Packaging / Hermes user-plugin registry remains a v0.3 gate.

## Protocol gap?

**No.** Adapter-only construct fix; door, holdout seal, and benchmark score unchanged.

## Next measurement

Re-run the PCR 0041 live driver or an interactive Hermes CLI session with zero-arg
`EngineClass()` and confirm FreshCtx `select_context` replaces stale tool results
on file-scope append (A-append cell).
