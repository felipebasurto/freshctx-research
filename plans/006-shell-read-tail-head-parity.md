# Plan 006: `head`/`tail` shell reads derive their line span from the observed bytes, identically in Pi and Hermes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4b3991a..HEAD -- adapters/shell-read.mjs adapters/hermes/bridge.mjs adapters/pi/replay.mjs adapters/pi/extension.ts test/pcr-0081-stale-shell-dump.test.mjs test/pcr-0085-hermes-taillines-fake-head.test.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `fd523eb`, 2026-09-02
- **Revised**: 2026-09-02, after the first execution stopped at Step 3
  ([PR #171](https://github.com/felipebasurto/freshctx/pull/171)). The
  revision-1 helper derived the span from the *observed* line count and never
  compared it with the *requested* count, so the sealed PCR 0088 Hermes boards
  (undersized and middle `tailLines` payloads) started minting units instead of
  failing closed. This revision adds the size check (section "Size check",
  below). Steps 1–2 of revision 1 are already committed on
  `grok/plan-006-head-tail-parity` (`848152b`, `119f977`); the executor
  continues from there rather than starting over.

## Size check (why revision 1 was blocked)

PCR 0088 sealed this Hermes behaviour for `read_file` with `tailLines: N`: the
observation must be exactly the last `min(N, bodyLines)` lines of the file;
fewer lines (a truncated tool result), more lines (a middle slice), or an extra
blank line all fail closed (`invalidTailObservation`, `unresolved="1"`, no EOF
tail id minted). Deriving the span from the observed line count alone accepts
the first two of those, because "the last 1 line of the file" is trivially a
valid file slice. The helper must therefore require

```
observedLines.length === Math.min(requested, fileBody.length)
```

where `requested` is `parsed.tailLines` for `tail` and `parsed.endLine` for
`head` (the parser encodes `head -n N` as `{ startLine: 1, endLine: N }`). Only
after the size check does the content comparison run. This keeps every Pi test
from revision 1 green (all six observations are exactly `min(N, body)` lines)
and restores the PCR 0088 boards on the Hermes side.

## Why this matters

A tracked region's identity is `sha256(path, scope, selector/lines)`
(`src/hash.mjs`), and the projection prints `lines="start-end"`. When the
Pi adapter and the Hermes adapter see the same `tail -n 2 file` read they must
produce the same unit, and that unit must describe the bytes the model
actually saw. Today they do not agree, and neither validates:

- Pi (`adapters/shell-read.mjs`) uses `startLine = fileLineCount - n + 1` with
  no check against the observed bytes. Because `lineCount()` counts the empty
  string after a trailing newline, a 3-line file with a trailing newline has
  `fileLineCount = 4`, and `tail -n 2` is recorded as lines 3–4 while the tool
  output was lines 2–4. Reproduced at `d95c755`: file `"a\nb\nc\n"`,
  observed `"b\nc\n"`, tracked `startLine: 3, endLine: 4`.
- Hermes (`adapters/hermes/bridge.mjs`) uses `startLine = fileLineCount - n`
  and fails closed when the slice does not equal the observed text. That is
  right for trailing-newline files and wrong (fail-closed, no unit) for files
  without one.
- Both share `lineCountFlag`, which understands `-n 2` and `-2` but not the
  common attached form `-n2`; that form silently falls back to `n = 10`.
  Reproduced: `head -n2 f.txt` on a 4-line file tracks `startLine: 1,
  endLine: 10`.

After this plan, one exported helper derives the span from the observed
content (`tail`: last *k* observed lines; `head`: first *k*), requires the
observation to have exactly `min(requested, bodyLines)` lines, verifies the
file slice matches, and fails closed otherwise; both adapters call it; `-nN`
and `--lines=N` parse.

## Current state

- `adapters/shell-read.mjs`:

```js
// lines 164-184
function lineCountFlag(tokens) {
  let lineCount = 10;
  for (let index = 1; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token === "-n") {
      const next = parsePositiveInt(tokens[index + 1]);
      if (next == null) return null;
      lineCount = next;
      index += 1;
      continue;
    }
    const shortFlag = /^-(\d+)$/u.exec(token);
    if (shortFlag) {
      const next = parsePositiveInt(shortFlag[1]);
      if (next == null) return null;
      lineCount = next;
    }
  }
  return lineCount;
}

// lines 237-252 (inside parseShellFileRead)
  if (verb === "head") {
    const path = singlePathFromTokens(tokens);
    if (!path) return null;
    const lineCount = lineCountFlag(tokens);
    if (lineCount == null) return null;
    return { path, scope: "region", startLine: 1, endLine: lineCount };
  }

  if (verb === "tail") {
    const path = singlePathFromTokens(tokens);
    if (!path) return null;
    const lineCount = lineCountFlag(tokens);
    if (lineCount == null) return null;
    return { path, scope: "region", tailLines: lineCount };
  }

// lines 268-278
function normalizeTailRegion(parsed, fileLineCount) {
  if (parsed.scope !== "region" || parsed.tailLines == null) return parsed;
  const tailLines = parsed.tailLines;
  const startLine = Math.max(1, fileLineCount - tailLines + 1);
  return { path: parsed.path, scope: "region", startLine, endLine: fileLineCount };
}

// lines 304-325 (inside tryTrackShellRead)
    const file = await safeWorkspaceFile(cwd, parsed.path);
    const observedFileLineCount = lineCount(file.content);
    const scopeMeta = parsed.scope === "region"
      ? normalizeTailRegion(parsed, observedFileLineCount)
      : parsed;

    if (scopeMeta.scope === "region") {
      const observed = observedToolContent(content);
      if (!observed) return false;
      const unit = engine.trackRead({
        path: file.path,
        content: observed,
        scope: "region",
        startLine: scopeMeta.startLine,
        endLine: scopeMeta.endLine,
        observedFileLineCount,
      });
```

- `adapters/hermes/bridge.mjs:101-129`:

```js
function tailSpanContent(fileContent, startLine, endLine) {
  return splitLines(fileContent).slice(startLine - 1, endLine).join("\n");
}

function tailRegionFromObservation(scopeMeta, fileContent, observedContent) {
  if (!scopeMeta || scopeMeta.scope !== "region" || !Number.isInteger(scopeMeta.tailLines)) {
    return scopeMeta;
  }
  const fileLineCount = lineCount(fileContent);
  if (!Number.isInteger(fileLineCount) || fileLineCount < 1) return scopeMeta;
  const observedText = typeof observedContent === "string" ? observedContent.replaceAll("\r\n", "\n") : "";
  const startLine = Math.max(1, fileLineCount - scopeMeta.tailLines);
  if (tailSpanContent(fileContent, startLine, fileLineCount) !== observedText) {
    return { scope: "region", selector: scopeMeta.selector, tailLines: scopeMeta.tailLines, invalidTailObservation: true };
  }
  return { scope: "region", startLine, endLine: fileLineCount, selector: scopeMeta.selector, tailLines: scopeMeta.tailLines };
}
```

  Called once, at line 477, from `scopeFromObservation`. The
  `invalidTailObservation` flag is consumed by
  `failClosedInvalidTailObservationUnits` (line ~729) and by
  `test/pcr-0133-*`/`pcr-0136-*` Hermes tail tests — grep `invalidTailObservation`
  in `test/` before changing the flag's shape; keep the flag.

- Callers of `tryTrackShellRead`: `adapters/pi/replay.mjs:260` and
  `adapters/pi/extension.ts:219`. Both pass `observedToolContent` and
  `lineCount` helpers. `adapters/pi/replay.mjs:115` `lineCount` is
  `split("\n").length` after CRLF normalisation — identical to the Hermes one.

- Existing shell-read tests: `test/pcr-0081-stale-shell-dump.test.mjs`
  (pipes refused), `test/pcr-0100-*` and `test/pcr-0102-*` (`head -n N` with
  a space). There is **no** test for `tail` on the Pi path and none for `-nN`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Grammars (once) | `npm run ise:install` | exit 0 |
| New tests | `node --test test/shell-read-head-tail.test.mjs` | `# fail 0` |
| Shell-read regressions | `node --test test/pcr-0081-stale-shell-dump.test.mjs test/pcr-0100-over-cap-unchanged-collapse.test.mjs test/pcr-0102-later-turn-quoteability-characterization.test.mjs` | `# fail 0` |
| Hermes tail regressions | `node --test $(rg -l invalidTailObservation test)` | `# fail 0` |
| Full suite | `npm test` | `# fail 0` |
| Evaluate | `npm run evaluate` | `EVALUATE_VERDICT=PASS`, bytes unchanged |

## Scope

**In scope** (the only files you should create or modify):
- `adapters/shell-read.mjs`
- `adapters/hermes/bridge.mjs` (only `tailRegionFromObservation` and its two helpers; keep the exported names and the `invalidTailObservation` flag)
- `test/shell-read-head-tail.test.mjs` (exists; append one test)
- PCR record + INDEX/METRICS + PCR count bump in `README.md` and
  `docs/ARCHITECTURE.md` (procedure as in Plan 003 Step 4), plus the
  `docs/ARCHITECTURE.md` sharp-edge row for this finding
- `plans/README.md` (status row for 006 only)

**Out of scope** (do NOT touch, even though they look related):
- `adapters/pi/replay.mjs`, `adapters/pi/extension.ts` — call sites need no change.
- `src/hash.mjs`, `src/registry.mjs` — unit identity rules stay.
- `sed -n` parsing, dump-verb detection, pipe refusal — unchanged.
- Hermes official `read_file` `offset/limit` scope math (`normalizeHermesReadScope`) — separate rule set (PCR 0064/0069).

## Git workflow

- Branch: `grok/plan-006-head-tail-parity` (exists; holds revision-1 Steps 1–2).
  First `git rebase grok/plan-008a-ise-language-gate` so the PCR count and
  `plans/README.md` row start from the top of the stack (159 PCRs), then
  retarget PR #171's base to `grok/plan-008a-ise-language-gate`.
- Commits on top of the rebased branch:
  `test(shell-read): observed head/tail span must have the requested line count` (red),
  `fix(adapters): size check in observedSpanForShellRead; Hermes tail delegates to it` (green),
  `docs: PCR 0164 record`.
- Do NOT force-push anything other than the rebase of this branch, and do not
  touch the other `grok/plan-*` branches.

## Steps

### Step 1: Red tests

`test/shell-read-head-tail.test.mjs` already exists on the branch with the six
tests below. Append this seventh test, which is red against the revision-1
helper (it returns `{ startLine: 3, endLine: 4 }` for the undersized case and
`{ startLine: 1, endLine: 4 }` for the oversized one):

```js
test("observedSpanForShellRead fails closed when the observation has the wrong line count", () => {
  // Undersized: tail -n 2 but the tool result shows one line (truncated output).
  assert.equal(observedSpanForShellRead({ scope: "region", tailLines: 2 }, FILE_NL, "c\n"), null);
  // Oversized: tail -n 2 but the tool result shows three lines (a middle slice is not a tail).
  assert.equal(observedSpanForShellRead({ scope: "region", tailLines: 2 }, FILE_NL, "a\nb\nc\n"), null);
  // Extra blank line after the tail.
  assert.equal(observedSpanForShellRead({ scope: "region", tailLines: 2 }, FILE_NL, "b\nc\n\n"), null);
  // head -n 2 that shows three lines.
  assert.equal(observedSpanForShellRead({ scope: "region", startLine: 1, endLine: 2 }, FILE_NL, "a\nb\nc\n"), null);
  // Requested more than the file has: the whole body is the only valid observation.
  assert.deepEqual(observedSpanForShellRead({ scope: "region", tailLines: 10 }, FILE_NL, "a\nb\nc\n"), { startLine: 1, endLine: 4 });
  assert.equal(observedSpanForShellRead({ scope: "region", tailLines: 10 }, FILE_NL, "b\nc\n"), null);
});
```

**Verify**: `node --test test/shell-read-head-tail.test.mjs` → `# pass 6`,
`# fail 1` (the new test). Do not proceed until you have seen it fail.

For reference, the six revision-1 tests (already on the branch) are:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { observedSpanForShellRead, parseShellFileRead, tryTrackShellRead } from "../adapters/shell-read.mjs";

const FILE_NL = "a\nb\nc\n";      // lineCount 4 (trailing empty line)
const FILE_NO_NL = "a\nb\nc";     // lineCount 3

test("lineCountFlag accepts -n N, -nN, -N and --lines=N", () => {
  assert.deepEqual(parseShellFileRead("head -n 2 f.txt"), { path: "f.txt", scope: "region", startLine: 1, endLine: 2 });
  assert.deepEqual(parseShellFileRead("head -n2 f.txt"), { path: "f.txt", scope: "region", startLine: 1, endLine: 2 });
  assert.deepEqual(parseShellFileRead("head -2 f.txt"), { path: "f.txt", scope: "region", startLine: 1, endLine: 2 });
  assert.deepEqual(parseShellFileRead("head --lines=2 f.txt"), { path: "f.txt", scope: "region", startLine: 1, endLine: 2 });
  assert.deepEqual(parseShellFileRead("tail -n2 f.txt"), { path: "f.txt", scope: "region", tailLines: 2 });
  assert.equal(parseShellFileRead("head -n0 f.txt"), null);
});

test("observedSpanForShellRead: tail on a trailing-newline file", () => {
  assert.deepEqual(
    observedSpanForShellRead({ scope: "region", tailLines: 2 }, FILE_NL, "b\nc\n"),
    { startLine: 2, endLine: 4 },
  );
});

test("observedSpanForShellRead: tail on a file without trailing newline", () => {
  assert.deepEqual(
    observedSpanForShellRead({ scope: "region", tailLines: 2 }, FILE_NO_NL, "b\nc"),
    { startLine: 2, endLine: 3 },
  );
});

test("observedSpanForShellRead: head shorter than the request clamps to observed lines", () => {
  assert.deepEqual(
    observedSpanForShellRead({ scope: "region", startLine: 1, endLine: 10 }, FILE_NL, "a\nb\nc\n"),
    { startLine: 1, endLine: 4 },
  );
});

test("observedSpanForShellRead fails closed when observed bytes are not the file slice", () => {
  assert.equal(observedSpanForShellRead({ scope: "region", tailLines: 2 }, FILE_NL, "zzz\n"), null);
  assert.equal(observedSpanForShellRead({ scope: "region", startLine: 1, endLine: 2 }, FILE_NL, "b\nc\n"), null);
});

test("tryTrackShellRead tracks tail with the observed span and refuses a mismatching observation", async () => {
  const lineCount = (text) => String(text).replaceAll("\r\n", "\n").split("\n").length;
  async function run(command, observed) {
    const tracked = [];
    const ok = await tryTrackShellRead({
      toolName: "bash",
      input: { command },
      content: observed,
      isError: false,
      cwd: "/unused",
      engine: { trackRead: (args) => { tracked.push(args); return { id: "u1" }; } },
      callToUnit: new Map(),
      toolCallId: "c1",
      safeWorkspaceFile: async () => ({ path: "f.txt", content: FILE_NL }),
      observedToolContent: (value) => value,
      lineCount,
    });
    return { ok, tracked };
  }
  const good = await run("tail -n 2 f.txt", "b\nc\n");
  assert.equal(good.ok, true);
  assert.equal(good.tracked[0].startLine, 2);
  assert.equal(good.tracked[0].endLine, 4);

  const bad = await run("tail -n 2 f.txt", "stale\nbytes\n");
  assert.equal(bad.ok, false);
  assert.equal(bad.tracked.length, 0);
});
```

### Step 2: Shared helper in `adapters/shell-read.mjs`

Items 1 and 3 below are already committed on the branch (`119f977`); confirm
with `rg -n "observedSpanForShellRead|--lines" adapters/shell-read.mjs` and
skip them. Item 2 is the change this revision requires: replace the body of
`observedSpanForShellRead` with the version that carries the size check.

1. Replace `lineCountFlag` with:

```js
function lineCountFlag(tokens) {
  let lineCount = 10;
  for (let index = 1; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token === "-n" || token === "--lines") {
      const next = parsePositiveInt(tokens[index + 1]);
      if (next == null) return null;
      lineCount = next;
      index += 1;
      continue;
    }
    const attached = /^(?:-n|--lines=)(\d+)$/u.exec(token) ?? /^-(\d+)$/u.exec(token);
    if (attached) {
      const next = parsePositiveInt(attached[1]);
      if (next == null) return null;
      lineCount = next;
    }
  }
  return lineCount;
}
```

2. Replace `normalizeTailRegion` with an exported helper that both adapters use:

```js
function splitNormalizedLines(text) {
  return String(text ?? "").replaceAll("\r\n", "\n").split("\n");
}

/**
 * Derive the 1-based inclusive span a head/tail shell read actually showed the
 * model, from the observed tool output, and verify it against the file.
 * Returns null (fail closed: no unit is tracked) when the observation does not
 * have exactly the number of lines the command must have printed
 * (min(requested, body lines) — PCR 0088 sealed this for Hermes tail reads) or
 * is not the matching slice at the expected end of the file.
 */
export function observedSpanForShellRead(parsed, fileContent, observedContent) {
  if (!parsed || parsed.scope !== "region") return null;
  const fileLines = splitNormalizedLines(fileContent);
  const observedLines = splitNormalizedLines(observedContent);
  // Tool hosts may or may not keep the final newline; compare without it.
  if (observedLines.at(-1) === "") observedLines.pop();
  if (observedLines.length === 0) return null;
  const fileBody = fileLines.at(-1) === "" ? fileLines.slice(0, -1) : fileLines;
  const fileLineCount = fileLines.length;

  let requested;
  if (Number.isInteger(parsed.tailLines) && parsed.tailLines > 0) {
    requested = parsed.tailLines;
  } else if (parsed.startLine === 1 && Number.isInteger(parsed.endLine) && parsed.endLine > 0) {
    requested = parsed.endLine;
  } else {
    return null;
  }
  if (observedLines.length !== Math.min(requested, fileBody.length)) return null;

  let startLine;
  let endLine;
  if (parsed.tailLines != null) {
    startLine = fileBody.length - observedLines.length + 1;
    endLine = fileLineCount;
  } else {
    startLine = 1;
    endLine = observedLines.length === fileBody.length ? fileLineCount : observedLines.length;
  }
  const expected = fileBody.slice(startLine - 1, startLine - 1 + observedLines.length).join("\n");
  if (expected !== observedLines.join("\n")) return null;
  return { startLine, endLine };
}
```

   Semantics to preserve: `endLine` is `fileLineCount` (including the trailing
   empty line) for `tail`, so the existing Hermes tests that expect
   `endLine === lineCount(file)` keep passing; for `head` that reaches EOF the
   span is likewise the whole file. The size check runs before the content
   check so that a truncated or over-long observation never matches "by
   accident" as a shorter or longer slice.

3. In `tryTrackShellRead`, replace the `normalizeTailRegion` use and the region
   branch:

```js
    const file = await safeWorkspaceFile(cwd, parsed.path);
    const observedFileLineCount = lineCount(file.content);

    if (parsed.scope === "region") {
      const observed = observedToolContent(content);
      if (!observed) return false;
      const span = observedSpanForShellRead(parsed, file.content, observed);
      if (!span) return false;
      const unit = engine.trackRead({
        path: file.path,
        content: observed,
        scope: "region",
        startLine: span.startLine,
        endLine: span.endLine,
        observedFileLineCount,
      });
      callToUnit.set(toolCallId, unit.id);
      return true;
    }
```

   Delete `normalizeTailRegion`.

**Verify**: `node --test test/shell-read-head-tail.test.mjs` → `# fail 0`.
`node --test test/pcr-0081-stale-shell-dump.test.mjs test/pcr-0100-over-cap-unchanged-collapse.test.mjs test/pcr-0102-later-turn-quoteability-characterization.test.mjs`
→ `# fail 0`. If a PCR 0100/0102 test fails because its fixture's `head -n N`
observation is not the literal first N lines of the file, STOP and report the
fixture (the fixture, not the helper, is then encoding the old bug).

### Step 3: Hermes uses the same helper

In `adapters/hermes/bridge.mjs`, import `observedSpanForShellRead` from
`../shell-read.mjs` (the file already imports `trackedReadTools` and friends
from there) and rewrite `tailRegionFromObservation` to delegate:

```js
function tailRegionFromObservation(scopeMeta, fileContent, observedContent) {
  if (!scopeMeta || scopeMeta.scope !== "region" || !Number.isInteger(scopeMeta.tailLines)) {
    return scopeMeta;
  }
  const span = observedSpanForShellRead({ scope: "region", tailLines: scopeMeta.tailLines }, fileContent, observedContent);
  if (!span) {
    return { scope: "region", selector: scopeMeta.selector, tailLines: scopeMeta.tailLines, invalidTailObservation: true };
  }
  return { scope: "region", ...span, selector: scopeMeta.selector, tailLines: scopeMeta.tailLines };
}
```

Remove `tailSpanContent` if nothing else uses it (`rg -n tailSpanContent adapters/hermes/bridge.mjs`).

**Verify**: `node --test $(rg -l invalidTailObservation test)` → `# fail 0`;
`node --test test/hermes-*.test.mjs test/pcr-*hermes*.test.mjs` → `# fail 0`.
The reviewer pre-ran exactly this Step 2 + Step 3 combination on a copy of
`grok/plan-006-head-tail-parity` (`119f977`):
`node --test test/shell-read-head-tail.test.mjs $(rg -l invalidTailObservation test) test/hermes-*.test.mjs test/pcr-*hermes*.test.mjs test/pcr-0081*.test.mjs test/pcr-0100*.test.mjs test/pcr-0102*.test.mjs`
→ `# tests 127`, `# pass 127`, `# fail 0` — including the PCR 0088 undersized,
middle, and extra-newline boards. A failure here now means real drift, not a
known helper gap.

### Step 4: Full suite, evaluate, record

`npm test` → `# fail 0`. `npm run evaluate` → `EVALUATE_VERDICT=PASS` with
`payloadBytes.candidate` unchanged (the apex pack uses official reads, not
shell reads). Write PCR 0164 (`docs/lab/pcr/0164-shell-read-head-tail-parity.md`;
include the two reproductions from "Why this matters" and the PCR 0088 board
table from the revision-1 STOP report as before/after tables), INDEX/METRICS
rows, and bump the PCR count in `README.md` and `docs/ARCHITECTURE.md` from
159 to 160. Also flip the `Shell \`head\`/\`tail\` span arithmetic` row in the
`docs/ARCHITECTURE.md` "Sharp-edge audit" table from `FIX … Open` to
`FIXED … PCR 0164`.

## Test plan

- `test/shell-read-head-tail.test.mjs` (seven tests): flag forms, tail with
  and without trailing newline, head clamping, fail-closed content mismatch,
  fail-closed line-count mismatch (undersized, oversized, extra blank line,
  over-request), end-to-end `tryTrackShellRead`.
- Existing: PCR 0081/0100/0102 (Pi shell reads), PCR 0085/0088 and every other
  Hermes tail test (`invalidTailObservation`), whole suite.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test test/shell-read-head-tail.test.mjs` → `# pass 7`, `# fail 0`
- [ ] `node --test $(rg -l invalidTailObservation test)` → `# fail 0`
- [ ] `rg -n "normalizeTailRegion|tailSpanContent" adapters` → no matches
- [ ] `rg -n "observedSpanForShellRead" adapters/shell-read.mjs adapters/hermes/bridge.mjs` → defined once, used in both files
- [ ] `npm test` exits 0; `npm run evaluate` prints `EVALUATE_VERDICT=PASS` with unchanged `payloadBytes.candidate`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any PCR 0085/0088/0133/0136-class Hermes tail test fails after Step 3 —
  those tests encode the sealed Hermes behaviour; report the exact assertion.
  (Revision 1 stopped here on PCR 0088 `undersized`; the size check in this
  revision is the fix, so a repeat means something else drifted.)
- A PCR 0100/0102 fixture fails because its observed `head` content is not a
  file prefix.
- `npm run evaluate` payload bytes change.

## Maintenance notes

- Reviewers: any new shell verb that yields a region (`sed -n` is the other
  one) should go through `observedSpanForShellRead` or an equivalent
  observed-bytes check; never trust the flag arithmetic alone.
- `tail -f`, `tail -c`, `head -c` are still parsed as line reads with the
  default 10; adding byte-mode/follow rejection is a separate small change.
