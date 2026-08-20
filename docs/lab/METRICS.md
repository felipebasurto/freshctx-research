# Benchmark ledger

Append-only snapshots. Do not overwrite earlier rows.

## Synthetic (`npm run evaluate` / `npm run ctxbench`)

| UTC | Commit | Tests | AUTORESEARCH_SCORE | stale | copies | recall | ctxbench payload sha256 | det. | PCR |
|---|---|---|---|---|---|---|---|---|---|
| 2026-08-20 | `0644400` smoke landing | 22/22 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0001](pcr/0001-public-log-and-lineage.md) |
| 2026-08-20 | `fbf13d6` CORVUS lifecycle | 26/26 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0002](pcr/0002-corvus-lifecycle.md) |
| 2026-08-20 | `17bc65c` Pi smoke | 32/32 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0003](pcr/0003-pi-smoke-capture.md) |
| 2026-08-20 | `b7a0b2a` Hermes smoke | 37/37 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0004](pcr/0004-hermes-smoke-capture.md) |
| 2026-08-20 | `54d71f8` CORVUS deviation table | 37/37 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0005](pcr/0005-corvus-deviation-table.md) |

No synthetic metric delta. Label: `synthetic`.

## Public-repo smoke

Lock (unchanged): Flask `d318b683471101618febed18996405ad26462110`, Express
`a3714473feb3d2908add734d340e7755fd85e0a3`, manifest
`4b6ecc86003607504fccb3eee4baadccabe9201f1a88b1db5ba00e9addcd52f4`.

| UTC | Commit | Label | Notes | PCR |
|---|---|---|---|---|
| 2026-08-20 | `0644400` | `public-repo-smoke` | First control board. `corvus-file` was CORVUS-shaped. | [0001](pcr/0001-public-log-and-lineage.md) |
| 2026-08-20 | `fbf13d6` | `public-repo-smoke` | Documented `sync_file`/`sync_context`. CORVUS projection-bytes −21 on most cells (marker serialization); delete cells −82. Correctness columns unchanged. | [0002](pcr/0002-corvus-lifecycle.md) |
| 2026-08-20 | `17bc65c` | `public-repo-smoke` / `replay` | Pi adapter smoke: stale 0, recall 1, duplicate 0 on all families; exact-current 0 (file scope). Matches `freshctx-file` bytes, not `freshctx-region`. | [0003](pcr/0003-pi-smoke-capture.md) |
| 2026-08-20 | (PCR 0004) | `public-repo-smoke` / `replay` | Hermes adapter smoke: stale 0, recall 1, duplicate 0; projection-bytes identical to Pi on all families; exact-current 0 (file scope). | [0004](pcr/0004-hermes-smoke-capture.md) |
| 2026-08-20 | `54d71f8` | `public-repo-smoke` | CORVUS deviation table: corvus-file / freshctx-file / freshctx-region side-by-side on smoke v0.1; 0-byte delta vs PCR 0002; region smaller on append/interior-edit/move-in-file; no ranking claim. | [0005](pcr/0005-corvus-deviation-table.md) |

Full tables: `bench/reports/latest.md`, `bench/reports/pi-smoke.md`, `bench/reports/hermes-smoke.md`.
