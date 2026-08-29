# PCR 0113 — Pi-only TypeScript measure pack (harness + fixture)

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/pi-trial-ts-measure-pack-abe1` (draft)
- Base SHA: `4e4a930d3adce05da6bc304a27fee8d6b0172539`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `live-host`; `measurement`; `harness-only`
- Decision: **review**

**Status:** draft harness. Two arms only. Waiting on clean two-arm rerun and on
product PCR for file-scope TS/JS/Python sidecar routing before Tree-sitter
claims.

## Hypothesis or change

Question for a later live run: does FreshCtx beat Pi-alone on TypeScript after a
whole-file read and interior flip?

Tree-sitter is inside FreshCtx, not a host option. This pack does not add
`scope=symbol` prompts or a third arm. Product PCR will route file-scope
TS/JS/Python through the sidecar; rerun then if `resolution=sidecar` matters.

## What we did

1. Added `docs/lab/pi-trial-ts/` with fixture `src/settlement.ts` (lookalike
   exports, interior flip `ST0`→`ST1` scoped to `settleDailyLedger`).
2. Added two-arm harness: `without`, `with`.
3. Added `resolveRepoRoot()` (walk to `adapters/pi/extension.ts`).
4. Retired three-arm / `scope=symbol` design after first live run @ `46d5334`.
5. Did not edit official TAP, holdout v0.2, `src/policy`, `src/anchors`,
   `src/projector`. No `--relock`.

## Arms

| arm | FreshCtx | read |
|---|---|---|
| `without` | no | whole file |
| `with` | yes | whole file |

## First live run (retired third arm)

@ `46d5334`, pre-`resolveRepoRoot` fix. Recorded in `REPORT.md`. `with-symbol`
invalid (no `scope=symbol` in tool args; bash storm t1). Not a Tree-sitter
measurement.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `node --test test/pi-trial-ts-pack.test.mjs` | yes | 0 | 5/5 after two-arm pivot |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93…`; lock=`79e29d09…` |

## Metric snapshot

No valid two-arm table yet. Do not invent `AUTORESEARCH_SCORE`.

| metric | origin/main `4e4a930` | this PR | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | not measured | n/a |
| live Pi TS two-arm table | n/a | pending rerun | n/a |

## Comparison

Harness-only. Two-arm rerun after `resolveRepoRoot()` fix. Tree-sitter vs
file-only comparison deferred to post-product-PCR sidecar routing.

## Known limitations

- First run used wrong extension path (`join(pack,"../..")` → `docs/`).
- `auto-rpc.mjs` requires `pi` on PATH.

## Recommended next experiment

1. Rerun two-arm battery on Mac with official Pi + DeepSeek v4 flash.
2. After product PCR lands file-scope sidecar for TS, rerun and compare
   `resolution` on arm `with`.
