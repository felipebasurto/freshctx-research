# Plan 006: `head`/`tail` shell reads derive their line span from the observed bytes, identically in Pi and Hermes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fd523eb..HEAD -- adapters/shell-read.mjs adapters/hermes/bridge.mjs adapters/pi/replay.mjs adapters/pi/extension.ts test/pcr-0081-stale-shell-dump.test.mjs`
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
content (`tail`: last *k* observed lines; `head`: first *k*), verifies the file
slice matches, and fails closed otherwise; both adapters call it; `-nN` and
`--lines=N` parse.

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
- `test/shell-read-head-tail.test.mjs` (create)
- PCR record + INDEX/METRICS + PCR count bump (procedure as in Plan 003 Step 4)

**Out of scope** (do NOT touch, even though they look related):
- `adapters/pi/replay.mjs`, `adapters/pi/extension.ts` — call sites need no change.
- `src/hash.mjs`, `src/registry.mjs` — unit identity rules stay.
- `sed -n` parsing, dump-verb detection, pipe refusal — unchanged.
- Hermes official `read_file` `offset/limit` scope math (`normalizeHermesReadScope`) — separate rule set (PCR 0064/0069).

## Git workflow

- Branch: `cursor/shell-read-head-tail-parity`
- Commits: `test(shell-read): head/tail spans derive from observed bytes; -nN parses` (red),
  `fix(adapters): shared observed-span helper for head/tail in Pi and Hermes` (green), `docs: PCR NNNN`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Red tests

Create `test/shell-read-head-tail.test.mjs`:

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

**Verify**: `node --test test/shell-read-head-tail.test.mjs` → the import of
`observedSpanForShellRead` fails (not yet exported) — the file is red. Do not
proceed until you have seen it fail.

### Step 2: Shared helper in `adapters/shell-read.mjs`

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
 * Returns null when the observation is not a contiguous slice at the expected
 * end of the file (fail closed: no unit is tracked).
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

  let startLine;
  let endLine;
  if (parsed.tailLines != null) {
    startLine = Math.max(1, fileBody.length - observedLines.length + 1);
    endLine = fileLineCount;
  } else if (parsed.startLine === 1) {
    startLine = 1;
    endLine = Math.min(observedLines.length, fileLineCount);
    if (endLine === fileBody.length && fileLineCount > fileBody.length) endLine = fileLineCount;
  } else {
    return null;
  }
  const expected = fileBody.slice(startLine - 1, startLine - 1 + observedLines.length).join("\n");
  if (expected !== observedLines.join("\n")) return null;
  return { startLine, endLine };
}
```

   Semantics to preserve: `endLine` is `fileLineCount` (including the trailing
   empty line) for `tail`, so the existing Hermes tests that expect
   `endLine === lineCount(file)` keep passing; for `head` that reaches EOF the
   span is likewise the whole file.

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

### Step 4: Full suite, evaluate, record

`npm test` → `# fail 0`. `npm run evaluate` → `EVALUATE_VERDICT=PASS` with
`payloadBytes.candidate` unchanged (the apex pack uses official reads, not
shell reads). Write the PCR (include the two reproductions from "Why this
matters" as before/after tables), INDEX/METRICS rows, PCR count bump.

## Test plan

- New `test/shell-read-head-tail.test.mjs` (six tests): flag forms, tail with
  and without trailing newline, head clamping, fail-closed mismatch, end-to-end
  `tryTrackShellRead`.
- Existing: PCR 0081/0100/0102 (Pi shell reads), all Hermes tail tests
  (`invalidTailObservation`), whole suite.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test test/shell-read-head-tail.test.mjs` → `# pass 6`, `# fail 0`
- [ ] `rg -n "normalizeTailRegion|tailSpanContent" adapters` → no matches
- [ ] `rg -n "observedSpanForShellRead" adapters/shell-read.mjs adapters/hermes/bridge.mjs` → defined once, used in both files
- [ ] `npm test` exits 0; `npm run evaluate` prints `EVALUATE_VERDICT=PASS` with unchanged `payloadBytes.candidate`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any PCR 0133/0136-class Hermes tail test fails after Step 3 — those tests
  encode the sealed Hermes behaviour; report the exact assertion.
- A PCR 0100/0102 fixture fails because its observed `head` content is not a
  file prefix.
- `npm run evaluate` payload bytes change.

## Maintenance notes

- Reviewers: any new shell verb that yields a region (`sed -n` is the other
  one) should go through `observedSpanForShellRead` or an equivalent
  observed-bytes check; never trust the flag arithmetic alone.
- `tail -f`, `tail -c`, `head -c` are still parsed as line reads with the
  default 10; adding byte-mode/follow rejection is a separate small change.
