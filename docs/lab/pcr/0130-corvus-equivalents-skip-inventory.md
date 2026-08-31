# PCR 0130 — CORVUS equivalents and skip inventory on PR 129

- Date (UTC): 2026-08-31
- Author / agent: Cursor Grok 4.6
- Branch / PR: `feat/corvus-equivalents-report` / [129](https://github.com/felipebasurto/freshctx/pull/129)
- Product commit: `00eeddf94d66cb6f4245a48973050cd8b97c7242`
- Merge-base: `8dc6c5b06d3e84c6339519a52b5cf39d4c954318` (PR 128 on main; that merge has no PCR)
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Door blob (`src/anchors.mjs`): `f8771c93894095348185ef3453a3c2498355b3c6` (hold)
- `repos.lock` blob: `4a953591e4b175e9fd69f13d6012831b01116dce` (hold)
- Result labels used: `measurement`; `protocol-fixture`
- Decision: **review** (stay unmerged)

## Hypothesis or change

PR 129 adds `corvusEquivalents` on EmpiricalVerdict, a TAP skip registry, and
mapping docs. PCR 0129 still holds the last written TAP line
`518 / 492 pass / 0 fail / 26 skip`. That line is stale for this branch.
PR 128 already unskipped the 16 go-tools lab boards and dropped live Hermes
official-loader tests. It shipped without a PCR. This record writes the TAP
footer measured on `00eeddf9` and the evaluate printer on that same SHA.

The mapping is a translation table. It does not authorize a “we beat CORVUS”
sentence. `passAt1` stays `null` (`out-of-scope-adr-0002`).
`cycleReductionVsCorvus` stays `0`.

## What we did

Product commit `00eeddf9` (already on PR 129) added

- `corvusEquivalents` on the EmpiricalVerdict record (`redundantReadEvents`,
  `reasoningCycles`, `finalRequestBytes`, `accumulatedPayloadBytes`,
  `executionTimeMs`). `passAt1` is `null`.
- `bench/skip-inventory.mjs` as the TAP skip registry. Bare-clone skip count
  is 0 after PR 128 vendored `test/fixtures/go-tools` and removed live Hermes
  official-loader boards. Replay boards remain.
- leftover score printers removed from live docs and `search-space.json`.
  Projector `estimatedTokens` is gone. Pack evaluate has no 0–100 `score`.
- `docs/CORVUS_MAPPING.md` plus `--report` Markdown that refuses sealed
  `results.jsonl` and apex `report.md`.
- a source pin that `extractTreeSitterUnits` deletes parser and tree in
  `finally`. Tree-sitter query matches and span math were not retuned.

This PCR commit adds only the paper trail. No edit to `src/policy.mjs`,
`src/anchors.mjs`, `src/projector.mjs`, holdout-v0.2, door, or lock.
`--relock` was not run.

## Architectural boundary

Harness and docs. Isolated Semantic Engine extract spans stay the
`holdout-v0.3-apex` lock. Door and lock blobs match the reviewer hold values.

## Benchmarks run

`npm test` footer on `00eeddf94d66cb6f4245a48973050cd8b97c7242`:

```
# tests 517
# pass 517
# fail 0
# skipped 0
```

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | TAP footer above, measured on `00eeddf9` |
| `git hash-object src/anchors.mjs bench/repos.lock.json` | yes | 0 | door `f8771c93…`; lock `4a953591…` |
| `npm run evaluate` | yes | 0 | `EVALUATE_VERDICT=PASS` on `holdout-v0.3-apex`; see snapshot |
| `holdout-v0.2` cells | no | n/a | not opened |

## Metric snapshot

| metric | PCR 0129 (last written) | this SHA `00eeddf9` | note |
|---|---|---|---|
| `npm test` TAP `# tests` | 518 | **517** | measured on `00eeddf9` |
| `npm test` TAP `# pass` | 492 | **517** | measured on `00eeddf9` |
| `npm test` TAP `# fail` | 0 | **0** | measured on `00eeddf9` |
| `npm test` TAP `# skipped` | 26 | **0** | PR 128 unskipped 16 go-tools labs and dropped live Hermes official-loader boards. This SHA adds inventory tests and keeps skip count 0. TAP for 128-alone was not re-run. |
| evaluate printer | `EVALUATE_VERDICT=PASS` | **`EVALUATE_VERDICT=PASS`** | no `AUTORESEARCH_SCORE` |
| Isolated Semantic Engine payloadBytes | 8504 | **8504** | hold |
| `corvus-file` payloadBytes | 36701 | **36701** | hold |
| payload delta | −28197 | **−28197** | hold |
| `oracleRetention` | 5/5 recall 1 | **5/5 recall 1** | hold |
| `passAt1` | (absent) | **`null`** | `out-of-scope-adr-0002` |
| `cycleReductionVsCorvus` | (absent) | **`0`** | same traces |
| door / lock | `f8771c93` / `4a953591` | hold | 0 |

## Comparison

Cited CORVUS paper metrics (Zheng et al., arXiv:2607.22711v1) live in
[CORVUS_MAPPING.md](../../CORVUS_MAPPING.md). Measured CtxBench fields are
payload bytes, required-current recall, and the aliases above. Those are
not SWE Pass@1 and not an agent-loop token study. This PCR does not claim
FreshCtx beats CORVUS.

## Conflicts with constitutions

none observed. ADR 0002 still forbids Pass@1 as a core metric. Apex extract
was not retuned.

## Limitations

- PR 128 (`8dc6c5b0`) has no PCR of its own. The skip collapse from 26 to 0
  starts there. This SHA’s TAP is the first written count after that merge.
- Laptop RSS and p95 stay telemetry. Not a publishable latency claim.
- Isolated Semantic Engine naming wave (`Isolated Semantic Engine*` symbols) is not this PCR.

## Next measurement

Reviewer reads this PCR, INDEX, and METRICS against the TAP footer above.
Do not merge 129 from this session. Do not hill-climb `src/` against
`holdout-v0.3-apex`.
