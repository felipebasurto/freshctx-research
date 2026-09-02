# Implementation plans

Plans produced by the 2026-09-02 repository audit (`/improve`). Each plan is a
self-contained brief for an executor who has not seen the audit: it names the
files, quotes the current code, gives red-green tests, and lists STOP
conditions. Plans are not source code and describe no behaviour until an
executor lands them with tests and, where behaviour changes, a Public Change
Record.

Executors: run the plan's drift check first, follow the steps in order, and
update your row in the status table when done.

## Status

| Plan | Title | Priority | Effort | Risk | Category | Status |
|---|---|---|---|---|---|---|
| [001](001-ci-docs-contract-job.md) | CI runs the documentation-contract tests on docs-only changes | P1 | S | LOW | tests | done ([#166](https://github.com/felipebasurto/freshctx/pull/166)) |
| [002](002-living-docs-single-source-of-truth.md) | Living-docs facts derived from the tree and from `npm run evaluate` | P1 | M | LOW | tests | done ([#167](https://github.com/felipebasurto/freshctx/pull/167)) |
| [003](003-no-stale-inline-from-unresolved-unit.md) | A budget-omitted read is never back-filled from an unresolved unit | P1 | S | LOW | bug | done ([#168](https://github.com/felipebasurto/freshctx/pull/168), PCR 0161) |
| [004](004-hermes-bridge-fail-open-when-nothing-tracked.md) | Hermes bridge fails open when it tracked nothing; Python honours `applied` | P1 | S | MED | bug | done ([#169](https://github.com/felipebasurto/freshctx/pull/169), PCR 0162) |
| [005](005-ise-client-robustness.md) | ISE client cannot crash (EPIPE) or hang the host; bounded output | P1 | M | MED | security | done ([#170](https://github.com/felipebasurto/freshctx/pull/170), PCR 0163) |
| [006](006-shell-read-tail-head-parity.md) | `head`/`tail` spans derive from observed bytes, identically in Pi and Hermes; `-nN` parses | P2 | M | MED | bug | blocked: Step 3 (Hermes delegation) fails the sealed PCR 0088 undersized/middle `tailLines` boards — the helper derives the span from observed line count and drops the requested-`tailLines` size check; steps 1–2 only on [#171](https://github.com/felipebasurto/freshctx/pull/171) |
| [007](007-one-local-command-mirrors-ci.md) | `npm run ci` mirrors CI; `check` covers every loaded file; nvmrc/editorconfig | P2 | S | LOW | dx | done ([#172](https://github.com/felipebasurto/freshctx/pull/172); `node --check` only checks its first argument, so `check` loops per file) |
| [008](008-registry-ise-language-gate-explicit.md) | File/region ISE language gate made explicit (A), then measured for Go/Rust (B) | P3 | M | MED | bug / experiment | Part A done ([#173](https://github.com/felipebasurto/freshctx/pull/173)); Part B not started (operator go-ahead required) |

Suggested order: 001 → 002 (docs guard first, so every later plan's PCR bump
is caught), then 003 → 004 → 005 (invariant fixes, independent of each other),
then 006, 007, 008-A. 008-B needs an operator go-ahead.

## What was changed directly (not planned)

The audit was allowed to edit core documents. Landed alongside these plans:

- `README.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`: recorded apex
  payload updated from 8504 to 8589 bytes (measured on `main` 2026-09-02;
  provenance sentence added). `test/living-docs.test.mjs` literal updated to
  match — the only test-file edit.
- `docs/ARCHITECTURE.md`: resolver section states the PCR 0114 file/region
  language gate and the Go/Rust gap; sharp-edge audit gains four `FIX` rows
  pointing at plans 003–006.
- `THESIS.md` §7 and `SOUL.md`: the retired weighted replay score replaced by
  the boolean `EVALUATE_VERDICT` described in `autoresearch/CONTRACT.md`.
- `AGENTS.md`, `CONTRIBUTING.md`: bootstrap order (`ise:install` first),
  hand-off commands identical to the CI job, PCR/INDEX/METRICS/count
  checklist, docs-only caveat.
- `docs/LAYOUT.md`: rows for `scripts/`, `examples/`, `plans/`; the
  `scripts/` vs `bench/` holdout facade is named as intentional.
- `docs/decisions/0004-isolated-semantic-engine.md`: "Known gap" bullet for the
  client (plan 005 removes it).
- `docs/GLOSSARY.md`: new; terms with the file that defines each.

## Findings vetted and not planned

| Finding | Decision | Reason |
|---|---|---|
| Stable read marker says "Current content is supplied in the live projection" even when the unit is unresolved (`src/transcript.mjs`) | rejected | Marker text is deliberately revision- and state-independent so historical bytes never change across turns (prefix stability; `AGENTS.md` "Historical markers must be stable across content revisions"). The envelope carries `unresolved="N"`. Changing the sentence would alter every recorded payload hash for wording only. |
| ~15 near-identical `bench/*-lab.mjs` files | deferred | Real debt, but the labs back sealed packs and PCR provenance; consolidation risks hash churn. Do it lab-by-lab with a characterisation test each, after plans 001–005. |
| No coverage tooling | deferred | `node --test --experimental-test-coverage` can be added as a non-gating artifact; low leverage versus the invariant gaps above. |
| Tracked `bench/reports/*.md` and `autoresearch/results.tsv` are generated outputs under version control | deferred | `test/report-hygiene.test.mjs` already prevents mutation during tests; moving them needs a migration story for PCR citations. |
| Same basenames `holdout-*.mjs` in `bench/` and `scripts/` | documented | They are CLI facades over one library; `docs/LAYOUT.md` now says so. |
| `.gitignore` duplicate entries | folded | Into plan 007. |
| Hermes Python `_call_bridge` swallows every error silently | partly folded | Plan 004 makes the Python side honour `applied`; a stderr diagnostic is listed there as deferred because bridge stderr currently means fatal. |
| `adapters/pi/extension.ts` is never type-checked | deferred | Needs a TypeScript toolchain the repo does not vendor; `replay.mjs` is the tested mirror. Recorded in plan 007 maintenance notes. |
| `docs/CORVUS_MAPPING.md` / `docs/RESUMEN_ES.md` still cite 8504 | left | Dated historical narrative ("measured 2026-08-31, laptop"); not living-docs surfaces. |

## Direction options (not plans)

The audit surfaced four directions that are decisions, not fixes. Each needs
an owner and an ADR before any plan is written.

1. **Production freeze attestation for the apex pack.** Every public number is
   labelled `locally-frozen`; the roadmap's P1 gate is a real GitHub Actions
   attestation verified by `holdout:verify`. Unblocks honest "sealed" wording.
2. **Durable revision archive.** The in-memory archive loses exact-recovery on
   restart; the thesis promises recovery. Needs a storage ADR (encryption,
   retention, permissions) before code.
3. **Host compatibility matrix.** Pi and Hermes adapters are tested by replay
   against fixed message shapes, not against released host versions. Pinning
   host versions and running the smokes against them is the next evidence step
   for Level 3.
4. **Widen structural refresh to Go and Rust** (plan 008 Part B). Changes the
   apex numbers; do it as an experiment with a PCR, not as a fix.
