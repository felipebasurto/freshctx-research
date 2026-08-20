# Holdout protocol threat model (PCR 0010 supplement)

Status: design note accompanying PCR 0010 enforcement work.

## What this protocol defends

1. **Ordering** — Traces, runs, and reports for a new pack cannot precede a committed, hash-pinned split manifest.
2. **Reproducibility** — Local verify recomputes manifest, trace-set, result-set, and report byte hashes against recorded state.
3. **Fail-closed classification** — A pack cannot claim `sealed` or `remotely-attested` without earning that state through the protocol and (for sealed) a remote freeze attestation artifact.
4. **Legacy isolation** — Holdout v0.1 is permanently `unsealed-regression`; legacy entrypoints accept only the hard-coded v0.1 identity.

## Permanent exceptions

| Artifact | Classification | Why exempt |
|---|---|---|
| Holdout v0.1 (`bench/traces/holdout/`) | `unsealed-regression` | Predates protocol; retained for regression only via hard-coded identity |
| Smoke board (`bench/traces/smoke/`) | protocol-exempt development test | Not independent holdout evidence; separate split, not a sealed pack |
| `holdout:attest-stub` | test-only | Exercises attestation object shape in unit tests; blocked in production CI unless `--allowInCi=test-fixture` |

## What local Git checks do NOT defend

- **History rewrite** — A maintainer with force-push can reorder commits, delete attestation artifacts, or rewrite manifests. Local verify detects inconsistency on the **current tree**, not tampering across all historical views.
- **Malicious repository owner** — The owner can modify CI workflows, bypass guards temporarily, or publish fake attestations from a compromised runner. Externally credible preregistration requires verifying attestation artifacts produced by the **published** `holdout-freeze-attest` workflow on GitHub, not trust in local files alone.
- **Hand-editing Markdown** — Verify hashes report bytes; manual edits fail verify. Git does not prevent the edit attempt.

## Remote attestation role

- **Local freeze + commit** → `locally-frozen` (development / candidate runs). Local `generate` / `run` / `report` **never** reach `sealed` or `remotely-attested`, even if a JSON attestation file exists on disk.
- **A JSON file written on a laptop is not remote attestation.** `holdout-write-attestation.mjs` refuses outside GitHub Actions (`GITHUB_ACTIONS=true` + real `GITHUB_RUN_ID`). Stub objects (`stub: true`, `local-run`, example.com URLs) are ignored for classification.
- **Successful `holdout-freeze-attest` workflow** on a pushed manifest commit → uploads production attestation (numeric GHA run id + `https://github.com/.../actions/runs/<id>` URL).
- **`holdout-generate` workflow** downloads that artifact by `freeze_run_id`, validates pack ID / freeze commit / manifest hash, then may reach `sealed` only inside GHA with the downloaded production attestation.

Local protocol checks give reproducibility and fail-closed ordering. Externally credible preregistration **additionally** requires a production attestation from the published `holdout-freeze-attest` GHA run — not a file copied from a developer machine.

## Claim boundary

This protocol does **not** claim defense against a malicious repository owner who simultaneously controls code, CI, and Git history. It **does** claim that bypassing the freeze→generate→run→report path for new sealed packs requires deliberate protocol violation detectable by `holdout:verify` and `holdout:ci-guard` on the committed tree.
