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
| [0034](pcr/0034-budget-pressure-live-summarizer.md) | 2026-08-22 | Budget-pressure live Hermes summarizer (no stub) | `synthetic`; `budget-pressure-live-dev`; `native-host` | review |
