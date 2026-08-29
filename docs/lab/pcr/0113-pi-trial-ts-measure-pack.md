# PCR 0113 — Pi-only TypeScript measure pack (harness + fixture)

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pi-trial-ts-measure-pack-abe1` (draft)
- Base SHA: `4e4a930d3adce05da6bc304a27fee8d6b0172539`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `live-host`; `measurement`; `harness-only`
- Decision: **review**

**Status:** harness and fixture only. No live Pi run in this PR. No INDEX or
METRICS numbers until a run exists.

## Hypothesis or change

Question for a later live run (do not answer here): does FreshCtx beat Pi-alone
on TypeScript, and does Tree-sitter beat FreshCtx-without-Tree-sitter or is it
noise?

This PR ships the three-arm Pi battery, TypeScript fixture, request dump
extension, printed column schema, and `REPORT.md` template.

## What we did

1. Added `docs/lab/pi-trial-ts/` with fixture `src/settlement.ts` (lookalike
   exports, interior flip `ST0`→`ST1`).
2. Added `live.mjs` (reset/mutate/status for `without`, `with-file`,
   `with-symbol`), `auto-rpc.mjs`, `dump-request.ts`, `print-columns.mjs`.
3. Added `PLAN.md`, `BATTERY.md`, `REPORT.md` template.
4. Added invariant test for fixture markers and pack constants.
5. Did not edit official TAP, holdout v0.2, `src/policy`, `src/anchors`,
   `src/projector`. No `--relock`.

## Arms

| arm | FreshCtx | read scope | sidecar |
|---|---|---|---|
| `without` | no | whole file | n/a |
| `with-file` | yes | whole file | not used |
| `with-symbol` | yes | `scope=symbol` | used on refresh |

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pi-trial-ts-pack.test.mjs` | yes | 0 | 4/4 |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |
| `npm test` | yes | pre-existing sidecar failures on VM | +4 pack tests pass |
| `npm run evaluate` | blocked | pre-existing regression gate on VM | not re-run for score claim |

## Metric snapshot

No live-host numbers in this PR. Do not invent `AUTORESEARCH_SCORE`.

| metric | origin/main `4e4a930` | this PR | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | not measured | n/a |
| live Pi TS table | n/a | pending run | n/a |

## Comparison

Harness-only. Live comparison waits for `BATTERY.md` or `auto-rpc.mjs` on a host
with official Pi and DeepSeek v4 flash.

## Known limitations

- `auto-rpc.mjs` requires `pi` on PATH; cloud agent VM may not have it.
- `prompt_tokens` is null when the capture provider omits usage.
- Arm C turn-1 prompt asks Pi to pass `scope=symbol`; verify tool args in capture.

## Recommended next experiment

Run the three-arm battery on a Mac with official Pi, fill `REPORT.md`, paste
`print-columns.mjs` output, then decide whether to add a METRICS row.
