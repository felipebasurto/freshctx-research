# Pi trial TypeScript report

Label: `live-host`. Not a paper result. Not CtxBench. Not SOTA.

## Question

Does FreshCtx beat Pi-alone on TypeScript after a whole-file read and interior
flip on `settleDailyLedger`? Does Tree-sitter (inside FreshCtx, not host
`scope=symbol`) change the outcome vs the same adapter with sidecar off?

Wait for PCR 0114 if file-scope TS does not yet hit the sidecar when the runner
is present.

## Setup

| field | value |
|---|---|
| Date (UTC) | _fill on rerun_ |
| Harness commit | _fill on rerun_ |
| Pi version | _fill on rerun_ |
| Model | `deepseek-v4-flash` |
| Fixture | `docs/lab/pi-trial-ts/fixture/src/settlement.ts` |
| Flip | interior `ST0` → `ST1` in `settleDailyLedger` |
| Driver | `auto-rpc.mjs` or manual `BATTERY.md` |

## Measure table (three-arm harness)

Paste output of `node docs/lab/pi-trial-ts/print-columns.mjs` after a clean rerun.

```
arm	turn	t2_exact_new_bytes	sibling_bytes_in_request	request_bytes	prompt_tokens	pi_stdout_current	resolution
nothing	1	n/a	n/a	—	—	n/a	n/a
nothing	2	—	—	—	—	—	—
freshctx-no-ts	1	n/a	n/a	—	—	n/a	n/a
freshctx-no-ts	2	—	—	—	—	—	—
freshctx-ts	1	n/a	n/a	—	—	n/a	n/a
freshctx-ts	2	—	—	—	—	—	—
```

## Retired first run @ `46d5334` (invalid third arm)

Pre-`resolveRepoRoot` three-arm harness used `with-symbol` with different prompts
and no `scope=symbol` in tool args (122 tools t1). Do not treat as Tree-sitter
measurement. Rows kept for archaeology only.

| arm (retired) | turn | t2_exact_new_bytes | request_bytes | resolution | notes |
|---|---|---|---:|---|---|
| without | 2 | no | 13356 | none | stale as expected |
| with-file | 2 | yes | 18066 | none | wrong extension path |
| with-symbol | 2 | yes | 104638 | file | invalid; not Tree-sitter |

## Notes per arm

### A `nothing`

Pi alone. Expect stale t2 unless model re-reads.

### B `freshctx-no-ts`

FreshCtx with `FRESHCTX_SIDECAR=off`. Same prompts as A and C.

### C `freshctx-ts`

FreshCtx with sidecar injected. Until PCR 0114, `resolution=sidecar` on
file-scope TS may not appear even when sidecar is present.

## Adapter smokes (synthetic)

| Command | Exit | Notes |
|---|---|---|
| `node --test test/pi-trial-ts-pack.test.mjs` | _pending rerun_ | |
| `npm run evaluate` | not claimed | no `AUTORESEARCH_SCORE` in this pack |

Door `f8771c93894095348185ef3453a3c2498355b3c6`. Lock
`79e29d09a9ec12b1128617f683f50a35a3c8809e`. No `--relock`.

## Could not measure

Tree-sitter vs no-Tree-sitter on file-scope TS until PCR 0114 routes file-scope
refresh through the sidecar. Host `scope=symbol` is out of scope.
