# Plan 008: Make the file/region Isolated Semantic Engine language gate explicit, then measure widening it to Go and Rust

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fd523eb..HEAD -- src/registry.mjs ise/treesitter/parse.mjs test/pcr-0114-file-region-ise-refresh.test.mjs docs/ARCHITECTURE.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (Part B touches the apex evaluate path)
- **Depends on**: none
- **Category**: bug (Part A: documentation/invariant), experiment (Part B)
- **Planned at**: commit `fd523eb`, 2026-09-02

## Why this matters

The Isolated Semantic Engine parses Python, JavaScript, TypeScript, Go and
Rust (`ise/treesitter/parse.mjs` `LANGUAGE_BY_EXT`). The registry uses it for
**symbol** units in every language, but routes **file** and **region** units
through it only for `.py/.js/.mjs/.cjs/.ts/.tsx` — the set PCR 0114 shipped.
Go and Rust file/region reads fall back to anchor relocation. Nothing in the
code or in `docs/ARCHITECTURE.md` says this is deliberate, so a reader
comparing the two lists sees a bug, and a future contributor may "fix" it
without noticing that the apex holdout pack (`holdout-v0.3-apex`, built from
`go-tools`) sits on exactly that path: widening the gate changes the
`resolution=` attribute on Go file units and therefore the recorded payload
bytes. Part A makes the current behaviour explicit and pinned by a test
(cheap, safe). Part B is the experiment: widen to Go/Rust behind the normal
PCR workflow and keep it only if the empirical verdict and hard gates hold.

## Current state

- `src/registry.mjs:39-46`:

```js
const ISOLATED_SEMANTIC_ENGINE_TREE_SITTER_EXTENSIONS = new Set([".py", ".js", ".mjs", ".cjs", ".ts", ".tsx"]);

function semanticEngineTreeSitterLanguage(path) {
  const base = String(path).split("/").at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  const extension = dot === -1 ? "" : base.slice(dot).toLowerCase();
  return ISOLATED_SEMANTIC_ENGINE_TREE_SITTER_EXTENSIONS.has(extension);
}

// src/registry.mjs:274-282 (inside refresh)
      const semanticEngineLanguage = semanticEngineTreeSitterLanguage(unit.path);
      const semanticEngineInjected = Boolean(this.semanticEngineRunner);
      let resolved;
      if (unit.scope === "symbol") {
        resolved = await resolveSymbolUnit(unit, normalizedFile, this.semanticEngineRunner);
      } else if (semanticEngineInjected && semanticEngineLanguage && unit.scope === "file") {
        resolved = await resolveFileViaIsolatedSemanticEngine(unit.path, normalizedFile, this.semanticEngineRunner);
      } else if (semanticEngineInjected && semanticEngineLanguage && unit.scope === "region") {
        resolved = await resolveRegionViaIsolatedSemanticEngine(unit, normalizedFile, this.semanticEngineRunner);
```

- `ise/treesitter/parse.mjs:6-15` `LANGUAGE_BY_EXT` adds `".go": "go"` and
  `".rs": "rust"` to the same six extensions.

- `docs/lab/pcr/0114-file-region-ise-refresh.md` "What we did" item 1:
  "Extended `src/registry.mjs` refresh for `.py`/`.js`/`.mjs`/`.cjs`/`.ts`/`.tsx`
  when `semanticEngineRunner` is injected." No rationale for excluding Go/Rust
  is recorded.

- `docs/ARCHITECTURE.md` §"Resolver" describes the resolution hierarchy;
  at `fd523eb` it states that file/region ISE refresh applies to the
  Python/JS/TS extension set and that Go/Rust file/region units use anchors
  (added by the documentation pass that produced this plan). Part A must keep
  the code and that sentence in agreement.

- The apex evaluate path: `npm run evaluate` runs `holdout-v0.3-apex`
  (go-tools, five units, `payloadBytes.candidate` recorded in README). Any
  change to how `.go` file/region units resolve changes that number.

- Existing test: `test/pcr-0114-file-region-ise-refresh.test.mjs` (7 tests)
  covers `.py/.ts` file and region routes and fail-closed cases.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Grammars (once) | `npm run ise:install` | exit 0 |
| Gate test | `node --test test/ise-language-gate.test.mjs` | `# fail 0` |
| PCR 0114 suite | `node --test test/pcr-0114-file-region-ise-refresh.test.mjs` | `# fail 0` |
| Full suite | `npm test` | `# fail 0` |
| Evaluate | `npm run evaluate` | `EVALUATE_VERDICT=PASS`; **Part B changes `payloadBytes`** |
| Holdout parity | `npm run ctxbench:adapters-holdout` | exit 0 |

## Scope

**Part A — in scope**:
- `src/registry.mjs` — export the set (rename allowed:
  `FILE_REGION_ISE_EXTENSIONS`) and add a two-line comment naming PCR 0114 and
  this plan as the reason Go/Rust are excluded; no behaviour change.
- `test/ise-language-gate.test.mjs` (create).

**Part B — in scope** (only after Part A is merged and the operator confirms
the experiment):
- `src/registry.mjs` — add `".go", ".rs"` to the set.
- New PCR with measured deltas; `README.md`/`docs/ARCHITECTURE.md`/`docs/ROADMAP.md`
  recorded numbers and the ARCHITECTURE resolver sentence, if the change is
  accepted.

**Out of scope**:
- `ise/treesitter/*` — the parser already supports both languages.
- `bench/packs/*`, gold labels, thresholds — never in an implementation change.
- Symbol-scope behaviour (already language-agnostic).

## Git workflow

- Part A branch: `cursor/ise-language-gate-explicit`; commit
  `refactor(registry): export and pin the file/region ISE language gate`.
- Part B branch: `cursor/ise-file-region-go-rust`; commits `feat(registry): route Go/Rust file/region refresh through ISE` and `docs: PCR NNNN`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Part A

#### Step A1: Export and annotate the gate

In `src/registry.mjs` replace the constant with:

```js
/**
 * File/region units on these extensions refresh through the Isolated Semantic
 * Engine when a runner is injected (PCR 0114). Go and Rust parse in the engine
 * but are intentionally excluded here until plans/008 Part B measures the
 * effect on the go-tools apex pack; they use anchor relocation meanwhile.
 * Symbol units are language-agnostic and do not consult this set.
 */
export const FILE_REGION_ISE_EXTENSIONS = new Set([".py", ".js", ".mjs", ".cjs", ".ts", ".tsx"]);
```

and update the one use in `semanticEngineTreeSitterLanguage`.

**Verify**: `npm run check` → exit 0; `node --test test/pcr-0114-file-region-ise-refresh.test.mjs` → `# fail 0`.

#### Step A2: Pin the gate and its relationship to the parser

Create `test/ise-language-gate.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { FILE_REGION_ISE_EXTENSIONS } from "../src/registry.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("file/region ISE gate is the PCR 0114 set and a subset of what the engine parses", async () => {
  assert.deepEqual([...FILE_REGION_ISE_EXTENSIONS].sort(), [".cjs", ".js", ".mjs", ".py", ".ts", ".tsx"]);
  // Read the parser's table as text so src/ never imports ise/ (ADR 0004).
  const parser = await readFile(join(ROOT, "ise", "treesitter", "parse.mjs"), "utf8");
  for (const extension of FILE_REGION_ISE_EXTENSIONS) {
    assert.ok(parser.includes(`"${extension}":`), `${extension} missing from parse.mjs LANGUAGE_BY_EXT`);
  }
});

test("Go and Rust are parsed by the engine but excluded from file/region refresh (documented gap)", async () => {
  const parser = await readFile(join(ROOT, "ise", "treesitter", "parse.mjs"), "utf8");
  assert.ok(parser.includes('".go": "go"'));
  assert.ok(parser.includes('".rs": "rust"'));
  assert.equal(FILE_REGION_ISE_EXTENSIONS.has(".go"), false);
  assert.equal(FILE_REGION_ISE_EXTENSIONS.has(".rs"), false);
  const architecture = await readFile(join(ROOT, "docs", "ARCHITECTURE.md"), "utf8");
  assert.match(architecture, /Go and Rust file\/region units/u);
});
```

When Part B is accepted, the second test is rewritten (expected sets flip and
the ARCHITECTURE sentence changes) in the same PR — that is intentional: the
test forces the doc and the code to move together.

**Verify**: `node --test test/ise-language-gate.test.mjs` → `# pass 2`; `npm test` → `# fail 0`; `npm run evaluate` → unchanged bytes.

### Part B (experiment; operator go-ahead required)

#### Step B1: Baseline

Record `npm run evaluate` JSON (`payloadBytes`, `oracleRetention`, all
`hardGates`) and `npm run ctxbench:adapters-holdout` output at the branch base.

#### Step B2: Widen

Add `".go", ".rs"` to `FILE_REGION_ISE_EXTENSIONS`. Update the second test
in `test/ise-language-gate.test.mjs` to expect inclusion, and change the
ARCHITECTURE resolver sentence accordingly.

#### Step B3: Measure

Run `npm test`, `npm run evaluate`, `npm run ctxbench:adapters-holdout`,
`npm run bench`. Expected: hard gates still `pass`; `payloadBytes.candidate`
changes (probably up by ~17 bytes per Go file unit whose `resolution` label
changes, possibly down if ISE region relocation tightens spans). Any
`requiredRecall < 1` or gate failure means **reject**.

#### Step B4: Decide and record

Write the PCR with before/after tables. If accepted: update README /
ARCHITECTURE / ROADMAP numbers (and the living-docs literal if Plan 002 has not
landed). If rejected: revert the set, keep the PCR as a `reject` record, and
leave Part A's comment pointing at the PCR number instead of this plan.

## Test plan

- Part A: `test/ise-language-gate.test.mjs` (2 tests) — set contents, subset
  of parser table, documented Go/Rust gap sentence present in ARCHITECTURE.
- Part B: same test flipped; `npm run evaluate` verdict and gates; adapters
  holdout parity.

## Done criteria

Part A (machine-checkable):

- [ ] `rg -n "export const FILE_REGION_ISE_EXTENSIONS" src/registry.mjs` → one match
- [ ] `node --test test/ise-language-gate.test.mjs` → `# pass 2`
- [ ] `npm test` exits 0; `npm run evaluate` prints `EVALUATE_VERDICT=PASS` with unchanged `payloadBytes.candidate`
- [ ] No files outside the Part A scope are modified

Part B:

- [ ] PCR exists with baseline and candidate tables and a decision
- [ ] If accepted: living-docs and README/ARCHITECTURE/ROADMAP numbers match evaluate; `test/ise-language-gate.test.mjs` updated
- [ ] If rejected: set reverted; test unchanged from Part A; PCR marked `reject`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Part A changes any evaluate number (it must not).
- Part B is attempted without the operator's explicit go-ahead.
- Part B produces `requiredRecall < 1` or any hard gate `fail` — that is a
  reject outcome, not something to tune around.

## Maintenance notes

- Reviewers: the ARCHITECTURE resolver sentence and `FILE_REGION_ISE_EXTENSIONS`
  are tied by the test; change both or neither.
- Deferred: `.jsx` is parsed by neither table today; add it to both if a
  fixture needs it.
