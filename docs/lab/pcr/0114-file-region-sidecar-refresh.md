# PCR 0114 — File/region sidecar refresh for Python, JavaScript, and TypeScript

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/file-region-sidecar-fd3b` (draft)
- Base SHA: `15c573e74f7dd84ab36f2a63bd49b53cfc61b19e` (PCR 0113 squash)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `replay`; `adapter-only`; `measurement`
- Decision: **review**

## Hypothesis or change

PCR 0112 injected `sidecarRunner` into Pi/Hermes adapters but `engine.refresh` only
called Tree-sitter when `scope === "symbol"`.
Normal whole-file Pi/Hermes reads on `.py`/`.js`/`.ts` never reached `parseSource`.
PCR 0113 added the three-arm Pi TypeScript measure harness (`nothing` /
`freshctx-no-ts` / `freshctx-ts`) with `FRESHCTX_SIDECAR=off` for arm B.
This PCR routes file-scope and region refresh through the injected sidecar on
Tree-sitter languages when a runner is present.
Arm B stays `sidecarRunner: null` via the existing harness knob, not a new host
flag.

## What we did

1. Extended `src/registry.mjs` refresh for `.py`/`.js`/`.mjs`/`.cjs`/`.ts`/`.tsx`
   when `sidecarRunner` is injected.
2. File scope calls the sidecar and resolves with `resolutionMethod: "sidecar"`
   when parse is not broken.
3. Region scope calls the sidecar first.
   Exact tree-sitter unit span matches relocate via sidecar.
   Otherwise anchors and `stored-line-span` fall back unchanged.
4. Fail closed on missing runner, spawn error, or `parse-broken`.
   Ambiguous or unit-less parses fall back for file/region grain.
5. Added `test/pcr-0114-file-region-sidecar-refresh.test.mjs` (5 tests).
6. Relaxed Pi/Hermes smoke parity checks to compare recall instead of projection
   bytes when sidecar resolution labels differ from core-only refresh.
7. Reused PCR 0113 `FRESHCTX_SIDECAR=off` in `adapters/pi/extension.ts`.
   Did not edit door, lock, holdout gold, weights, or thresholds.

## Benchmarks run

Canonical TAP from this run on branch HEAD (base `15c573e`).

```
1..417
# tests 417
# suites 0
# pass 391
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

Official accepted table on merge-base `4e4a930` remains **388 pass / 0 fail /
17 skipped / 405 total** until Bench measures a squash.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above |
| `npm run check` | yes | 0 | includes registry + sidecar paths |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Metric snapshot

| metric | base `15c573e` | PCR 0114 (this run) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` (hold) | `697e74e3…` (hold) | `0` |
| `npm test` TAP `# tests` | 412 | **417** | **+5** |
| `npm test` TAP `# pass` | 386 | **391** | **+5** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

## Comparison

No Level 4 sentence.
Synthetic adapter replay only.
Measured: Pi file-scope `.ts` refresh with default sidecar yields
`resolutionMethod: "sidecar"` without host `scope=symbol`.
Measured: same read with `sidecarRunner: null` stays `whole-file`.
Measured: Python region refresh with exact unit span match relocates via sidecar.
Measured: missing runner and parse-broken syntax fail closed on file-scope `.ts`.

## Conflicts with constitutions

none observed.

## Limitations

Region reads that do not match an exact sidecar unit span still use anchors.
Live Pi three-arm rerun on Mac is still pending after this lands.
Hermes extension does not yet read `FRESHCTX_SIDECAR=off` (Pi harness only).

## Recommended next experiment

Rerun PCR 0113 three-arm battery on Mac.
Compare arm `freshctx-ts` `resolution=sidecar` vs arm `freshctx-no-ts`
`resolution=whole-file` on the same whole-file prompts.
