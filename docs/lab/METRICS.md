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
| 2026-08-20 | (PCR 0006) | 41/41 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0006](pcr/0006-region-grain-adapters.md) |
| 2026-08-20 | (PCR 0007) | 42/42 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0007](pcr/0007-sealed-holdout-protocol.md) |
| 2026-08-20 | (PCR 0008) | 44/44 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0008](pcr/0008-pi-hermes-holdout-replay.md) |
| 2026-08-20 | (PCR 0009) | 51/51 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0009](pcr/0009-holdout-freeze-protocol.md) |
| 2026-08-20 | (PCR 0010) | 61/61 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0010](pcr/0010-holdout-protocol-enforcement.md) |
| 2026-08-20 | (PCR 0010 enforcement-fix) | 63/63 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0010](pcr/0010-holdout-protocol-enforcement.md) |
| 2026-08-20 | (PCR 0011) | 68/68 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0011](pcr/0011-test-hygiene-sealed-hash-gate.md) |
| 2026-08-20 | `e245906` WAVE 1 rejected (no impl merge) | 69/69 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0012](pcr/0012-devloop-wave1-rejects.md) |
| 2026-08-21 | `f3cdb47` wave2 rebase reeval (+ Codex exact-startLine gate) | 78/78 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0013](pcr/0013-wave2-go-tools-rebase-reeval.md) |
| 2026-08-21 | (PCR 0014) stop pinning live unsealed holdout results | 78/78 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0014](pcr/0014-unsealed-hash-anchor-refresh.md) |
| 2026-08-21 | (PCR 0015) insert-before-dev-v0.1 pack | 90/90 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0015](pcr/0015-insert-before-dev-pack.md) |
| 2026-08-21 | (PCR 0016) insert-before-interior-dev-v0.1 pack | 91/91 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0016](pcr/0016-insert-before-interior-dev-pack.md) |
| 2026-08-21 | (PCR 0017) insert-before-tie-dev-v0.1 pack | 92/92 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0017](pcr/0017-insert-before-tie-dev-pack.md) |
| 2026-08-22 | (PCR 0018) insert-before-unique-last-dev-v0.1 pack | 93/93 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0018](pcr/0018-insert-before-unique-last-dev-pack.md) |
| 2026-08-22 | (PCR 0019) grow-inside-dev-v0.1 pack | 94/94 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0019](pcr/0019-grow-inside-dev-pack.md) |
| 2026-08-22 | (PCR 0020) delete-unit-dev-v0.1 pack | 94/94 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0020](pcr/0020-delete-unit-dev-pack.md) |
| 2026-08-22 | (PCR 0022) delete-unit-fail-close-dev-v0.1 pack | 99/99 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0022](pcr/0022-delete-unit-fail-close-dev-pack.md) |
| 2026-08-22 | (PCR 0023) move-in-file-dev-v0.1 pack | 100/100 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0023](pcr/0023-move-in-file-dev-pack.md) |

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
| 2026-08-20 | (PCR 0006) | `public-repo-smoke` / `replay` | Region-grain Pi/Hermes: exact-current matches core-region on append/interior-edit/move-in-file (1.000); projection-bytes match core-region (0 delta); vs PCR 0003 file-grain exact-current 0 and +350–6859 bytes. | [0006](pcr/0006-region-grain-adapters.md) |
| 2026-08-20 | (PCR 0007) | `public-repo-holdout` | First holdout v0.1 slice (unsealed-regression-development-pack; not preregistered — see PCR 0009): go-tools `ed9ed918…`, neovim `2dd6e9d6…`; 10 traces; freshctx-region gate failure on go-tools interior-edit (recall 0); 9/10 cells pass; not SOTA. | [0007](pcr/0007-sealed-holdout-protocol.md) |
| 2026-08-20 | (PCR 0008) | `public-repo-holdout` / `replay` | Pi/Hermes holdout replay: 0-byte delta vs core-region on all 10 cells; go-tools interior-edit recall 0 reproduced on Pi and Hermes (not silently passed); Hermes 0-byte delta vs Pi; not SOTA. | [0008](pcr/0008-pi-hermes-holdout-replay.md) |
| 2026-08-21 | (PCR 0014) | `public-repo-holdout` | Stop pinning live unsealed jsonl; resultSetHash null; jsonl stays gitignored; historical holdout.md unchanged. | [0014](pcr/0014-unsealed-hash-anchor-refresh.md) |

Full tables: `bench/reports/latest.md`, `bench/reports/holdout.md`, `bench/reports/pi-smoke.md`, `bench/reports/hermes-smoke.md`, `bench/reports/pi-holdout.md`, `bench/reports/hermes-holdout.md`.
