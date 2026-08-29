# PCR 0115 — Pi trial dump reads escaped resolution attributes

- Date (UTC): 2026-08-29
- Author / agent: Cursor Cloud Agent
- Branch / PR: `cursor/dump-request-resolution-escape-2bea` (draft)
- Base SHA: `8e436e73bf9b89a4d1a964fe97cad1c67453ca3b` (PCR 0114 squash on main)
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `measurement`; `harness-only`
- Decision: **review**

## Hypothesis or change

PCR 0113/0114 wired Tree-sitter refresh for the `freshctx-ts` arm.
The Pi trial dump helper still scanned for unescaped `resolution="…"` after
`JSON.stringify`.
Stringified provider payloads contain `resolution=\"sidecar\"` or
`resolution=\"whole-file\"`.
The old regex never matched.
Both live arms printed `resolution=none` in `.scan.json` while raw captures
still held the projector tokens.

## What we did

1. Added `docs/lab/pi-trial-ts/resolution-from-stringified.mjs` to read the
   last `resolution=\"token\"` match from stringified text.
2. Updated `docs/lab/pi-trial-ts/dump-request.ts` to call that helper after
   `JSON.stringify`.
3. Added `test/pcr-0115-dump-request-resolution-escape.test.mjs` (5 tests)
   pinned to stringified fixtures.
4. Did not edit `src/`, adapters, holdout v0.2, door, or lock.
5. Did not `--relock` or change benchmark weights.

## Dest reprint (research box, not re-dumped on this VM)

Raw `002.json` on dest at
`/workspace/freshctx-measure-8e436e73/docs/lab/pi-trial-ts/.work/capture/`
showed escaped projector tokens after stringify.

| arm | stringified fragment in raw capture | prior `.scan.json` |
|---|---|---|
| `freshctx-ts` | `resolution=\"sidecar\"` | `resolution`: `none` |
| `freshctx-no-ts` | `resolution=\"whole-file\"` | `resolution`: `none` |

Both scans still had `hasFreshCtxUnit`: `true`.

## Benchmarks run

Canonical TAP from this run on branch HEAD after `npm run sidecar:install`
(base `8e436e7`).

```
1..424
# tests 424
# suites 0
# pass 398
# fail 0
# cancelled 0
# skipped 26
# todo 0
```

Official accepted TAP remains **395 pass / 0 fail / 17 skipped / 412 total**.

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP above (+5 vs base 419) |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| door/lock `git hash-object` | yes | 0 | door=`f8771c93894095348185ef3453a3c2498355b3c6`; lock=`79e29d09a9ec12b1128617f683f50a35a3c8809e` |

## Metric snapshot

| metric | base `8e436e7` | PCR 0115 (this run) | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| ctxbench payload sha256 | `697e74e3…` (hold) | `697e74e3…` (hold) | `0` |
| `npm test` TAP `# tests` | 419 | **424** | **+5** |
| `npm test` TAP `# pass` | 393 | **398** | **+5** |
| `npm test` TAP `# fail` | 0 | **0** | `0` |
| `npm test` TAP `# skipped` | 26 | **26** | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |
| lock blob | `79e29d09…` | `79e29d09…` | `0` |

## Comparison

No Level 4 sentence.
Measured: stringified fixture with `resolution=\"sidecar\"` now scans as
`sidecar`, not `none`.
Measured: stringified fixture with `resolution=\"whole-file\"` now scans as
`whole-file`.
Measured: last matching escaped attribute wins; missing attribute defaults to
`none`.
Synthetic harness only.
Tree-sitter product behavior unchanged.

## Conflicts with constitutions

none observed.

## Limitations

Live Pi three-arm rerun on Mac is still pending.
Dest captures were not re-dumped on this VM.
This PCR only fixes dump scan metadata, not adapter refresh.

## Recommended next experiment

Rerun PCR 0113 three-arm battery on Mac.
Confirm turn-2 `.scan.json` `resolution` matches raw capture tokens for arms
`freshctx-ts` and `freshctx-no-ts`.
