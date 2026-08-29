# Pi trial TypeScript report

Label: `live-host`. Not a paper result. Not CtxBench. Not SOTA.

## Question

Does FreshCtx beat Pi-alone on TypeScript after a whole-file read and interior
flip on `settleDailyLedger`?

Tree-sitter is inside FreshCtx. This pack does not ask Pi for `scope=symbol`. A
future product PCR will route file-scope TS/JS/Python through the sidecar; rerun
the two-arm battery after that lands if `resolution=sidecar` is the comparison
you need.

## Setup

| field | value |
|---|---|
| Date (UTC) | 2026-08-29 (first all-arms run, pre two-arm pivot) |
| Harness commit | `46d5334` (first all-arms run); branch now two-arm only |
| Pi version | _fill on rerun_ |
| Model | `deepseek-v4-flash` |
| Fixture | `docs/lab/pi-trial-ts/fixture/src/settlement.ts` |
| Flip | interior `ST0` → `ST1` in `settleDailyLedger` |
| Driver | `auto-rpc.mjs` (first run used broken `repoRoot`; fixed in branch) |

## First run @ `46d5334` (three-arm harness, retired)

Recorded before pivot to two arms. `with-symbol` arm and `scope=symbol` prompts
are retired. Do not treat the third row as a Tree-sitter measurement.

| arm | turn | t2_exact_new_bytes | sibling_bytes_in_request | request_bytes | pi_stdout_current | resolution | notes |
|---|---|---|---|---:|---|---|---|
| without | 2 | no | yes | 13356 | no | none | stale as expected |
| with-file | 2 | yes | yes | 18066 | yes | none | extension path was wrong (`docs/adapters/...`) |
| with-symbol | 2 | yes | yes | 104638 | yes | file | 122 tools t1; no `scope=symbol` in args; not valid |

`with-symbol` t1 `request_bytes=2798878`. Reads used path fragments, offset/limit,
and bash. Arm C did not measure Tree-sitter.

## Measure table (current two-arm harness)

Paste output of `node docs/lab/pi-trial-ts/print-columns.mjs` after a clean rerun
with fixed `resolveRepoRoot()`.

```
arm	turn	t2_exact_new_bytes	sibling_bytes_in_request	request_bytes	prompt_tokens	pi_stdout_current	resolution
without	1	n/a	n/a	—	—	n/a	n/a
without	2	—	—	—	—	—	—
with	1	n/a	n/a	—	—	n/a	n/a
with	2	—	—	—	—	—	—
```

## Notes per arm

### A `without`

First run t2: stale (`pi_stdout_current=no`, `t2_exact_new_bytes=no`).

### B `with`

First run t2 (as `with-file`): current answer with wrong extension path. Rerun
required after `resolveRepoRoot()` fix.

## Adapter smokes (synthetic)

| Command | Exit | Notes |
|---|---|---|
| `node --test test/pi-trial-ts-pack.test.mjs` | _pending rerun_ | |
| `npm run evaluate` | not claimed | no `AUTORESEARCH_SCORE` in this pack |

Door `f8771c93894095348185ef3453a3c2498355b3c6`. Lock
`79e29d09a9ec12b1128617f683f50a35a3c8809e`. No `--relock`.

## Could not measure

Tree-sitter vs no-Tree-sitter on this pack until product PCR routes file-scope
TS through the sidecar. Host symbol scope is out of scope.
