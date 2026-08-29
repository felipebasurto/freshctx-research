# PCR 0113 — Pi-only TypeScript measure pack (harness + fixture)

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pi-trial-ts-measure-pack-abe1` (draft)
- Base SHA: `4e4a930d3adce05da6bc304a27fee8d6b0172539`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `live-host`; `measurement`; `harness-only`
- Decision: **review**

**Status:** draft harness. Three arms. Waiting on clean three-arm rerun and on
PCR 0114 for file-scope TS/JS/Python sidecar routing when runner is present.

## Hypothesis or change

Question for a later live run: does FreshCtx beat Pi-alone on TypeScript after a
whole-file read and interior flip? Does Tree-sitter inside FreshCtx (not host
`scope=symbol`) change the outcome vs the same adapter with sidecar off?

## What we did

1. Added `docs/lab/pi-trial-ts/` with fixture `src/settlement.ts` (lookalike
   exports, interior flip `ST0`→`ST1` scoped to `settleDailyLedger`).
2. Three-arm harness: `nothing`, `freshctx-no-ts`, `freshctx-ts`.
3. Sidecar off via `FRESHCTX_SIDECAR=off` in harness for arm B (minimal adapter
   knob in `adapters/pi/extension.ts`).
4. Same whole-file prompts on all arms; no host `scope=symbol`.
5. `resolveRepoRoot()` walks to `adapters/pi/extension.ts`.
6. Did not edit official TAP, holdout v0.2, `src/policy`, `src/anchors`,
   `src/projector`. No `--relock`.

## Arms

| arm | FreshCtx | sidecar | read |
|---|---|---|---|
| `nothing` | no | n/a | whole file |
| `freshctx-no-ts` | yes | off (harness env) | whole file |
| `freshctx-ts` | yes | on (default) | whole file |

## First live run (retired)

@ `46d5334`, pre-`resolveRepoRoot`, invalid `with-symbol` arm. Recorded in
`REPORT.md`. Not a Tree-sitter measurement.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pi-trial-ts-pack.test.mjs` | yes | 0 | 6/6 after three-arm correction |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93…`; lock=`79e29d09…` |

## Metric snapshot

No valid three-arm table yet. Do not invent `AUTORESEARCH_SCORE`.

| metric | origin/main `4e4a930` | this PR | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | not measured | n/a |
| live Pi TS three-arm table | n/a | pending rerun | n/a |

## Comparison

Harness-only. Three-arm rerun after arm correction. Tree-sitter on file-scope TS
deferred until PCR 0114 lands sidecar routing for file-scope refresh.

## Known limitations

- First run used wrong extension path and invalid symbol-scope arm design.
- `auto-rpc.mjs` requires `pi` on PATH.
- Arm C may show `resolution=file` until PCR 0114.

## Recommended next experiment

1. Rerun three-arm battery on Mac with official Pi + DeepSeek v4 flash.
2. After PCR 0114 lands file-scope sidecar for TS, rerun arm `freshctx-ts` and
   compare `resolution` vs `freshctx-no-ts`.
