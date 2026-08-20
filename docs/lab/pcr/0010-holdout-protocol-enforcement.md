# PCR 0010 — Holdout protocol enforcement: sealed-pack gate, verify, remote attestation

- Date (UTC): 2026-08-20
- Author / agent: repository maintainers
- Branch / PR: `cursor/holdout-protocol-enforcement-3efb`
- Commit: `bbaecbc`
- Paper-manifest digest: unchanged (`442cd9e29a6550b3d539baa8522fd7c2c27fe8f9fef00d344ddf0092e5762e89`)
- Result labels used: `synthetic`; `protocol-fixture`; `unsealed-regression`

## Hypothesis or change

Extend PCR 0009 freeze→generate→run→report pipeline so **every pack presented as sealed** must pass through it, with read-only verify, CI guards, explicit classifications, legacy entrypoint restriction, and remote freeze attestation workflows.

## Bypasses closed (vs PCR 0009)

| Bypass (PCR 0009) | Closed by |
|---|---|
| Generic `protocolExempt: true` on new packs | Removed from corpus-split; `holdout:ci-guard` + tests reject `protocolExempt` on non-v0.1 manifests |
| Legacy `ctxbench:holdout` / pi / hermes / adapters for any pack | Hard-coded `holdout-v0.1` identity only; v0.2+ exits non-zero naming protocol commands |
| `build-holdout-traces.mjs` as author path for new packs | Guard refuses non-v0.1 trace dirs |
| Local freeze described as preregistered/sealed | Classifications: `candidate` → `locally-frozen` → `remotely-attested` → `sealed`; local report never `sealed` without attestation |
| Manual report editing undetected | `holdout:verify` hashes report bytes; tamper tests fail |
| Mixed manifest+traces+report introduction | `holdout:ci-guard` diff scan + negative test |
| Sealed without remote attestation | Verify fails; generate workflow requires attestation artifact |

## Remaining exceptions (honest)

| Exception | Why |
|---|---|
| Holdout v0.1 (`unsealed-regression`) | Permanent regression pack; hard-coded identity in `bench/holdout-identity.mjs` |
| Smoke board | Development test split, not independent holdout evidence (see threat model) |
| `holdout:attest-stub` | Test-only attestation shape exerciser; blocked in production CI |
| v0.1 legacy runners still execute v0.1 | Required for regression; cannot produce sealed classification or protocol-namespace artifacts |

## Legacy command behavior

| Command | v0.1 | hypothetical v0.2 / sealed |
|---|---|---|
| `ctxbench:holdout` | Runs; writes `bench/reports/holdout.md` with `unsealed-regression` provenance | **Exit non-zero** — use `holdout:freeze/generate/run/report` |
| `ctxbench:pi-holdout` / `hermes-holdout` / `adapters-holdout` | Runs on v0.1 traces | **Exit non-zero** for non-v0.1 pack |
| `scripts/build-holdout-traces.mjs` | Writes `bench/traces/holdout/` only | **Exit non-zero** for other trace dirs |
| `holdout:freeze/generate/run/report` | N/A for v0.1 | Required path for new packs |
| `holdout:verify --pack=holdout-v0.1` | Passes as `unsealed-regression`; fails if relabeled sealed | Full chain verify for protocol packs |

## Verify tampering demonstrations (tests)

- Tampered manifest hash → verify fails (`holdout-enforcement.test.mjs`)
- Tampered traces → trace-set hash mismatch
- Tampered results → result-set hash mismatch
- Hand-edited report markdown → report hash mismatch
- Forged `sealed` state without attestation → verify fails
- v0.1 corpus-split relabeled `sealed` → verify fails

## Remote attestation workflow evidence

- `.github/workflows/holdout-freeze-attest.yml` — runs on `bench/splits/**` push; writes attestation via `scripts/holdout-write-attestation.mjs`; uploads artifact
- `.github/workflows/holdout-generate.yml` — requires `freeze-attestation.json` before generate/run/report/verify
- Attestation object binds: pack ID, freeze commit SHA, manifest SHA-256, repos.lock SHA-256, repository lock SHAs, workflow run ID/URL, timestamp

## Benchmarks run

| Command | Ran? | Exit | Notes |
|---|---|---|---|
| `npm test` | yes | 0 | 61 tests (10 new enforcement tests) |
| `npm run check` | yes | 0 | |
| `npm run evaluate` | yes | 0 | `AUTORESEARCH_SCORE=89.107165` unchanged |
| `npm run ctxbench` | yes | 0 | payload sha256 unchanged |
| `npm run demo` | yes | 0 | |
| `npm run holdout:verify -- --pack=holdout-v0.1` | yes | 0 | valid unsealed-regression |
| `npm run holdout:ci-guard` | yes | 0 | on HEAD (no violations) |

## Next measurement

First **new-seed** holdout (v0.2+) using full protocol including remote freeze attestation. See [NEXT-PROMPT.md](../NEXT-PROMPT.md).

Threat model: [holdout-protocol-threat-model.md](../../decisions/holdout-protocol-threat-model.md).
