# Plan 002: Living-docs facts are derived from the tree and from `npm run evaluate`, not hand-copied literals

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fd523eb..HEAD -- test/living-docs.test.mjs .github/workflows/ci.yml README.md docs/ARCHITECTURE.md docs/ROADMAP.md docs/lab/INDEX.md docs/lab/METRICS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-ci-docs-contract-job.md (so the new checks actually run on docs PRs)
- **Category**: tests
- **Planned at**: commit `fd523eb`, 2026-09-02

## Why this matters

Three "living" facts appear in the public status documents and are guarded by
`test/living-docs.test.mjs`: the number of Public Change Records, the recorded
`holdout-v0.3-apex` payload bytes (candidate and whole-file baseline), and the
required-recall fraction. Today every one of them is a literal typed into the
test **and** into three or more Markdown files. Adding a PCR means editing the
test plus README plus ARCHITECTURE in lockstep; nothing compares the payload
number to what `npm run evaluate` actually prints. That already failed once in
a way the test could not see: the README said `8504 payload bytes` (measured
2026-08-31 on the feature branch) while CI on `main` printed `8589` from
2026-09-01 onward, because the vocabulary migration to the
`isolated-semantic-engine` resolution label added 17 bytes to each of the five
projected units. The test kept passing because it only checked that the prose matched
its own literal. After this plan, the PCR count is computed from disk, the
INDEX/METRICS ledgers must mention the newest PCR, and CI compares the README
table to the evaluate output it just produced.

## Current state

- `test/living-docs.test.mjs` — the guard. Relevant excerpts (line numbers at
  `fd523eb`):

```js
// lines 13-37
test("public status documents report living repository facts", async () => {
  const [readme, architecture, roadmap] = await Promise.all([
    read("README.md"),
    read("docs/ARCHITECTURE.md"),
    read("docs/ROADMAP.md"),
  ]);
  const publicStatus = `${readme}\n${architecture}\n${roadmap}`;

  assert.match(publicStatus, /156 Public Change Records/);
  // ...
  assert.match(publicStatus, /8589 payload bytes/i);
  assert.match(publicStatus, /36701 payload bytes/i);
  assert.match(publicStatus, /Required recall.*5\/5/i);
  // ...
});

// lines 60-62
  assert.match(readme, /Isolated Semantic Engine \| 8589 payload bytes/);
  assert.match(readme, /Whole-file baseline \(`corvus-file`\) \| 36701 payload bytes/);
  assert.match(readme, /Required recall was \*\*5\/5\*\*/);

// lines 73-78
test("PCR count in public status matches Markdown files on disk", async () => {
  const entries = await readdir(join(ROOT, "docs", "lab", "pcr"));
  const count = entries.filter((name) => name.endsWith(".md")).length;

  assert.equal(count, 156);
});
```

- `README.md` "Recorded evaluation" table (lines ~63–67):

```markdown
| System | Payload |
|---|---:|
| Isolated Semantic Engine | 8589 payload bytes |
| Whole-file baseline (`corvus-file`) | 36701 payload bytes |

Required recall was **5/5**.
```

  The same `8589` / `36701` / `5/5` values appear in
  `docs/ARCHITECTURE.md` (Current evidence table, "Evaluate" row) and
  `docs/ROADMAP.md` (status header). `README.md:123` and
  `docs/ARCHITECTURE.md:329` say `There are 156 Public Change Records`.

- `autoresearch/evaluate.mjs` — `npm run evaluate` prints exactly one line
  `EVALUATE_VERDICT=PASS` followed by a pretty-printed JSON record
  (`formatEvaluateOutput` in `bench/empirical-verdict.mjs`). The fields to
  compare against README are:

```json
{
  "schemaVersion": 1,
  "verdict": "PASS",
  "pack": { "id": "holdout-v0.3-apex", "classification": "locally-frozen" },
  "comparison": {
    "candidate": "isolated-semantic-engine",
    "baseline": "corvus-file",
    "payloadBytes": { "candidate": 8589, "baseline": 36701, "delta": -28112 },
    "oracleRetention": { "recall": 1, "requiredCount": 5, "hits": 5 }
  }
}
```

  (Measured at `d95c755` locally and in GitHub Actions run 33616021343 on
  `main`.) `npm run evaluate` takes about two minutes because it runs the whole
  test suite twice as a hard gate; do **not** call it from inside a test.

- `docs/lab/INDEX.md` — one Markdown table row per PCR, e.g. the last row
  begins `| [0160](pcr/0160-...) |`. `docs/lab/METRICS.md` — append-only ledger
  whose rows end with a `[NNNN](pcr/NNNN-...)` link. PCR files are named
  `docs/lab/pcr/NNNN-slug.md` with a zero-padded four-digit id.

- `.github/workflows/ci.yml` step (lines 50–51):

```yaml
      - name: Empirical evaluator
        run: npm run evaluate
```

- Conventions: tests use `node:test` + `node:assert/strict`, `ROOT` derived
  from `import.meta.url` (see the top of `test/living-docs.test.mjs`). CLI
  scripts live in `scripts/*.mjs`, start with `#!/usr/bin/env node`, parse
  `--flag=value` by hand (see `scripts/holdout-verify.mjs:11-20`), and are
  covered by `npm run check` via the `scripts/*.mjs` glob.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Grammars (once) | `npm run ise:install` | exit 0 |
| Living docs test | `node --test test/living-docs.test.mjs` | `# fail 0` |
| Syntax | `npm run check` | exit 0 |
| Full suite | `npm test` | `# fail 0` |
| Evaluate (slow, ~2 min) | `npm run evaluate > /tmp/evaluate.txt` | exit 0, first line `EVALUATE_VERDICT=PASS` |
| New checker | `node scripts/check-recorded-evaluation.mjs --input=/tmp/evaluate.txt` | exit 0, prints `recorded-evaluation: README matches evaluate (8589 / 36701 / 5/5)` |

## Scope

**In scope** (the only files you should create or modify):
- `test/living-docs.test.mjs`
- `scripts/check-recorded-evaluation.mjs` (create)
- `test/check-recorded-evaluation.test.mjs` (create)
- `.github/workflows/ci.yml` (the single "Empirical evaluator" step only)
- `package.json` (one new script)

**Out of scope** (do NOT touch, even though they look related):
- The numbers themselves in `README.md`, `docs/ARCHITECTURE.md`,
  `docs/ROADMAP.md`. If the checker reports a mismatch at HEAD, that is a STOP
  condition, not something to "fix" by editing docs in this plan.
- `autoresearch/evaluate.mjs`, `bench/empirical-verdict.mjs` and anything under
  `bench/packs/` — evaluation code and frozen packs must not change in a
  test-hygiene PR (`AGENTS.md` "Evaluation protection").
- `docs/lab/pcr/*` — historical records keep their historical numbers.

## Git workflow

- Branch: `cursor/living-docs-derived-facts`
- Commits: one per step group is fine; message style
  `test(living-docs): derive PCR count and ledger currency from disk`,
  `test(ci): compare README recorded evaluation to evaluate output`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Derive the PCR count instead of pinning it

In `test/living-docs.test.mjs`:

1. Add a helper near the top (after `read`):

```js
async function pcrIds() {
  const entries = await readdir(join(ROOT, "docs", "lab", "pcr"));
  return entries
    .filter((name) => /^\d{4}-.*\.md$/u.test(name))
    .map((name) => name.slice(0, 4))
    .sort();
}
```

2. In the first test, replace `assert.match(publicStatus, /156 Public Change Records/);`
   with:

```js
  const ids = await pcrIds();
  assert.ok(ids.length > 0, "no PCR files found");
  assert.match(readme, new RegExp(`There are ${ids.length} Public Change Records`));
  assert.match(architecture, new RegExp(`There are ${ids.length} Public Change Records`));
```

3. Replace the whole last test (`"PCR count in public status matches Markdown files on disk"`) with:

```js
test("PCR ledgers mention the newest PCR on disk", async () => {
  const ids = await pcrIds();
  const newest = ids.at(-1);
  const [index, metrics] = await Promise.all([
    read("docs/lab/INDEX.md"),
    read("docs/lab/METRICS.md"),
  ]);
  assert.match(index, new RegExp(`\\[${newest}\\]\\(pcr/${newest}-`), "INDEX.md lacks newest PCR");
  assert.match(metrics, new RegExp(`\\[${newest}\\]\\(pcr/${newest}-`), "METRICS.md lacks newest PCR");
  assert.equal(new Set(ids).size, ids.length, "duplicate PCR ids on disk");
});
```

**Verify**: `node --test test/living-docs.test.mjs` → `# fail 0`. Then
`rg -n "156" test/living-docs.test.mjs` → no matches.

### Step 2: Write the recorded-evaluation checker

Create `scripts/check-recorded-evaluation.mjs`:

```js
#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function parseEvaluateOutput(text) {
  const lines = String(text).split("\n");
  const verdictIndex = lines.findIndex((line) => line.startsWith("EVALUATE_VERDICT="));
  if (verdictIndex === -1) throw new Error("no EVALUATE_VERDICT line in evaluate output");
  const json = lines.slice(verdictIndex + 1).join("\n");
  // The JSON record ends at the first line that is exactly "}".
  const end = json.indexOf("\n}\n");
  const record = JSON.parse(end === -1 ? json : json.slice(0, end + 2));
  const bytes = record?.comparison?.payloadBytes;
  const recall = record?.comparison?.oracleRetention;
  if (!bytes || !recall) throw new Error("evaluate record lacks comparison.payloadBytes/oracleRetention");
  return {
    candidate: bytes.candidate,
    baseline: bytes.baseline,
    hits: recall.hits,
    required: recall.requiredCount,
  };
}

export function parseReadmeRecordedEvaluation(readme) {
  const candidate = /\| Isolated Semantic Engine \| (\d+) payload bytes \|/u.exec(readme);
  const baseline = /\| Whole-file baseline \(`corvus-file`\) \| (\d+) payload bytes \|/u.exec(readme);
  const recall = /Required recall was \*\*(\d+)\/(\d+)\*\*/u.exec(readme);
  if (!candidate || !baseline || !recall) {
    throw new Error("README.md Recorded evaluation table not found in the expected shape");
  }
  return {
    candidate: Number(candidate[1]),
    baseline: Number(baseline[1]),
    hits: Number(recall[1]),
    required: Number(recall[2]),
  };
}

export function compareRecordedEvaluation(measured, recorded) {
  const mismatches = [];
  for (const key of ["candidate", "baseline", "hits", "required"]) {
    if (measured[key] !== recorded[key]) {
      mismatches.push(`${key}: README says ${recorded[key]}, evaluate printed ${measured[key]}`);
    }
  }
  return mismatches;
}

function parseArgs(argv) {
  const flags = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    flags[eq === -1 ? arg.slice(2) : arg.slice(2, eq)] = eq === -1 ? true : arg.slice(eq + 1);
  }
  return flags;
}

// Same CLI-detection idiom as autoresearch/evaluate.mjs:119-120.
const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const flags = parseArgs(process.argv);
  if (typeof flags.input !== "string") {
    process.stderr.write("usage: check-recorded-evaluation --input=<file with npm run evaluate stdout>\n");
    process.exit(2);
  }
  const measured = parseEvaluateOutput(await readFile(flags.input, "utf8"));
  const recorded = parseReadmeRecordedEvaluation(await readFile(join(ROOT, "README.md"), "utf8"));
  const mismatches = compareRecordedEvaluation(measured, recorded);
  if (mismatches.length > 0) {
    process.stderr.write(`recorded-evaluation: README.md is stale\n  ${mismatches.join("\n  ")}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `recorded-evaluation: README matches evaluate (${measured.candidate} / ${measured.baseline} / ${measured.hits}/${measured.required})\n`,
  );
}
```

Add to `package.json` scripts, directly after `"evaluate"`:

```json
"evaluate:check-docs": "node scripts/check-recorded-evaluation.mjs",
```

**Verify**: `npm run check` → exit 0 (the `scripts/*.mjs` glob now covers the
new file). `npm run evaluate > /tmp/evaluate.txt && node scripts/check-recorded-evaluation.mjs --input=/tmp/evaluate.txt`
→ prints `recorded-evaluation: README matches evaluate (8589 / 36701 / 5/5)`.

### Step 3: Unit-test the checker without running evaluate

Create `test/check-recorded-evaluation.test.mjs` modelled on
`test/living-docs.test.mjs` (same imports, same `ROOT` idiom):

- `parseEvaluateOutput` on a fixture string
  `"EVALUATE_VERDICT=PASS\n{\n  \"comparison\": {\n    \"payloadBytes\": { \"candidate\": 1, \"baseline\": 2 },\n    \"oracleRetention\": { \"hits\": 3, \"requiredCount\": 4 }\n  }\n}\n"`
  returns `{ candidate: 1, baseline: 2, hits: 3, required: 4 }`.
- `parseEvaluateOutput("hello")` throws (`assert.throws`).
- `parseReadmeRecordedEvaluation(await read("README.md"))` returns numbers
  (`Number.isInteger` on all four fields) — this pins the README table shape.
- `compareRecordedEvaluation({candidate:1,baseline:2,hits:3,required:4}, {candidate:9,baseline:2,hits:3,required:4})`
  returns one message containing `candidate`.
- `compareRecordedEvaluation(x, x)` returns `[]`.

**Verify**: `node --test test/check-recorded-evaluation.test.mjs` → `# pass 5`,
`# fail 0`.

### Step 4: Wire the checker into CI after evaluate

In `.github/workflows/ci.yml`, replace the single step

```yaml
      - name: Empirical evaluator
        run: npm run evaluate
```

with

```yaml
      - name: Empirical evaluator
        run: |
          set -o pipefail
          npm run evaluate | tee /tmp/evaluate.txt
      - name: README recorded evaluation matches evaluate
        run: npm run evaluate:check-docs -- --input=/tmp/evaluate.txt
```

No other line in `ci.yml` changes.

**Verify**: `git diff --stat -- .github/workflows/ci.yml` → exactly one file,
and `git diff -- .github/workflows/ci.yml | rg -c '^[-+][^-+]'` → `6` (one
removed line, five added).

### Step 5: Full suite

**Verify**: `npm test` → `# fail 0`; `npm run check` → exit 0;
`git status --short` lists only in-scope files.

## Test plan

- `test/living-docs.test.mjs`: derived PCR count (fails if README/ARCHITECTURE
  count is stale), newest-PCR presence in INDEX and METRICS, no duplicate ids.
- `test/check-recorded-evaluation.test.mjs`: five unit tests listed in Step 3.
- CI end-to-end: the new "README recorded evaluation matches evaluate" step
  passes on the PR. To see it fail deliberately (operator-only), edit the
  README number in a scratch branch and observe the step exit 1 with the
  `README.md is stale` message.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg -n "156|8589|36701" test/living-docs.test.mjs` → matches only for
      `8589`/`36701` inside the README-table assertions that remain (see
      Maintenance notes), and no `156`
- [ ] `node --test test/living-docs.test.mjs test/check-recorded-evaluation.test.mjs` → `# fail 0`
- [ ] `npm run evaluate > /tmp/evaluate.txt && npm run evaluate:check-docs -- --input=/tmp/evaluate.txt` exits 0
- [ ] `npm test` exits 0; `npm run check` exits 0
- [ ] `ci.yml` contains `evaluate:check-docs` exactly once
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run evaluate` at HEAD prints a `payloadBytes.candidate` other than the
  README value (the docs are stale again; the plan's premise is a doc fix that
  must be its own reviewed change, with a PCR row).
- `npm run evaluate` prints a JSON shape without `comparison.payloadBytes`
  (evaluate output contract changed; update the plan, not the evaluator).
- `docs/lab/INDEX.md` or `docs/lab/METRICS.md` does not mention the newest PCR
  at HEAD (pre-existing ledger drift; report it, do not edit the ledgers here).
- The README table regexes fail to match at HEAD.

## Maintenance notes

- The literal `8589` / `36701` / `5/5` assertions may stay in
  `test/living-docs.test.mjs` if you prefer, because CI now cross-checks them
  against the live evaluate output; but every time the projection format
  changes (a new unit attribute, a renamed `resolution` value), expect the
  checker step to fail until README/ARCHITECTURE/ROADMAP are updated **and** a
  PCR records the new measurement. That is the intended behaviour.
- Reviewers: confirm the CI step runs *after* evaluate and consumes the same
  stdout; a re-run of evaluate would double CI time.
- Deferred: `docs/CORVUS_MAPPING.md` and `docs/RESUMEN_ES.md` also cite the
  apex numbers with dates; they are historical narrative and are intentionally
  not checked.
