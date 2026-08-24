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
| 2026-08-22 | (PCR 0021) rename-boundary-dev-v0.1 pack | 94/94 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0021](pcr/0021-rename-boundary-dev-pack.md) |
| 2026-08-22 | (PCR 0022) delete-unit-fail-close-dev-v0.1 pack | 99/99 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0022](pcr/0022-delete-unit-fail-close-dev-pack.md) |
| 2026-08-22 | (PCR 0023) move-in-file-dev-v0.1 pack | 100/100 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0023](pcr/0023-move-in-file-dev-pack.md) |
| 2026-08-22 | (PCR 0024) duplicate-boundary-dev-v0.1 pack | 101/101 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0024](pcr/0024-duplicate-boundary-dev-pack.md) |
| 2026-08-22 | (PCR 0025) parse-broken-dev-v0.1 pack | 97/97 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0025](pcr/0025-parse-broken-dev-pack.md) |
| 2026-08-22 | (PCR 0026) parse-broken exact-decoy door change | 103/103 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0026](pcr/0026-parse-broken-exact-decoy-door.md) |
| 2026-08-22 | (PCR 0027) move-lookalike-dev-v0.1 pack | 104/104 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0027](pcr/0027-move-lookalike-dev-pack.md) |
| 2026-08-22 | (PCR 0028) duplicate-boundary-markers-dev-v0.1 pack | 105/105 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0028](pcr/0028-duplicate-boundary-markers-dev-pack.md) |
| 2026-08-22 | (PCR 0029) grow-shrink exact-decoy door change | 109/109 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0029](pcr/0029-grow-shrink-exact-decoy-door.md) |
| 2026-08-22 | (PCR 0030) stored-start leftover fail-close door change | 110/110 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0030](pcr/0030-stored-start-leftover-fail-close-door.md) |
| 2026-08-22 | (PCR 0031) move-cross-file-dev-v0.1 pack | 111/111 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0031](pcr/0031-move-cross-file-dev-pack.md) |
| 2026-08-22 | (PCR 0032) native host context bake-off scaffold | 114/114 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0032](pcr/0032-native-host-context-bakeoff.md) |
| 2026-08-22 | (PCR 0033) budget-pressure native bake-off | 120/120 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0033](pcr/0033-budget-pressure-native-bakeoff.md) |
| 2026-08-22 | (PCR 0035) budget-pressure hermes-fresh | 125/125 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0035](pcr/0035-budget-pressure-hermes-fresh.md) |
| 2026-08-22 | (PCR 0036) budget-pressure adapter prune | 134/134 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0036](pcr/0036-budget-pressure-adapter-prune.md) |
| 2026-08-22 | (PCR 0037) always prune unserved reads | 134/134 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0037](pcr/0037-always-prune-unserved-reads.md) |
| 2026-08-22 | (PCR 0038) holdout adapter bake-off | 137/137 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0038](pcr/0038-holdout-adapter-bakeoff.md) |
| 2026-08-22 | (PCR 0040) empty envelope without boilerplate | 138/138 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0040](pcr/0040-empty-envelope-no-boilerplate.md) |
| 2026-08-22 | (PCR 0041) live DeepSeek Hermes session (docs) | n/a | n/a | n/a | n/a | n/a | n/a live host | n/a | [0041](pcr/0041-live-deepseek-hermes-session.md) |
| 2026-08-22 | (PCR 0042) Hermes zero-arg engine env defaults | 139/139 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0042](pcr/0042-hermes-zero-arg-engine.md) |
| 2026-08-22 | (PCR 0043) live Pi official-hook CLI (docs) | n/a | n/a | n/a | n/a | n/a | n/a live host | n/a | [0043](pcr/0043-live-pi-cli-official-hook.md) |
| 2026-08-22 | (PCR 0044) live Hermes ctor re-run (docs) | n/a | n/a | n/a | n/a | n/a | n/a live host | n/a | [0044](pcr/0044-live-hermes-ctor-rerun.md) |
| 2026-08-22 | (PCR 0047) live Hermes newline-fixed cell B rerun (docs) | n/a | n/a | n/a | n/a | n/a | n/a live host | n/a | [0047](pcr/0047-live-hermes-newline-cell-b.md) |
| 2026-08-23 | (PCR 0048) Hermes CLI hook skip host investigation (docs) | n/a | n/a | n/a | n/a | n/a | n/a live host | n/a | [0048](pcr/0048-hermes-cli-hook-skip.md) |
| 2026-08-23 | (PCR 0049) live Hermes CLI hook trace one-shot (docs) | n/a | n/a | n/a | n/a | n/a | n/a live host | n/a | [0049](pcr/0049-live-hermes-cli-hook-trace.md) |
| 2026-08-23 | (PCR 0050) Hermes bridge extract import failure (docs) | n/a | n/a | n/a | n/a | n/a | n/a live host | n/a | [0050](pcr/0050-hermes-bridge-extract-import.md) |
| 2026-08-23 | (PCR 0051) Live Hermes layout complete (docs) | n/a | n/a | n/a | n/a | n/a | n/a live host | n/a | [0051](pcr/0051-live-hermes-layout-complete.md) |
| 2026-08-23 | (PCR 0052) Hermes plugin install ships siblings | 141/141 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0052](pcr/0052-hermes-plugin-install-siblings.md) |
| 2026-08-23 | (PCR 0055) region single-line interior refresh | 122/122 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0055](pcr/0055-region-interior-line-refresh.md) |
| 2026-08-24 | (PCR 0059) Hermes offset/limit region + delete fail-close | 128/128 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0059](pcr/0059-offset-region-and-delete-failclose.md) |
| 2026-08-24 | `3bcbfb5` post-0059/0057 main evaluate | 132/132 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0060](pcr/0060-post-0059-evaluate.md) |
| 2026-08-24 | (PCR 0061) product main t2-append hold lock | 135/135 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0061](pcr/0061-persist-main-t2append.md) |
| 2026-08-24 | (PCR 0062) insert-above observe-then-mutate boards post-0059 | 134/134 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0062](pcr/0062-insert-above-post-0059.md) |
| 2026-08-24 | (PCR 0063) Hermes default-limit region leftover | 141/141 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0063](pcr/0063-hermes-default-limit-region.md) |
| 2026-08-24 | (PCR 0064) Hermes default limit=2000 past-EOF file-scope | 147/147 | 89.107165 | 0 | 1 | 1 | `697e74e3aef763a9c1e61f80efed86ed1fff57fab3c7426080654b574f99b644` | 1.0 | [0064](pcr/0064-hermes-default-limit-clamp.md) |

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
| 2026-08-22 | (PCR 0032) | `public-repo-holdout` / `native-host` | Native pi/hermes context bake-off scaffold on holdout v0.1; native payloads differ from adapter on all 10 cells; Hermes native-no-op (under compression threshold); not SOTA. | [0032](pcr/0032-native-host-context-bakeoff.md) |
| 2026-08-22 | (PCR 0033) | `budget-pressure-dev` / `native-host` | Budget-pressure lab pack; Hermes `compress` on all 6 cells after honest window; region recall preserved under 4k budget; pi-native ~19k bytes from fillers; draft only. | [0033](pcr/0033-budget-pressure-native-bakeoff.md) |
| 2026-08-22 | (PCR 0035) | `budget-pressure-dev` / `hermes-fresh` | Hermes FreshCtx adapter on budget-pressure cells; hermes-fresh matched region on recall/stale-bytes (0 stale); hermes-native stale on delete/interior/neovim-append; draft only. | [0035](pcr/0035-budget-pressure-hermes-fresh.md) |
| 2026-08-22 | (PCR 0036) | `budget-pressure-dev` / `adapter-prune` | Adapter request prune under 4k: hermes-fresh/pi-fresh projection-bytes match region; freshness held; ~20k→region bytes vs PCR 0035; draft only. | [0036](pcr/0036-budget-pressure-adapter-prune.md) |
| 2026-08-22 | (PCR 0037) | `budget-pressure-dev` / `adapter-prune` | Always-on adapter prune: 4k gate removed; 12k unit tests drop budget-omitted unserved reads; 6 cells still match region; draft only. | [0037](pcr/0037-always-prune-unserved-reads.md) |
| 2026-08-22 | (PCR 0038) | `public-repo-holdout` / `holdout-adapter-bakeoff` | Holdout v0.1 adapter bake-off: hermes-fresh matched region on stale/recall/bytes (10 cells); Hermes native-no-op; native stale gaps reproduced; draft only. | [0038](pcr/0038-holdout-adapter-bakeoff.md) |
| 2026-08-22 | (PCR 0039) | `public-repo-holdout` / `holdout-adapter-bakeoff` | Holdout v0.1 corvus-file column: live-run whole-file baseline; stale/recall matched region (10 cells); whole-file bytes >> region; delete cells smaller; draft only. | [0039](pcr/0039-holdout-corvus-file.md) |
| 2026-08-22 | (PCR 0040) | `public-repo-holdout` / `holdout-adapter-bakeoff` | Empty envelope without boilerplate: delete cells 164→78; other 8 cells held stale/recall; hermes-fresh matched region; draft only. | [0040](pcr/0040-empty-envelope-no-boilerplate.md) |
| 2026-08-21 | (PCR 0014) | `public-repo-holdout` | Stop pinning live unsealed jsonl; resultSetHash null; jsonl stays gitignored; historical holdout.md unchanged. | [0014](pcr/0014-unsealed-hash-anchor-refresh.md) |

Full tables: `bench/reports/latest.md`, `bench/reports/holdout.md`, `bench/reports/pi-smoke.md`, `bench/reports/hermes-smoke.md`, `bench/reports/pi-holdout.md`, `bench/reports/hermes-holdout.md`, `bench/reports/native-holdout.md`, `bench/reports/holdout-adapter-bakeoff.md`.

## Live host session

Hermes here is NousResearch/hermes-agent, not a Hermes LLM. Model is DeepSeek.
Official score is token-in-request. Cell B is a confounded region test (literal backslash-n). Not a paper result.

| UTC | FreshCtx | Hermes Agent | Pi host | Model requested / response | Cells | Note | PCR |
|---|---|---|---|---|---|---|---|
| 2026-08-22 | `4ccb0083` | `999703fd` | — | deepseek-chat / deepseek-v4-flash | 15 | File-scope current vs native stale; cell B invalid; not a paper result | [0041](pcr/0041-live-deepseek-hermes-session.md) |
| 2026-08-22 | `4ccb0083` | `999703fd` | — | deepseek-v4-flash | 1 | Post-ctor-fix plugin `f2048257`; gold miss; freshctx-state empty | [0044](pcr/0044-live-hermes-ctor-rerun.md) |
| 2026-08-22 | `4ccb0083` | — | `c49906ec` (pi 0.84.2) | deepseek-v4-flash | 16 | Official Pi hook pi-cli; 8 cells × fresh/native; not pi-adapter-replay | [0043](pcr/0043-live-pi-cli-official-hook.md) |
| 2026-08-22 | `4ccb0083` | `999703fd` | — | deepseek-v4-flash | 4 | Newline-fixed B/B2 only; B region miss; B2 file-scope fresh; not 0041 cell B | [0047](pcr/0047-live-hermes-newline-cell-b.md) |
| 2026-08-23 | `4ccb0083` | `999703fd` | — | deepseek-v4-flash | 0 | Host read-only; fail-open hook delivery; box evidence PCR 0046 | [0048](pcr/0048-hermes-cli-hook-skip.md) |
| 2026-08-23 | `4ccb0083` | `999703fd` | — | deepseek-chat | 1 | Hook trace from box files; Hermes fires hooks; adapter None; HOOK_PROBE_OK is tool payload not rewrite | [0049](pcr/0049-live-hermes-cli-hook-trace.md) |
| 2026-08-23 | `4ccb0083` | `999703fd` | — | deepseek-chat | 0 | Bridge import fail on hermes-only extract; in-tree control rc=0; not host skip | [0050](pcr/0050-hermes-bridge-extract-import.md) |
| 2026-08-23 | `4ccb0083` | `999703fd` | — | deepseek-chat | 1 | Layout-complete plugin; select list; observe ran; state populated; collision on live logs | [0051](pcr/0051-live-hermes-layout-complete.md) |
| 2026-08-23 | `4ccb0083` | `999703fd` | — | deepseek-chat | 1 | install.mjs one-shot; select list + observe; not a paper result | [0053](pcr/0053-live-hermes-install-oneshot.md) |
| 2026-08-23 | `4ccb0083` | `999703fd` | — | deepseek-chat | 1 cell (two-turn) | install.mjs t2-append put NEW in live projection; not a paper result | [0054](pcr/0054-live-hermes-install-t2-append.md) |
| 2026-08-24 | `3bcbfb5` | `999703fd` | — | deepseek-chat | 1 cell (two-turn) | product main hold; no persist-38; NEW in turn-2 projection (content-bytes=36) | [0061](pcr/0061-persist-main-t2append.md) |
| 2026-08-22 | `fa6e2011` base | `999703fd` | — | deepseek-chat (Hermes compress) | 6 | Live compress matched stub; not merged | [0034](pcr/0034-budget-pressure-live-summarizer.md) |
