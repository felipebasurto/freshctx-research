# PCR index

| PCR | Date (UTC) | Title | Labels | Decision |
|---|---|---|---|---|
| [0001](pcr/0001-public-log-and-lineage.md) | 2026-08-20 | Public log and smoke v0.1 lineage | `synthetic`; `public-repo-smoke` | review |
| [0002](pcr/0002-corvus-lifecycle.md) | 2026-08-20 | Documented CORVUS `sync_file` / `sync_context` | `synthetic`; `public-repo-smoke` | review |
| [0003](pcr/0003-pi-smoke-capture.md) | 2026-08-20 | Pi request-capture on smoke traces | `synthetic`; `public-repo-smoke`; `replay` | review |
| [0004](pcr/0004-hermes-smoke-capture.md) | 2026-08-20 | Hermes request-capture on smoke traces | `synthetic`; `public-repo-smoke`; `replay` | review |
| [0005](pcr/0005-corvus-deviation-table.md) | 2026-08-20 | CORVUS cited-vs-measured deviation table on smoke v0.1 | `synthetic`; `public-repo-smoke` | review |
| [0006](pcr/0006-region-grain-adapters.md) | 2026-08-20 | Region-grain Pi/Hermes adapters on smoke traces | `synthetic`; `public-repo-smoke`; `replay` | review |
| [0007](pcr/0007-sealed-holdout-protocol.md) | 2026-08-20 | Sealed holdout protocol, first execution (holdout v0.1 slice) | `synthetic`; `public-repo-smoke`; `public-repo-holdout` | review |
| [0008](pcr/0008-pi-hermes-holdout-replay.md) | 2026-08-20 | Pi/Hermes request-capture replay on holdout v0.1 | `synthetic`; `public-repo-smoke`; `public-repo-holdout`; `replay` | review |
| [0009](pcr/0009-holdout-freeze-protocol.md) | 2026-08-20 | Holdout freeze/generate/run/report pipeline invariant | `synthetic`; `protocol-fixture` | review |
| [0010](pcr/0010-holdout-protocol-enforcement.md) | 2026-08-20 | Holdout protocol enforcement: verify, CI guard, attestation, legacy restriction | `synthetic`; `protocol-fixture`; `unsealed-regression` | review |
| [0011](pcr/0011-test-hygiene-sealed-hash-gate.md) | 2026-08-20 | Test hygiene + sealed result-set hash fail-closed gate | `synthetic`; `protocol-fixture`; `unsealed-regression` | review |
| [0012](pcr/0012-devloop-wave1-rejects.md) | 2026-08-20 | WAVE 1 development lex rejects (no implementation merge) | `synthetic` | reject |
| [0013](pcr/0013-wave2-go-tools-rebase-reeval.md) | 2026-08-21 | wave2 go-tools structural consensus rebase reeval | `synthetic`; `public-repo-smoke`; `public-repo-holdout`; `replay` | accept |
| [0014](pcr/0014-unsealed-hash-anchor-refresh.md) | 2026-08-21 | stop pinning live unsealed holdout results | `synthetic`; `public-repo-smoke`; `public-repo-holdout` | review |
| [0015](pcr/0015-insert-before-dev-pack.md) | 2026-08-21 | insert-before development pack (not a public benchmark) | `synthetic`; `insert-before-dev` | review |
| [0016](pcr/0016-insert-before-interior-dev-pack.md) | 2026-08-21 | insert-before interior door pack (not a public benchmark) | `synthetic`; `insert-before-interior-dev` | review |
| [0017](pcr/0017-insert-before-tie-dev-pack.md) | 2026-08-21 | insert-before structural-tie pack (not a public benchmark) | `synthetic`; `insert-before-tie-dev` | review |
| [0018](pcr/0018-insert-before-unique-last-dev-pack.md) | 2026-08-22 | insert-before unique-last door pack (not a public benchmark) | `synthetic`; `insert-before-unique-last-dev` | review |
| [0019](pcr/0019-grow-inside-dev-pack.md) | 2026-08-22 | grow-inside development pack (not a public benchmark) | `synthetic`; `grow-inside-dev` | review |
| [0020](pcr/0020-delete-unit-dev-pack.md) | 2026-08-22 | delete-unit development pack (not a public benchmark) | `synthetic`; `delete-unit-dev` | review |
| [0021](pcr/0021-rename-boundary-dev-pack.md) | 2026-08-22 | rename-boundary development pack (not a public benchmark) | `synthetic`; `rename-boundary-dev` | review |
| [0022](pcr/0022-delete-unit-fail-close-dev-pack.md) | 2026-08-22 | delete-unit fail-close door change (not a public benchmark) | `synthetic`; `delete-unit-fail-close-dev` | review |
| [0023](pcr/0023-move-in-file-dev-pack.md) | 2026-08-22 | move-in-file development pack (not a public benchmark) | `synthetic`; `move-in-file-dev` | review |
| [0024](pcr/0024-duplicate-boundary-dev-pack.md) | 2026-08-22 | duplicate-boundary development pack (not a public benchmark) | `synthetic`; `duplicate-boundary-dev` | review |
| [0025](pcr/0025-parse-broken-dev-pack.md) | 2026-08-22 | parse-broken development pack (not a public benchmark) | `synthetic`; `parse-broken-dev` | review |
| [0026](pcr/0026-parse-broken-exact-decoy-door.md) | 2026-08-22 | parse-broken exact-decoy door change (not a public benchmark) | `synthetic`; `parse-broken-dev` | review |
| [0027](pcr/0027-move-lookalike-dev-pack.md) | 2026-08-22 | move-lookalike development pack (not a public benchmark) | `synthetic`; `move-lookalike-dev` | review |
| [0028](pcr/0028-duplicate-boundary-markers-dev-pack.md) | 2026-08-22 | duplicate-boundary-markers development pack (not a public benchmark) | `synthetic`; `duplicate-boundary-markers-dev` | review |
| [0029](pcr/0029-grow-shrink-exact-decoy-door.md) | 2026-08-22 | grow-shrink exact-decoy door change (not a public benchmark) | `synthetic`; `grow-shrink-exact-decoy-dev` | review |
| [0030](pcr/0030-stored-start-leftover-fail-close-door.md) | 2026-08-22 | stored-start leftover fail-close door change (not a public benchmark) | `synthetic`; `stored-start-leftover-fail-close-dev` | review |
| [0031](pcr/0031-move-cross-file-dev-pack.md) | 2026-08-22 | move-cross-file development pack (not a public benchmark) | `synthetic`; `move-cross-file-dev` | review |
| [0032](pcr/0032-native-host-context-bakeoff.md) | 2026-08-22 | Native host context bake-off scaffold on holdout v0.1 | `synthetic`; `public-repo-holdout`; `native-host` | review |
| [0033](pcr/0033-budget-pressure-native-bakeoff.md) | 2026-08-22 | Budget-pressure native bake-off (Hermes compress photo) | `synthetic`; `budget-pressure-dev`; `native-host` | review |
| [0034](pcr/0034-budget-pressure-live-summarizer.md) | 2026-08-22 | Budget-pressure live DeepSeek summarizer (not merged) | `synthetic`; `budget-pressure-dev`; `native-host`; `live-model` | review |
| [0035](pcr/0035-budget-pressure-hermes-fresh.md) | 2026-08-22 | Budget-pressure Hermes FreshCtx adapter (hermes-fresh) | `synthetic`; `budget-pressure-dev`; `hermes-fresh` | review |
| [0036](pcr/0036-budget-pressure-adapter-prune.md) | 2026-08-22 | Budget-pressure adapter request prune under 4k | `synthetic`; `budget-pressure-dev`; `adapter-prune` | review |
| [0037](pcr/0037-always-prune-unserved-reads.md) | 2026-08-22 | Always prune unserved read pairs on projection | `synthetic`; `budget-pressure-dev`; `adapter-prune` | review |
| [0038](pcr/0038-holdout-adapter-bakeoff.md) | 2026-08-22 | Holdout v0.1 adapter bake-off after prune | `synthetic`; `public-repo-holdout`; `holdout-adapter-bakeoff` | review |
| [0039](pcr/0039-holdout-corvus-file.md) | 2026-08-22 | Holdout v0.1 corvus-file column on adapter bake-off | `synthetic`; `public-repo-holdout`; `holdout-adapter-bakeoff` | review |
| [0040](pcr/0040-empty-envelope-no-boilerplate.md) | 2026-08-22 | Empty envelope without boilerplate prose on delete cells | `synthetic`; `public-repo-holdout`; `holdout-adapter-bakeoff` | review |
| [0041](pcr/0041-live-deepseek-hermes-session.md) | 2026-08-22 | Live DeepSeek session on Hermes Agent + FreshCtx | `synthetic`; `live-host`; `hermes-fresh` | review |
| [0042](pcr/0042-hermes-zero-arg-engine.md) | 2026-08-22 | Hermes zero-arg FreshCtxContextEngine env defaults | `synthetic`; `hermes-fresh`; `adapter-only` | review |
| [0043](pcr/0043-live-pi-cli-official-hook.md) | 2026-08-22 | Live Pi official-hook CLI (`pi-cli`) | `synthetic`; `live-host`; `pi-fresh`; `pi-cli` | review |
| [0044](pcr/0044-live-hermes-ctor-rerun.md) | 2026-08-22 | Live Hermes ctor re-run (post-ctor-fix, gold miss) | `synthetic`; `live-host`; `hermes-fresh`; `live-ctor`; `post-ctor-fix`; `pre-lifecycle-fix` | review |
| [0047](pcr/0047-live-hermes-newline-cell-b.md) | 2026-08-22 | Live Hermes newline-fixed cell B rerun (region miss) | `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `newline-fixed`; `region-miss` | review |
| [0048](pcr/0048-hermes-cli-hook-skip.md) | 2026-08-23 | Hermes CLI hook skip (host-side, fail-open delivery) | `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `host-investigation`; `fail-open-delivery` | review |
| [0049](pcr/0049-live-hermes-cli-hook-trace.md) | 2026-08-23 | Live Hermes CLI hook trace (one-shot) | `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `hook-trace`; `fail-open-delivery` | review |
| [0050](pcr/0050-hermes-bridge-extract-import.md) | 2026-08-23 | Hermes bridge extract import failure (live CLI None) | `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `extract-layout` | review |
| [0051](pcr/0051-live-hermes-layout-complete.md) | 2026-08-23 | Live Hermes layout complete (CLI list + observe) | `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `layout-complete` | review |
| [0052](pcr/0052-hermes-plugin-install-siblings.md) | 2026-08-23 | Hermes plugin install ships siblings by default | `synthetic`; `hermes-fresh`; `adapter-only`; `packaging` | review |
| [0053](pcr/0053-live-hermes-install-oneshot.md) | 2026-08-23 | Live Hermes install.mjs one-shot (CLI list + observe) | `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `pack-install` | review |
| [0054](pcr/0054-live-hermes-install-t2-append.md) | 2026-08-23 | Live Hermes install.mjs two-turn append (NEW in request) | `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `pack-install`; `t2-append` | review |
| [0055](pcr/0055-region-interior-line-refresh.md) | 2026-08-23 | Region single-line interior refresh (`stored-line-span`) | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span` | review |
| [0057](pcr/0057-multiline-region-interior.md) | 2026-08-23 | Multi-line region interior measurement (middle-only door-resolve) | `synthetic`; `hermes-fresh`; `region-refresh`; `boundary-anchors`; `multi-line`; `measurement` | review |
| [0059](pcr/0059-offset-region-and-delete-failclose.md) | 2026-08-24 | Hermes offset/limit region mapping; delete fail-close on line-count shift | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit` | review |
| [0060](pcr/0060-post-0059-evaluate.md) | 2026-08-24 | Post-0059/0057 evaluate record on main (door/lock/score unchanged) | `synthetic`; `hermes-fresh`; `region-refresh`; `measurement` | review |
| [0061](pcr/0061-persist-main-t2append.md) | 2026-08-24 | Product main holds two-turn append without persist-38 | `synthetic`; `live-host`; `hermes-fresh`; `live-cli`; `pack-install`; `t2-append`; `measurement` | review |
| [0062](pcr/0062-insert-above-post-0059.md) | 2026-08-24 | Insert-above observe-then-mutate boards post-0059 (door exact vs fail-close) | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `insert-above`; `measurement` | review |
| [0063](pcr/0063-hermes-default-limit-region.md) | 2026-08-24 | Hermes default-limit region leftover after 0059 (measurement) | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `measurement` | review |
| [0064](pcr/0064-hermes-default-limit-clamp.md) | 2026-08-24 | Hermes default limit=2000 pagination promotes past-EOF reads to file-scope | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `default-pagination` | review |
| [0065](pcr/0065-observe-after-delete-repin.md) | 2026-08-24 | Observe-after-delete re-pin triad post-0059 (measurement) | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `delete-repin`; `measurement` | review |
| [0067](pcr/0067-delete-repin-identity-leftover.md) | 2026-08-24 | Delete-repin identity leftover (header 1-1; replaced neighbor 2-2) | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `delete-repin`; `measurement` | review |
| [0066](pcr/0066-in-bounds-exact-eof-region.md) | 2026-08-24 | In-bounds exact-EOF Hermes page stays region after 0064 (measurement) | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `measurement` | review |
| [0068](pcr/0068-header-1-1-delete-reobserve.md) | 2026-08-24 | Header 1-1 observe then delete then re-observe (identity leftover) | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `delete-repin`; `measurement` | review |
| [0069](pcr/0069-exact-eof-file-scope-clamp.md) | 2026-08-25 | Hermes exact-EOF page promotes to file-scope (sibling of 0064) | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `default-pagination` | review |
| [0071](pcr/0071-exact-eof-extra-boards.md) | 2026-08-25 | Exact-EOF clamp extra boards (trailing NL; startLine=2) | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `measurement` | review |
| [0070](pcr/0070-no-over-promote-guard.md) | 2026-08-25 | Do not over-promote non-whole-file Hermes pages | `synthetic`; `hermes-fresh`; `region-refresh`; `stored-line-span`; `offset-limit`; `measurement` | review |
| [0072](pcr/0072-post-0070-evaluate.md) | 2026-08-25 | Post-0070 evaluate + holdout bakeoff (door/lock/score hold) | `synthetic`; `hermes-fresh`; `measurement` | review |
| [0073](pcr/0073-pi-offset-limit-hermes-parity.md) | 2026-08-25 | Pi offset/limit Hermes-parity clamp (adapter) | `synthetic`; `pi-fresh`; `region-refresh`; `offset-limit` | review |
| [0074](pcr/0074-live-pi-cli-confirm.md) | 2026-08-25 | Live Pi official-hook confirm post-0073 (research box) | `synthetic`; `live-host`; `pi-fresh`; `pi-cli`; `offset-limit`; `measurement` | review |
| [0075](pcr/0075-holdout-adapter-bakeoff-with-vs-without.md) | 2026-08-25 | Holdout adapter bake-off WITH vs WITHOUT (Hermes + Pi) post-0073 | `synthetic`; `hermes-fresh`; `pi-fresh`; `holdout-adapter-bakeoff`; `measurement` | review |
| [0076](pcr/0076-honest-pi-install-path.md) | 2026-08-25 | Honest Pi install path (README + fail-open + two-turn replay) | `synthetic`; `pi-fresh`; `replay`; `adapter-only` | review |
| [0077](pcr/0077-skip-unchanged-inject.md) | 2026-08-25 | Skip re-injecting unchanged unit bodies (prefix-cache path) | `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only` | review |
| [0078](pcr/0078-cat-tracked-read.md) | 2026-08-25 | Track cat-class shell reads; default budget 32k (not dump-world) | `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only` | review |
| [0079](pcr/0079-stateless-byte-exact-requests.md) | 2026-08-25 | Stateless byte-exact requests; revert 0077 marker-only bodies and metric shortcut | `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only` | review |
| [0080](pcr/0080-refresh-over-budget.md) | 2026-08-25 | Send a refreshed file even when it is larger than the cap | `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`; `live-host` | review |
| [0081](pcr/0081-stale-shell-dump.md) | 2026-08-25 | Drop piped dumps of paths already tracked | `synthetic`; `pi-fresh`; `hermes-fresh`; `replay`; `adapter-only`; `live-host` | review |
