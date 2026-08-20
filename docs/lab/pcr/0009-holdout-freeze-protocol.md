# PCR 0009 — Holdout freeze/generate/run/report pipeline invariant

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/holdout-freeze-protocol-96e3`
- Commit: `6aeab4b`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `protocol-fixture`

## Hypothesis or change

Ship a **pipeline-level invariant**: no valid holdout/benchmark report can be produced unless its split manifest was frozen and **committed** first. Document that the guarantee did **not** exist before this PR.

## Evidence the guarantee did NOT exist before

| Check | Result |
|---|---|
| holdout v0.1 first commit | `56974c0` (2026-08-20T20:43:51Z) added `corpus-split.json`, traces, `build-holdout-traces.mjs`, `holdout.mjs`, and `holdout.md` together |
| Timestamp ordering | `holdout.md` Generated `2026-08-20T20:43:14.300Z` **before** `corpus-split.json` `preregisteredAt` `2026-08-20T20:45:00.000Z` |
| Code search | `rg freeze\|dirty\|manifestSha` in `holdout.mjs`, `build-holdout-traces.mjs`, `package.json`, `ci.yml` → **no matches** before this PR |
| `holdout.mjs` | Recorded HEAD or threw; no dirty-tree check, no split-manifest hash, no fail-closed if artifacts pre-existed |
| CI | Runs check/test/bench/ctxbench/evaluate/papers:list only; no holdout freeze gate |
| `corpus-split.json` | Did not freeze seeds, gates, metric list, or sampling rules as a committed-before-generate contract |

**Conclusion:** holdout v0.1 is reclassified as `unsealed-regression-development-pack`. It is **not** retroactively preregistered.

## What we did

1. Added `bench/holdout-protocol.mjs` with ordered phases: **freeze → commit → generate → run → report**.
2. Added `scripts/holdout-protocol.mjs` CLI and npm scripts `holdout:freeze`, `holdout:generate`, `holdout:run`, `holdout:report`.
3. Fail-closed checks (via `git` spawnSync; fail if git missing):
   - manifest uncommitted or dirty;
   - generated artifacts already existed at freeze commit tree;
   - manifest hash mismatch (tamper after freeze);
   - generate/run/report before freeze;
   - implementation (`src/policy.mjs`, `src/anchors.mjs`, `src/projector.mjs`) or `repos.lock` differs from freeze record.
4. Added `test/holdout-protocol.test.mjs` — seven negative + happy-path tests in temp git repos (no network).
5. Updated `bench/corpus-split.json`, PCR 0007 status labels, `docs/BENCHMARK.md`, `docs/EVALUATION.md` §14.
6. Did **not** regenerate holdout v0.1, retune policy, or change gold labels/weights/thresholds.

## New commands

```bash
npm run holdout:freeze -- --manifest=bench/splits/<pack>.json --pack=<id> --repos=go-tools,neovim
# commit and push manifest

npm run holdout:generate -- --manifest=bench/splits/<pack>.json
npm run holdout:run -- --manifest=bench/splits/<pack>.json
npm run holdout:report -- --manifest=bench/splits/<pack>.json
```

Synthetic fixture generator is used when `--fixture=synthetic` (tests and local proof).

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | includes 7 new protocol tests |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged |
| `npm run demo` | yes | 0 | |
| `npm run ctxbench:holdout` | yes | 1 | legacy v0.1 regression; known go-tools recall miss |

## Remaining bypasses (honest)

| Bypass | Why it remains |
|---|---|
| `npm run ctxbench:holdout` | Legacy holdout v0.1 pack is `protocolExempt`; runs without freeze provenance for regression only |
| `npm run ctxbench:pi-holdout`, `ctxbench:hermes-holdout`, `ctxbench:adapters-holdout` | Adapter holdout replays on v0.1 traces; not gated by new protocol |
| `scripts/build-holdout-traces.mjs` | Unchanged author tool; does not enforce freeze ordering (use `holdout:generate` for new packs) |
| Smoke board (`ctxbench:smoke`) | Out of scope; separate split file not yet on freeze protocol |
| Manual report editing | Git cannot prevent editing `bench/reports/*.md` by hand; valid **pipeline** reports require run provenance |

## What we can claim

A **new** holdout pack cannot produce traces or reports unless its manifest was frozen, hash-verified, and committed first — enforced by code and negative tests, not documentation alone.

## Next measurement

First **new-seed** holdout (v0.2+) using `holdout:freeze` → commit → `holdout:generate` → `holdout:run` → `holdout:report` on go-tools/neovim with new seeds. See [NEXT-PROMPT.md](../NEXT-PROMPT.md).
