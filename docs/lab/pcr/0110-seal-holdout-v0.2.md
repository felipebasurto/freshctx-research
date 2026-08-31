# PCR 0110 — Seal holdout v0.2 from production GHA attestation

- Date (UTC): 2026-08-28
- Author / agent: Cursor Grok 4.6
- Branch / PR: `pr-s/seal-holdout-v0.2`
- Freeze commit: `2bf91d83f6370b0a66a52f7d28da4d00e8df2e9c`
- Generate commit: `70df2f43be6f9bd3d72540eca5a929e355fe2db8`
- Paper-manifest digest: `442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`
- Result labels used: `protocol-fixture`; `unsealed-regression`; `measurement`
- Decision: **review**

## Hypothesis or change

Consume a production freeze attestation written only on GitHub Actions, generate
the holdout v0.2 pack on the runner, and commit that tree so clones can verify
without a runner workspace. Local laptops must not forge `sealed`.

This pack is **not a tuning set**. Do not hill-climb `src/policy.mjs`,
`src/anchors.mjs`, or `src/projector.mjs` against these cells.

## What we did

**PR-W.** `holdout-generate.yml` gained an optional `generator` input, dropped
`--fixture=synthetic`, verifies with `--attestation=`, and uploads the pack.
`contents: read` stayed. Attest YAML was not edited.

**Action-F.** `repositoryIds` is `["flask"]`. The lock file was not edited.
Freeze binds flask commit `d318b683471101618febed18996405ad26462110`.
`npm run holdout:freeze -- --manifest=bench/splits/holdout-v0.2.json --generator=holdout-v0.2`
wrote `status: "frozen"` and `classification: "candidate"`. Traces were absent
at the freeze commit. Local `holdout-write-attestation.mjs` exited 1.

Attest run **33201069400**
(`https://github.com/felipebasurto/freshctx/actions/runs/33201069400`) wrote
`bindingSha256`
`c3b37bd60d1f33072e5af410f8adcad38d760b04c9471888d243dd12469f7898`.
`workflowRunId` equals that number.

**Action-G.** Generate run **33201275503** on ref `70df2f4` with
`freeze_run_id=33201069400` and `generator=holdout-v0.2`. Sampler traces are
the in-memory fixture files (`src/alpha.py`, `src/beta.py`), not a flask tree
checkout. Verify on the runner printed `classification: "sealed"` and
`valid: true`.

**PR-S.** Copied the GHA pack and
`bench/packs/holdout-v0.2/provenance/freeze-attestation.json`. This PCR.

No `src/` edit. No rewrite of `bench/reports/holdout.md`. Score weights
unchanged.

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm run holdout:verify -- --pack=holdout-v0.2 --attestation=bench/packs/holdout-v0.2/provenance/freeze-attestation.json` | yes | 0 | `valid: true`, `classification: "sealed"` |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | `unsealed-regression` |
| `node --test test/holdout-v02.test.mjs test/holdout-enforcement.test.mjs` | yes | 0 | |
| `node bench/run.mjs` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` |
| `npm run check` | yes | 0 | |

## Metric snapshot

| metric | freeze `2bf91d8` | PCR 0110 | delta |
|---|---|---|---|
| `AUTORESEARCH_SCORE` | `89.107165` | `89.107165` | `0` |
| holdout v0.1 classify | `unsealed-regression` | `unsealed-regression` | `0` |
| holdout v0.2 classify | `candidate` (frozen) | `sealed` (GHA) | attest+generate |
| flask lock SHA | `d318b683…` | `d318b683…` | `0` |
| door blob | `f8771c93…` | `f8771c93…` | `0` |

## Comparison

No Level 4 sentence. v0.2 is a sealed protocol pack, not a public-repo
performance claim and not a hill-climb target.

## Conflicts with constitutions

none observed.

## Limitations

- Sampler still uses in-memory fixture files. The flask lock commit is the
  bound identity for ranking, not a checked-out flask snapshot.
- Trace filenames use `--` instead of `::` so artifact upload and Windows
  clones stay valid. Selectors inside the JSON keep `::file`.
- Generate.yml copies attestation into the pack only after generate/run, then
  uploads a tarball because `actions/upload-artifact` rejects colons.
- 0096/0097 still need `bench/hosts/hermes`.

## Decisions

See the table in `docs/lab/NEXT-PROMPT.md`. Binding choices: flask lock not a
new `synthetic` key; two-workflow split with `freeze_run_id`; GHA-only
production attestation; in-memory sampler fixtures; not a tuning set; pack
upload as tarball after generate.

## Next measurement

One scheduled remeasure of this sealed pack. Do not treat cells as a tuning
signal. Optional: real Tree-sitter grammars behind the existing Isolated Semantic Engine
contract.
