# Plan 001: CI runs the documentation-contract tests on docs-only changes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fd523eb..HEAD -- .github/workflows/ci.yml test/living-docs.test.mjs CONTRIBUTING.md AGENTS.md package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `fd523eb`, 2026-09-02

## Why this matters

`test/living-docs.test.mjs` is the repository's guard that public status
documents (README, ARCHITECTURE, ROADMAP) state facts that match the tree
(PCR file count, evaluate pack name, recorded payload bytes). But the CI
workflow ignores every `**.md` and `docs/**` path. A pull request that only adds
a PCR file or edits README never runs `npm test`, so the guard cannot fail
where the drift is introduced. It fails later, on an unrelated code PR, and the
author of that PR has to fix someone else's docs. PCR 0147
(`docs/lab/pcr/0147-living-docs-index-metrics-catch-up.md`) records exactly
this leftover happening once already. After this plan lands, docs-only changes
run the cheap documentation-contract tests (they take well under one second and
need no Tree-sitter install), so drift fails on the PR that causes it.

## Current state

- `.github/workflows/ci.yml` — the only CI workflow that runs tests. Lines 3–18
  today:

```yaml
on:
  push:
    branches:
      - main
      - feat/freshctx-next
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - 'LICENSE'
  pull_request:
    branches:
      - main
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - 'LICENSE'
```

  It defines two jobs: `deterministic-core` (lines 28–61, runs
  `npm --prefix ise/treesitter ci --omit=dev`, `npm run check`, `npm test`,
  `npm run bench`, `npm run ctxbench`, `npm run evaluate`, `npm run papers:list`,
  a Python compile step, `holdout:verify`, `holdout:ci-guard`) and
  `node-compatibility` (lines 63–78, `node --test test/*.test.mjs` on Node 22
  and 24).

- The documentation-contract tests. All of them read Markdown/JSON from the
  tree and import nothing outside `node:*` and `adapters/hermes/install.mjs`
  (pure Node, no grammars):
  - `test/living-docs.test.mjs` — README/ARCHITECTURE/ROADMAP facts, PCR count.
  - `test/ise-vocabulary.test.mjs` — the retired pre-ISE vocabulary is absent from tracked text (the test itself never spells the word; neither may any plan or doc).
  - `test/layout-contract.test.mjs` — `docs/LAYOUT.md` matches `package.json`
    and the Hermes install layout.
  - `test/gotchas-contract.test.mjs` — `docs/ARCHITECTURE.md` sharp-edge table.
  - `test/manifests.test.mjs` — `papers/manifest.json`, `bench/*.manifest.json`
    readability.

  Measured locally at `d95c755`:
  `node --test test/living-docs.test.mjs test/ise-vocabulary.test.mjs test/layout-contract.test.mjs test/gotchas-contract.test.mjs test/manifests.test.mjs`
  → `# pass 11`, `# fail 0`, wall clock 0.11 s.

- Repo conventions to match: workflow uses `actions/checkout@v4`,
  `actions/setup-node@v4` with `node-version: "22"`, `timeout-minutes`, and
  `permissions: contents: read`. Keep those.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install grammars (once) | `npm run ise:install` | exit 0 |
| Docs-contract tests | `node --test test/living-docs.test.mjs test/ise-vocabulary.test.mjs test/layout-contract.test.mjs test/gotchas-contract.test.mjs test/manifests.test.mjs` | `# fail 0` |
| Full suite | `npm test` | `# fail 0` |
| YAML sanity | `node -e "require('node:fs').readFileSync('.github/workflows/ci.yml','utf8')"` then visually confirm indentation; there is no YAML linter in the repo | exit 0 |

## Scope

**In scope** (the only files you should create or modify):
- `.github/workflows/docs-contract.yml` (create)
- `package.json` (one new script only, see Step 1)
- `CONTRIBUTING.md` and `AGENTS.md` (one paragraph each, see Step 3)

**Out of scope** (do NOT touch, even though they look related):
- `.github/workflows/ci.yml` — must stay byte-identical (see Step 2).
- `test/living-docs.test.mjs` and the literals it pins — that is Plan 002.
- `.github/workflows/holdout-freeze-attest.yml`, `holdout-generate.yml` —
  holdout protocol workflows; the threat model in
  `docs/decisions/holdout-protocol-threat-model.md` depends on them being
  unchanged.
- Any other `package.json` script.

## Git workflow

- Branch: `cursor/ci-docs-contract-job` (the repo uses `cursor/<slug>` for agent
  branches; humans use `feat/...`).
- One commit. Message style from `git log`: `test(ci): run docs-contract tests on docs-only changes`
  (conventional prefixes `feat|fix|bench|docs|refactor|test|chore` per
  `CONTRIBUTING.md`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `test:docs` script

In `package.json` `scripts`, add (keep alphabetical neighbours untouched; place
it directly after `"test"`):

```json
"test:docs": "node --test test/living-docs.test.mjs test/ise-vocabulary.test.mjs test/layout-contract.test.mjs test/gotchas-contract.test.mjs test/manifests.test.mjs",
```

**Verify**: `npm run test:docs` → output ends with `# pass 11` and `# fail 0`.

### Step 2: Add a `docs-contract` workflow that is never path-filtered

Do **not** edit `.github/workflows/ci.yml`. GitHub applies `paths-ignore` at
the workflow level, so a job added inside `ci.yml` could not escape the filter.
Create a second workflow file, `.github/workflows/docs-contract.yml`, with
exactly this content:

```yaml
name: docs-contract

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  docs-contract:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Documentation contracts
        run: npm run test:docs
```

`ci.yml` stays byte-identical. The new file is not covered by the drift check
because it did not exist when this plan was written.

**Verify**:
- `git diff --stat -- .github/workflows/ci.yml` → empty (unchanged).
- `node -e "const y=require('node:fs').readFileSync('.github/workflows/docs-contract.yml','utf8'); if(!/npm run test:docs/.test(y)) process.exit(1)"` → exit 0.

### Step 3: Point contributors at the new script

`CONTRIBUTING.md` has a paragraph beginning "Docs-only pull requests: CI
currently skips `**.md` and `docs/**` paths". Replace that whole paragraph
with:

```text
Docs-only pull requests run the documentation-contract tests in CI
(`.github/workflows/docs-contract.yml`); run `npm run test:docs` locally before
pushing.
```

`AGENTS.md` "Before handing off" has a sentence beginning "Docs-only changes
are skipped by CI (`paths-ignore`), so also run". Replace that sentence with
"Docs-only changes still run `npm run test:docs` in CI; run it locally when you
touched Markdown." and remove the explicit `node --test ...` command that
follows it.

**Verify**: `rg -n "npm run test:docs" CONTRIBUTING.md AGENTS.md` → one match
in each file; `rg -n "paths-ignore" CONTRIBUTING.md AGENTS.md` → no matches.

### Step 4: Full suite still green

**Verify**: `npm test` → `# fail 0`. `git status --short` shows only the
in-scope files.

## Test plan

No new test files: the change is CI wiring. The acceptance test is the workflow
itself:

- On the PR for this plan, the GitHub Checks tab must show a `docs-contract /
  docs-contract` check that ran and passed even though the PR also touches
  non-docs files.
- Optional (operator-only): open a throwaway PR that only edits `README.md` and
  confirm `docs-contract` runs while `ci / deterministic-core` is skipped.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run test:docs` exits 0 with `# pass 11`
- [ ] `npm test` exits 0
- [ ] `.github/workflows/docs-contract.yml` exists, contains `npm run test:docs`, and has no `paths-ignore`
- [ ] `git diff --stat fd523eb..HEAD -- .github/workflows/ci.yml` is empty
- [ ] `rg -n "npm run test:docs" CONTRIBUTING.md AGENTS.md` returns one match per file
- [ ] No files outside the in-scope list (plus the new workflow file) are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `paths-ignore` block in `ci.yml` no longer matches the excerpt (someone
  already changed the filter policy).
- `npm run test:docs` fails at `d95c755` before your change (pre-existing docs
  drift — fix belongs to Plan 002, not here).
- Any of the five test files imports a module outside `node:*` or
  `adapters/hermes/install.mjs` (the job would then need `npm run ise:install`;
  report instead of adding it).

## Maintenance notes

- When a new docs-contract test is added (any test whose assertions read `.md`
  files), add it to `test:docs` in `package.json`; otherwise it inherits the
  old blind spot.
- Reviewers: confirm the new workflow has `permissions: contents: read` and no
  secrets; it must remain a read-only check.
- Deferred: folding `docs-contract` into `ci.yml` would require removing the
  workflow-level `paths-ignore`, which would make every docs PR run the
  9-minute deterministic job. That trade-off was rejected for now.
