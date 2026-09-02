# Plan 005: The Isolated Semantic Engine client cannot crash or hang the host

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fd523eb..HEAD -- ise/treesitter/client.mjs src/registry.mjs test/treesitter-ise.test.mjs docs/decisions/0004-isolated-semantic-engine.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `fd523eb`, 2026-09-02

## Why this matters

ADR 0004 moved Tree-sitter out of process so that a parser fault degrades a
unit to `unresolved` instead of taking the host down. The registry side of that
promise holds: `runIsolatedSemanticEngine` in `src/registry.mjs` catches any
rejection from the runner and returns `isolated-semantic-engine-error`. The
client side does not. `ise/treesitter/client.mjs` writes the request to
`child.stdin` with no `error` listener, so if the child exits before draining
stdin (grammar load failure, `node` missing a native module, an oversized
input) Node raises an unhandled `EPIPE` on the **parent** process and the host
(Pi, Hermes bridge, `npm run evaluate`) dies. Reproduced at `d95c755` with a
2 MB input and a child that exits immediately: `Error: write EPIPE` uncaught,
exit code 1. The client also has no timeout — a wedged parser blocks
`engine.refresh()` forever — and no cap on stdout size. This plan adds the
three guards, keeps the rejection contract the registry already handles, and
adds fake-spawn unit tests for each failure path.

## Current state

- `ise/treesitter/client.mjs` (37 lines, whole file at `fd523eb`):

```js
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ISOLATED_SEMANTIC_ENGINE = join(dirname(fileURLToPath(import.meta.url)), "parse.mjs");

export function createIsolatedSemanticEngineRunner({ command = process.execPath, args = [ISOLATED_SEMANTIC_ENGINE], spawnImpl = spawn } = {}) {
  return async function semanticEngineRunner({ path, bytes }) {
    return await new Promise((resolve, reject) => {
      const child = spawnImpl(command, args, { stdio: ["pipe", "pipe", "pipe"] });
      if (!child) {
        reject(new Error("isolated-semantic-engine-missing"));
        return;
      }
      const stdout = [];
      const stderr = [];
      child.stdout?.on("data", (chunk) => stdout.push(chunk));
      child.stderr?.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.join("") || "isolated-semantic-engine-error"));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
      child.stdin.write(JSON.stringify({ path, bytes: String(bytes ?? "") }));
      child.stdin.end();
    });
  };
}

export function missingIsolatedSemanticEngineRunner() {
  return async function missing() {
    throw new Error("isolated-semantic-engine-missing");
  };
}
```

- `src/registry.mjs:63-77` — the consumer contract. Any rejection becomes
  `{ state: "unresolved", method: "isolated-semantic-engine-error" }`; a
  resolved falsy value becomes `isolated-semantic-engine-unresolved`. Do not
  change this file.

- `test/treesitter-ise.test.mjs` — existing coverage: happy path through the
  real child (`createIsolatedSemanticEngineRunner()` at line 168), the
  `missingIsolatedSemanticEngineRunner` path (line 151), and a source scan that
  `client.mjs` never caches (`lastBytes`/`cache` strings must be absent; keep
  that true). No test injects `spawnImpl`.

- Callers that construct the runner: `src/index.mjs` / `adapters/*`
  via `createAdapterEngine` and `semanticEngineOptionsForBridge`
  (`adapters/hermes/bridge.mjs`). They pass no options today, so new options
  must have safe defaults.

- ADR 0004 (`docs/decisions/0004-isolated-semantic-engine.md`) "Consequences"
  ends with a "Known gap" bullet stating that the client has no stdin error
  handler, timeout, or output cap and pointing at this plan. When the fix
  lands, replace that bullet with the implemented bounds (defaults) so the ADR
  and the code stay consistent.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Grammars (once) | `npm run ise:install` | exit 0 |
| Client tests | `node --test test/treesitter-ise-client.test.mjs` | `# fail 0` |
| ISE suite | `node --test test/treesitter-ise.test.mjs test/pcr-01*ise*.test.mjs test/pcr-*isolated*.test.mjs` | `# fail 0` |
| Full suite | `npm test` | `# fail 0` |
| Evaluate | `npm run evaluate` | `EVALUATE_VERDICT=PASS`, `payloadBytes.candidate` unchanged |
| EPIPE repro (before fix) | see Step 1 | uncaught `write EPIPE` before, clean rejection after |

## Scope

**In scope** (the only files you should create or modify):
- `ise/treesitter/client.mjs`
- `test/treesitter-ise-client.test.mjs` (create)
- `docs/decisions/0004-isolated-semantic-engine.md` — replace the "Known gap"
  bullet under "Consequences" with one sentence naming the implemented bounds
  (timeout default, output cap default, stdin error → rejection)
- PCR record + INDEX/METRICS rows + PCR count bump (see Plan 003 Step 4 for the procedure)

**Out of scope** (do NOT touch, even though they look related):
- `src/registry.mjs` — the rejection contract there is already correct.
- `ise/treesitter/parse.mjs`, `grammars.mjs`, `package.json` under `ise/treesitter/`.
- `adapters/*` — defaults make the change transparent; do not thread new
  options through adapters in this plan.

## Git workflow

- Branch: `cursor/ise-client-robustness`
- Commits: `test(ise): client rejects instead of crashing on stdin error, timeout, oversized output` (red),
  `fix(ise): harden isolated-semantic-engine client` (green), `docs: PCR NNNN`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reproduce the crash once, outside the repo

Write `/tmp/epipe-probe.mjs`:

```js
import { spawn } from "node:child_process";
import { createIsolatedSemanticEngineRunner } from "/workspace/ise/treesitter/client.mjs";
const runner = createIsolatedSemanticEngineRunner({
  spawnImpl: (cmd, args, opts) => spawn(process.execPath, ["-e", "process.exit(0)"], opts),
});
try {
  await runner({ path: "a.py", bytes: "x".repeat(2 * 1024 * 1024) });
  console.log("resolved (unexpected)");
} catch (error) {
  console.log("rejected:", error.message);
}
```

Run `node /tmp/epipe-probe.mjs`. **Expected before the fix**: the process dies
with an uncaught `Error: write EPIPE` (exit code 1) instead of printing
`rejected:`. If it prints `rejected: ...` cleanly, the bug is already fixed —
STOP and report. Delete the probe when done with Step 3.

### Step 2: Red unit tests with a fake spawn

Create `test/treesitter-ise-client.test.mjs`:

```js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createIsolatedSemanticEngineRunner } from "../ise/treesitter/client.mjs";

function fakeChild({ exitCode = 0, stdout = "", stdinError = null, hang = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    setImmediate(() => child.emit("close", null, "SIGKILL"));
    return true;
  };
  if (stdinError) {
    child.stdin.write = () => { setImmediate(() => child.stdin.emit("error", stdinError)); return false; };
    child.stdin.end = () => {};
  }
  setImmediate(() => {
    if (hang) return;
    if (stdout) child.stdout.end(stdout); else child.stdout.end();
    child.stderr.end();
    if (!stdinError) child.emit("close", exitCode);
  });
  return child;
}

test("stdin error (EPIPE) rejects instead of crashing the host", async () => {
  const runner = createIsolatedSemanticEngineRunner({ spawnImpl: () => fakeChild({ stdinError: Object.assign(new Error("write EPIPE"), { code: "EPIPE" }) }) });
  await assert.rejects(runner({ path: "a.py", bytes: "def a():\n  pass\n" }), /EPIPE|isolated-semantic-engine-error/);
});

test("non-zero exit rejects with stderr text or the generic error", async () => {
  const runner = createIsolatedSemanticEngineRunner({ spawnImpl: () => fakeChild({ exitCode: 3 }) });
  await assert.rejects(runner({ path: "a.py", bytes: "" }), /isolated-semantic-engine-error/);
});

test("non-JSON stdout rejects", async () => {
  const runner = createIsolatedSemanticEngineRunner({ spawnImpl: () => fakeChild({ stdout: "not json" }) });
  await assert.rejects(runner({ path: "a.py", bytes: "" }));
});

test("a hung child is killed after timeoutMs and rejects with a timeout error", async () => {
  let spawned;
  const runner = createIsolatedSemanticEngineRunner({
    timeoutMs: 50,
    spawnImpl: () => { spawned = fakeChild({ hang: true }); return spawned; },
  });
  await assert.rejects(runner({ path: "a.py", bytes: "" }), /isolated-semantic-engine-timeout/);
  assert.equal(spawned.killed, true);
});

test("stdout above maxOutputBytes rejects and kills the child", async () => {
  let spawned;
  const runner = createIsolatedSemanticEngineRunner({
    maxOutputBytes: 16,
    spawnImpl: () => { spawned = fakeChild({ stdout: JSON.stringify({ units: "x".repeat(64) }) }); return spawned; },
  });
  await assert.rejects(runner({ path: "a.py", bytes: "" }), /isolated-semantic-engine-output-too-large/);
  assert.equal(spawned.killed, true);
});

test("well-formed JSON on exit 0 resolves", async () => {
  const runner = createIsolatedSemanticEngineRunner({ spawnImpl: () => fakeChild({ stdout: JSON.stringify({ units: [], error: null }) }) });
  assert.deepEqual(await runner({ path: "a.py", bytes: "" }), { units: [], error: null });
});
```

**Verify**: `node --test test/treesitter-ise-client.test.mjs` → tests 1, 4, 5
fail (1 may crash the test process with EPIPE — that is the bug); 2, 3, 6 pass.

### Step 3: Harden the client

Replace the body of `createIsolatedSemanticEngineRunner` in
`ise/treesitter/client.mjs` with:

```js
export const DEFAULT_ISOLATED_SEMANTIC_ENGINE_TIMEOUT_MS = 10_000;
export const DEFAULT_ISOLATED_SEMANTIC_ENGINE_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export function createIsolatedSemanticEngineRunner({
  command = process.execPath,
  args = [ISOLATED_SEMANTIC_ENGINE],
  spawnImpl = spawn,
  timeoutMs = DEFAULT_ISOLATED_SEMANTIC_ENGINE_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_ISOLATED_SEMANTIC_ENGINE_MAX_OUTPUT_BYTES,
} = {}) {
  return async function semanticEngineRunner({ path, bytes }) {
    return await new Promise((resolve, reject) => {
      const child = spawnImpl(command, args, { stdio: ["pipe", "pipe", "pipe"] });
      if (!child) {
        reject(new Error("isolated-semantic-engine-missing"));
        return;
      }
      let settled = false;
      let stdoutBytes = 0;
      const stdout = [];
      const stderr = [];
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const abort = (message) => {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
        settle(reject, new Error(message));
      };
      const timer = setTimeout(() => abort("isolated-semantic-engine-timeout"), timeoutMs);

      child.stdout?.on("data", (chunk) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxOutputBytes) {
          abort("isolated-semantic-engine-output-too-large");
          return;
        }
        stdout.push(chunk);
      });
      child.stderr?.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => settle(reject, error));
      child.stdin?.on("error", (error) => settle(reject, error));
      child.on("close", (code) => {
        if (code !== 0) {
          settle(reject, new Error(stderr.join("") || "isolated-semantic-engine-error"));
          return;
        }
        try {
          settle(resolve, JSON.parse(Buffer.concat(stdout).toString("utf8")));
        } catch (error) {
          settle(reject, error);
        }
      });
      child.stdin.write(JSON.stringify({ path, bytes: String(bytes ?? "") }));
      child.stdin.end();
    });
  };
}
```

Rules the implementation must keep:
- No caching of inputs or outputs (the existing source scan in
  `test/treesitter-ise.test.mjs` asserts `lastBytes` and `cache` are absent
  from the file — do not introduce those identifiers).
- Node standard library only.
- `settle` guarantees exactly one resolution even when `close` fires after
  `kill`.

**Verify**: `node --test test/treesitter-ise-client.test.mjs` → `# pass 6`,
`# fail 0`. `node /tmp/epipe-probe.mjs` → prints `rejected: write EPIPE`
(or a similar clean message) and exits 0. Then `rm /tmp/epipe-probe.mjs`.

### Step 4: Real-child sanity and regression

Run `node --test test/treesitter-ise.test.mjs` (uses the real `parse.mjs`
child) → `# fail 0`. Then `npm test` → `# fail 0`. Then `npm run evaluate` →
`EVALUATE_VERDICT=PASS` and `payloadBytes.candidate` equal to the README
table (the change alters failure handling only; a successful parse produces
byte-identical output).

### Step 5: Record

PCR + INDEX/METRICS + PCR count bump (procedure as in Plan 003 Step 4).
Include in the PCR the before/after output of the EPIPE probe. Replace the
ADR 0004 "Known gap" bullet with the implemented defaults (10 s / 16 MiB unless
you had to change them — then say why in the PCR).

## Test plan

- New `test/treesitter-ise-client.test.mjs`: six fake-spawn tests (stdin
  error, non-zero exit, non-JSON, timeout with kill, oversized output with
  kill, success).
- Existing real-child tests in `test/treesitter-ise.test.mjs` unchanged and
  green.
- Behavioural guarantee via `src/registry.mjs`: any of the new rejections
  surfaces as `resolutionMethod: "isolated-semantic-engine-error"` and
  `state: "unresolved"` — already covered by the `missingIsolatedSemanticEngineRunner`
  test pattern; optionally add one engine-level test that injects the
  timeout runner and asserts that method string.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test test/treesitter-ise-client.test.mjs` → `# pass 6`, `# fail 0`
- [ ] `rg -n 'stdin\?\.on\("error"' ise/treesitter/client.mjs` → one match
- [ ] `rg -n "isolated-semantic-engine-timeout|isolated-semantic-engine-output-too-large" ise/treesitter/client.mjs` → both present
- [ ] `rg -n "lastBytes|cache" ise/treesitter/client.mjs` → no matches
- [ ] `npm test` exits 0; `npm run evaluate` prints `EVALUATE_VERDICT=PASS` with unchanged `payloadBytes.candidate`
- [ ] The EPIPE probe exits 0 with a `rejected:` line after the fix
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The probe in Step 1 does not crash before the fix.
- Any real-child test in `test/treesitter-ise.test.mjs` fails after Step 3
  (for example the grammars take longer than `timeoutMs` to load on your
  machine — report the observed time rather than raising the default silently).
- `npm run evaluate` payload bytes change.

## Maintenance notes

- Reviewers: check that every new failure string starts with
  `isolated-semantic-engine-` so log greps stay uniform with
  `-missing`, `-error`, `-unresolved`.
- If a future caller needs a longer timeout for very large files, thread
  `timeoutMs` through `createAdapterEngine` options rather than raising the
  default; the default protects interactive hosts.
- Deferred: a Hermes-bridge-level watchdog (the Python plugin already has a
  `subprocess.run(..., timeout=...)`) is the second layer; not part of this
  plan.
