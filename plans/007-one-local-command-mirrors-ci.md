# Plan 007: One local command runs what CI runs, and `check` covers every file CI loads

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fd523eb..HEAD -- package.json .github/workflows/ci.yml .gitignore CONTRIBUTING.md AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-ci-docs-contract-job.md (adds `test:docs`, which `ci` should include)
- **Category**: dx
- **Planned at**: commit `fd523eb`, 2026-09-02

## Why this matters

`CONTRIBUTING.md` tells contributors to run `npm test`, `npm run check`,
`npm run evaluate`, `npm run ctxbench`, `npm run demo` and the two smokes. CI
additionally runs `npm run bench`, `npm run papers:list`, a Python compile of
the Hermes plugin, `holdout:verify` and `holdout:ci-guard`. A branch can be
"green locally" and fail CI on a step nobody was told about. Separately,
`npm run check` and CI compile different Python files (`check` compiles the two
bench scripts, CI compiles only `adapters/hermes/__init__.py`), and `check`
skips `adapters/pi/codec.mjs` (460 lines), all 49 `docs/lab/**/*.mjs`
harnesses, and every file under `test/`. All of those currently pass
`node --check` (verified at `d95c755`), so widening the glob is free today and
prevents a syntax error from surfacing only when a test happens to import the
file. This plan adds `npm run ci` that mirrors the `deterministic-core` job in
order, makes both sides compile the same Python list, adds `.nvmrc` and
`.editorconfig`, and dedupes `.gitignore`.

## Current state

- `package.json` `scripts.check` (one line):

```json
"check": "node --check src/*.mjs && node --check bench/*.mjs && node --check autoresearch/*.mjs && node --check examples/*.mjs && node --check scripts/*.mjs && node --check capture/*.mjs && node --check adapters/*.mjs && node --check adapters/pi/replay.mjs && node --check adapters/hermes/bridge.mjs && node --check adapters/hermes/replay.mjs && node --check adapters/hermes/install.mjs && node --check adapters/hermes/verify-layout.mjs && node --check ise/treesitter/*.mjs && python3 -m py_compile bench/hermes-native-bridge.py bench/python-ast-oracle.py"
```

  `node --check` accepts multiple files; shell globs are expanded by `sh`
  (npm runs scripts through `sh -c`, so `**` is **not** recursive — use
  explicit directories or `find`).

- `.github/workflows/ci.yml` `deterministic-core` steps, in order:
  `npm --prefix ise/treesitter ci --omit=dev` → `npm run check` → `npm test` →
  `npm run bench` → `npm run ctxbench` → `npm run evaluate` →
  `npm run papers:list` → `python -m py_compile adapters/hermes/__init__.py` →
  `npm run holdout:verify -- --pack=holdout-v0.1` →
  `git fetch origin main && npm run holdout:ci-guard -- --base=origin/main`.

- `.gitignore` has `.freshctx/` at lines 5 and 12 and `*.tmp` at lines 11 and 14.

- `package.json` `engines.node` is `>=22`; CI matrix tests 22 and 24. There is
  no `.nvmrc`, `.node-version`, or `.editorconfig`. Source files use two-space
  indentation, LF, UTF-8, trailing newline (observed across `src/`, `adapters/`,
  `test/`).

- `CONTRIBUTING.md` "Before opening a pull request", item 4, lists the CI
  commands in a fenced block; `AGENTS.md` "Before handing off" repeats the same
  block. Plan 001 adds `npm run test:docs` to both.

- Python: `python3` 3.12 locally; CI uses `python` (ubuntu-latest provides
  both names). Keep `python3` in `package.json` for macOS/Linux parity and let
  CI call `npm run check` instead of its own `python -m py_compile` step.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Grammars (once) | `npm run ise:install` | exit 0 |
| Syntax | `npm run check` | exit 0 |
| New aggregate | `npm run ci` | exit 0 after ~10 minutes; prints each sub-step |
| Full suite | `npm test` | `# fail 0` |

## Scope

**In scope** (the only files you should create or modify):
- `package.json` (`check`, new `check:py`, new `ci`)
- `.github/workflows/ci.yml` (remove the now-redundant Python step; nothing else)
- `.gitignore`
- `.nvmrc` (create), `.editorconfig` (create)
- `CONTRIBUTING.md` and `AGENTS.md` (replace the command block with `npm run ci`)

**Out of scope** (do NOT touch, even though they look related):
- Any test, bench, or adapter source.
- Adding a linter or formatter (ESLint/Prettier) — the repo is stdlib-only by
  policy and a formatter would reformat the whole tree; that is a separate
  decision.
- `.github/workflows/holdout-*.yml`.
- `adapters/pi/extension.ts` type-checking — needs a TypeScript toolchain the
  repo does not vendor; record as deferred in Maintenance notes.

## Git workflow

- Branch: `cursor/one-command-ci`
- Commits: `chore: check covers pi codec, lab harnesses, tests; unified py_compile list`,
  `chore: npm run ci mirrors deterministic-core; nvmrc, editorconfig, gitignore dedupe`,
  `docs(contributing): point at npm run ci`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Widen `check` and unify Python compilation

In `package.json`, replace the `check` script with two scripts:

```json
"check:py": "python3 -m py_compile bench/hermes-native-bridge.py bench/python-ast-oracle.py adapters/hermes/__init__.py",
"check": "node --check src/*.mjs bench/*.mjs autoresearch/*.mjs examples/*.mjs scripts/*.mjs capture/*.mjs adapters/*.mjs adapters/pi/*.mjs adapters/hermes/*.mjs ise/treesitter/*.mjs test/*.mjs test/helpers/*.mjs && node --check $(find docs/lab -name '*.mjs') && npm run -s check:py",
```

Notes:
- `node --check a.mjs b.mjs` works on Node 22+; one invocation per group is
  faster than the current chain.
- `find docs/lab -name '*.mjs'` is expanded by `sh`; 49 files at `fd523eb`.
- `adapters/hermes/*.mjs` covers `bridge`, `replay`, `install`, `verify-layout`
  and any future sibling.

**Verify**: `npm run check` → exit 0, no output besides npm's echo. Then
introduce a deliberate syntax error in `adapters/pi/codec.mjs` (e.g. append
`}`), run `npm run check` → exit non-zero mentioning `codec.mjs`; revert with
`git checkout -- adapters/pi/codec.mjs`.

### Step 2: `npm run ci`

Add to `package.json` scripts (after `check`):

```json
"ci": "npm run -s check && npm test && npm run -s test:docs && npm run -s bench && npm run -s ctxbench && npm run -s evaluate && npm run -s papers:list && npm run -s holdout:verify -- --pack=holdout-v0.1 && npm run -s holdout:ci-guard -- --base=origin/main",
```

If Plan 001 has not landed yet, omit `npm run -s test:docs` and add it when it
does. `holdout:ci-guard` needs `origin/main` to exist locally; document in
CONTRIBUTING that contributors run `git fetch origin main` first (CI already
does).

In `.github/workflows/ci.yml`, delete the two lines

```yaml
      - name: Hermes Python scaffold compiles
        run: python -m py_compile adapters/hermes/__init__.py
```

(the file is now compiled by `npm run check` in the "Syntax" step). Do not
replace the individual CI steps with `npm run ci`: keeping them separate
preserves per-step timing and failure attribution in the Checks UI.

**Verify**: `git fetch origin main && npm run ci` → exit 0. Expect roughly the
same wall clock as the CI job (~9–10 minutes; evaluate alone is ~2 minutes).
`git diff -- .github/workflows/ci.yml | rg -c '^-[^-]'` → `2`.

### Step 3: Editor and runtime pins

Create `.nvmrc` containing exactly `22` and a newline.

Create `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.py]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

Dedupe `.gitignore`: remove the second `.freshctx/` (line 12) and the second
`*.tmp` (line 14). Keep order otherwise.

**Verify**: `sort .gitignore | uniq -d` → empty. `cat .nvmrc` → `22`.

### Step 4: CONTRIBUTING

In `CONTRIBUTING.md` item 4, replace the fenced command block and its lead-in
sentence with:

```markdown
4. Run `git fetch origin main && npm run ci`. It mirrors the `deterministic-core`
   CI job step for step (`check`, `test`, `test:docs`, `bench`, `ctxbench`,
   `evaluate`, `papers:list`, `holdout:verify`, `holdout:ci-guard`) and takes
   about ten minutes. Run `npm run demo`, `npm run ctxbench:pi-smoke`, and
   `npm run ctxbench:hermes-smoke` as well when you touched an adapter.
```

In `AGENTS.md` "Before handing off", replace the fenced command block with the
single line `git fetch origin main && npm run ci` and keep the sentence that
follows it. Keep all other wording.

**Verify**: `rg -n "npm run ci" CONTRIBUTING.md AGENTS.md` → one match each;
`node --test test/layout-contract.test.mjs test/living-docs.test.mjs` →
`# fail 0` (these tests read CONTRIBUTING/LAYOUT; if one asserts on the old
command list, STOP and report rather than editing the test).

## Test plan

No new tests. Acceptance is:
- `npm run check` catches an injected syntax error in `adapters/pi/codec.mjs`
  and in a `docs/lab/**/*.mjs` file (do the second injection too, revert).
- `npm run ci` passes end-to-end locally.
- CI `deterministic-core` passes with the Python step removed (the Syntax step
  now covers it).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run check` exits 0 and `rg -n '"check":' package.json` shows `adapters/pi/*.mjs`, `test/*.mjs`, and `find docs/lab`
- [ ] `rg -n "adapters/hermes/__init__.py" package.json` → one match (in `check:py`)
- [ ] `rg -n "py_compile" .github/workflows/ci.yml` → no matches
- [ ] `npm run ci` exits 0 locally
- [ ] `.nvmrc` and `.editorconfig` exist; `sort .gitignore | uniq -d` is empty
- [ ] `npm test` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run check` fails at `fd523eb` after widening (a real syntax error
  exists in a previously unchecked file — report it; fixing it is a separate
  change).
- `node --check` with multiple file arguments is rejected by the Node version
  in use (fall back to one `node --check` per group and note it).
- A test asserts the literal CONTRIBUTING command list.

## Maintenance notes

- Any new top-level directory with `.mjs` files must be added to `check`;
  reviewers should ask for it when they see a new directory.
- `adapters/pi/extension.ts` remains unchecked. Options: vendor `typescript`
  as a devDependency (breaks "no runtime deps"? — devDependencies are allowed
  by policy but the repo has none today; discuss), or keep `replay.mjs` as the
  tested mirror and accept the gap. Record the decision in an ADR if you add a
  toolchain.
- `npm run ci` intentionally duplicates the CI step list rather than being
  invoked by CI, so that CI keeps per-step attribution. When you add a CI
  step, add it to `ci` too.
