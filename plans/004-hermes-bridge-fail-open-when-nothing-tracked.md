# Plan 004: The Hermes bridge returns the original request when it tracked nothing, and the Python engine honours `applied`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fd523eb..HEAD -- adapters/hermes/bridge.mjs adapters/hermes/__init__.py adapters/request-prune.mjs test/hermes-bridge.test.mjs test/hermes-adapter.test.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `fd523eb`, 2026-09-02

## Why this matters

The adapter contract (`AGENTS.md` "Adapter failure must return the original
host request unchanged"; `docs/ARCHITECTURE.md` failure matrix "Adapter throws
→ Send original host request") is what lets a harness author enable FreshCtx
without risk. The Hermes bridge honours it when the bridge process crashes and
when the transcript contains no read calls at all. It does **not** honour it in
the middle case: read calls are present, but every tracking attempt fails.
This happens for `cat`/`head`/`tail`/`sed -n` shell reads whenever the `cwd`
Hermes hands the plugin is not the tree the reads were made in (the situation
PCR 0159 debugged), because the bridge validates the workspace path inside the
tracking loop for shell reads. Each failure is swallowed
by `catch {}`, the registry stays empty, and the request-prune step then
removes **every** read tool-call/result pair because none of them is "served"
by a projection that does not exist. The bridge reports `applied: false`, but
the Python engine ignores that flag and hands Hermes the pruned messages. The
model loses all file evidence with nothing in its place. After this plan, the
bridge returns the untouched messages whenever it tracked zero units, and the
Python side treats `applied !== true` as "do not replace".

## Current state

- `adapters/hermes/bridge.mjs` — Node bridge invoked per request by the Python
  plugin over stdin/stdout JSON.

```js
// lines 634-645: the existing early fail-open, taken only when no read calls exist
  if (paths.length === 0) {
    state.updatedAt = new Date().toISOString();
    await saveState(payload.stateFile, state);
    return {
      messages: payload.messages,
      selected: 0,
      applied: false,
      projectionText: "",
      telemetry: { totalMs: 0, projectionBytes: 0 },
    };
  }

// lines 652-723: tracking loop; every failure is swallowed
  const engine = createAdapterEngine(semanticEngineOptionsForBridge(payload));
  const unitsByCall = new Map();
  // ...
  for (const [callId, observation] of Object.entries(tracked)) {
    if (!shellCallIds.has(callId) && !activeOfficialCallIds.has(callId)) continue;
    try {
      // ... builds trackArgs, may call safeWorkspaceFile(payload.cwd, ...) which throws
      const unit = engine.trackRead(trackArgs);
      unitsByCall.set(callId, unit);
    } catch {
      // Unsupported observations remain ordinary tool results.
    }
  }

  await engine.refresh(async (filePath) =>
    (await safeWorkspaceFile(payload.cwd, filePath)).content,
  );

// lines 779-801: prune + return; applied can be false while messages differ
  const assembled = dropUnservedReadToolPairs(replaceHistoricalProjectionMessages(rewritten), {
    readTools: HERMES_TRACKED_TOOLS,
    servedCallIds,
    observedCallIds: readToolCallIds(payload.messages, HERMES_TRACKED_TOOLS),
    trackedPaths: engine.registry.list().map((unit) => unit.path),
    projection,
    readDispositionByCallId,
    historicalReadDispositionByCallId: readDispositionMapFromObject(state.appliedReadDispositionByCallId),
  });
  return {
    messages: projectionText.length > 0
      ? [...assembled, { role: "user", content: projectionText }]
      : assembled,
    selected: projection.selected.length,
    unresolved: projection.omitted.filter((item) => item.reason === "unresolved").length,
    applied: engine.registry.list().length > 0,
    projectionText,
    telemetry: { totalMs: 0, projectionBytes: Buffer.byteLength(projectionText, "utf8"), skipEligibleSelections },
  };
```

- `adapters/request-prune.mjs:374-385` — `unservedReadToolCallIds` drops every
  observed read call id that is not in `servedCallIds`; with an empty registry
  `servedCallIds` is empty, so all read pairs are dropped.

- `adapters/hermes/__init__.py:109-127`:

```python
    def select_context(self, request_messages, *, conversation_messages=None,
                       incoming_message=None, budget_tokens=0):
        result = self._call_bridge("select", request_messages,
                                   budgetTokens=budget_tokens,
                                   conversationMessages=conversation_messages,
                                   incomingMessage=incoming_message)
        selected = result.get("messages") if result else None
        if not isinstance(selected, list) or not all(isinstance(item, dict) for item in selected):
            return None
        return selected
```

  Returning `None` from `select_context` tells Hermes to keep its own request
  (documented in `adapters/hermes/README.md`). `_call_bridge` already returns
  `None` on non-zero exit, timeout, or non-JSON output.

- Existing tests to model on:
  - `test/hermes-bridge.test.mjs:9-40` — spawns `bridge.mjs` with a JSON
    payload (`operation: "select"`, `cwd`, `stateFile`, `messages`) and parses
    stdout.
  - `test/hermes-adapter.test.mjs:49-56` — "fails open when select cannot
    refresh" uses a transcript with **no** read calls; it does not cover the
    read-calls-present case.
  - There is no Python unit test today; CI only runs
    `python -m py_compile adapters/hermes/__init__.py`. The module imports
    `agent.context_compressor.ContextCompressor` from Hermes, which is not
    installed in CI, so a Python test must stub that module via `sys.modules`
    before importing.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Grammars (once) | `npm run ise:install` | exit 0 |
| Bridge tests | `node --test test/hermes-bridge.test.mjs test/hermes-adapter.test.mjs test/pcr-0159-hermes-dest-cwd.test.mjs` | `# fail 0` |
| Python compile | `python3 -m py_compile adapters/hermes/__init__.py` | exit 0 |
| Python unit test | `python3 -m unittest test/python/test_hermes_engine.py` | `OK` |
| Full suite | `npm test` | `# fail 0` |
| Evaluate | `npm run evaluate` | `EVALUATE_VERDICT=PASS` (Hermes path is not on the apex evaluate path; bytes unchanged) |

## Scope

**In scope** (the only files you should create or modify):
- `adapters/hermes/bridge.mjs` (`selectContext` only, between the refresh call and the return)
- `adapters/hermes/__init__.py` (`select_context` only)
- `test/hermes-bridge.test.mjs` (append one test)
- `test/python/test_hermes_engine.py` (create) and `test/python/__init__.py` (create, empty)
- `package.json` (`check` script: add `adapters/hermes/__init__.py` to the `py_compile` list; add `test:py` script)
- `.github/workflows/ci.yml` (one added step running `npm run test:py` after "Hermes Python scaffold compiles")
- PCR record: `docs/lab/pcr/NNNN-hermes-nothing-tracked-fail-open.md`, `docs/lab/INDEX.md`, `docs/lab/METRICS.md`, PCR count in `README.md` and `docs/ARCHITECTURE.md`

**Out of scope** (do NOT touch, even though they look related):
- `adapters/request-prune.mjs` — pruning unserved reads when a projection
  exists is intentional (PCR 0037, 0083); do not weaken it.
- `observeTurn()` and the state-file format — unchanged.
- `adapters/hermes/install.mjs`, `plugin.yaml`, `verify-layout.mjs`.
- The `paths.length === 0` early return — keep as is.

## Git workflow

- Branch: `cursor/hermes-nothing-tracked-fail-open`
- Commits: `test(hermes): bridge with untrackable reads must return original messages` (red),
  `fix(hermes): fail open when no unit was tracked; Python honours applied` (green),
  `test(hermes): python unit test for select_context applied gate`, `docs: PCR NNNN`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Red test for the bridge

Append to `test/hermes-bridge.test.mjs`:

```js
test("Hermes bridge returns the original request unchanged when no read could be tracked", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-hermes-untracked-"));
  // A cat-class shell read of a file that does not exist under cwd: the bridge
  // calls safeWorkspaceFile inside the tracking loop, it throws, the read is
  // skipped, and the registry stays empty. (Official `read_file` calls are
  // tracked before the workspace check and become `unresolved` instead, so
  // they do not exercise this path.)
  const payload = {
    operation: "select",
    cwd: workspace,
    stateFile: join(workspace, "state", "session.json"),
    budgetTokens: 100_000,
    messages: [
      { role: "user", content: "inspect the file" },
      {
        role: "assistant",
        tool_calls: [{
          id: "call-missing",
          type: "function",
          function: { name: "bash", arguments: JSON.stringify({ command: "cat elsewhere/source.ts" }) },
        }],
      },
      { role: "tool", tool_call_id: "call-missing", content: "export const value = 'observed';\n" },
      { role: "user", content: "continue" },
    ],
  };
  const bridge = fileURLToPath(new URL("../adapters/hermes/bridge.mjs", import.meta.url));
  const run = spawnSync(process.execPath, [bridge], { input: JSON.stringify(payload), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.applied, false);
  assert.deepEqual(result.messages, payload.messages);
});
```

**Verify**: `node --test test/hermes-bridge.test.mjs` → `# fail 1`. Reproduced
at `d95c755`: the bridge returned `applied: false` with three messages instead
of four — the assistant tool call and its tool result were dropped and an
empty `<freshctx turn="0" selected="0" unresolved="0" budget-omitted="0">`
envelope was appended. If the test passes before the fix, STOP.

### Step 2: Fail open in the bridge

In `adapters/hermes/bridge.mjs` `selectContext`, immediately after

```js
  await engine.refresh(async (filePath) =>
    (await safeWorkspaceFile(payload.cwd, filePath)).content,
  );
```

insert:

```js
  if (unitsByCall.size === 0) {
    // Nothing was trackable (bad cwd, unsupported files). Pruning read pairs
    // without a projection would delete evidence; hand Hermes its own request.
    clearPendingInjectedRevision(state);
    clearPendingReadDisposition(state);
    state.updatedAt = new Date().toISOString();
    await saveState(payload.stateFile, state);
    return {
      messages: payload.messages,
      selected: 0,
      unresolved: 0,
      applied: false,
      projectionText: "",
      telemetry: { totalMs: 0, projectionBytes: 0, skipEligibleSelections: 0 },
    };
  }
```

`clearPendingInjectedRevision` and `clearPendingReadDisposition` already exist
in the file (used at lines 764-765). Use them as-is.

**Verify**: `node --test test/hermes-*.test.mjs test/pcr-*hermes*.test.mjs` → `# fail 0` (this includes the new test from Step 1, the existing fail-open test, PCR 0105 host wiring and PCR 0159 dest-cwd).

### Step 3: Python honours `applied`

In `adapters/hermes/__init__.py` `select_context`, replace

```python
        selected = result.get("messages") if result else None
```

with

```python
        if not isinstance(result, dict) or result.get("applied") is not True:
            return None
        selected = result.get("messages")
```

**Verify**: `python3 -m py_compile adapters/hermes/__init__.py` → exit 0.

### Step 4: Python unit test with a stubbed Hermes base class

Create `test/python/__init__.py` (empty) and `test/python/test_hermes_engine.py`:

```python
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load_engine_module():
    # Hermes is not installed in CI; provide the base class the plugin subclasses.
    agent = types.ModuleType("agent")
    compressor = types.ModuleType("agent.context_compressor")

    class ContextCompressor:  # minimal stand-in for Hermes' class
        def __init__(self, model=None, api_key=None, **kwargs):
            self.model = model

    compressor.ContextCompressor = ContextCompressor
    agent.context_compressor = compressor
    sys.modules["agent"] = agent
    sys.modules["agent.context_compressor"] = compressor
    spec = importlib.util.spec_from_file_location(
        "freshctx_hermes", ROOT / "adapters" / "hermes" / "__init__.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SelectContextAppliedGate(unittest.TestCase):
    def setUp(self):
        self.module = load_engine_module()
        self.engine = self.module.FreshCtxContextEngine(model="stub")
        self.engine._freshctx_state_file = Path("/tmp/freshctx-test-state.json")

    def test_applied_false_returns_none(self):
        with mock.patch.object(
            self.engine, "_call_bridge",
            return_value={"applied": False, "messages": [{"role": "user", "content": "pruned"}]},
        ):
            self.assertIsNone(self.engine.select_context([{"role": "user", "content": "x"}]))

    def test_applied_true_returns_messages(self):
        messages = [{"role": "user", "content": "kept"}]
        with mock.patch.object(
            self.engine, "_call_bridge", return_value={"applied": True, "messages": messages}
        ):
            self.assertEqual(self.engine.select_context([{"role": "user", "content": "x"}]), messages)

    def test_bridge_failure_returns_none(self):
        with mock.patch.object(self.engine, "_call_bridge", return_value=None):
            self.assertIsNone(self.engine.select_context([{"role": "user", "content": "x"}]))


if __name__ == "__main__":
    unittest.main()
```

Add to `package.json` scripts: `"test:py": "python3 -m unittest test/python/test_hermes_engine.py"`,
and append `adapters/hermes/__init__.py` to the `python3 -m py_compile ...`
list at the end of the `check` script. In `.github/workflows/ci.yml`, after the
step named `Hermes Python scaffold compiles`, add:

```yaml
      - name: Hermes Python unit tests
        run: npm run test:py
```

**Verify**: `npm run test:py` → `Ran 3 tests ... OK`. `npm run check` → exit 0.

### Step 5: Record and finish

Write the PCR (`docs/lab/TEMPLATE.md`), append INDEX/METRICS rows, bump the
PCR count in `README.md` and `docs/ARCHITECTURE.md` (skip the bump if Plan 002
has landed and the count is derived). Then `npm test` and `npm run evaluate`.

**Verify**: `npm test` → `# fail 0`; `npm run evaluate` → `EVALUATE_VERDICT=PASS`.

## Test plan

- New bridge test (Step 1): untrackable read → `applied: false` and
  `messages` deep-equal to input.
- Existing: `test/hermes-adapter.test.mjs` fail-open (no reads), PCR 0159
  dest-cwd suite, PCR 0105 host wiring — all must stay green.
- New Python tests (Step 4): `applied` false → `None`; true → messages; bridge
  `None` → `None`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test test/hermes-bridge.test.mjs` → `# fail 0` including the new test
- [ ] `npm run test:py` → `OK`
- [ ] `rg -n 'result.get\("applied"\) is not True' adapters/hermes/__init__.py` → one match
- [ ] `rg -n 'unitsByCall.size === 0' adapters/hermes/bridge.mjs` → one match
- [ ] `npm run check` exits 0 and its `py_compile` list includes `adapters/hermes/__init__.py`
- [ ] `npm test` exits 0; `npm run evaluate` prints `EVALUATE_VERDICT=PASS`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The red test in Step 1 passes before the fix.
- After Step 2 any `pcr-01*` Hermes test fails: some lab board may rely on the
  pruned-but-empty behaviour; report which one instead of loosening the gate.
- `python3` is not available or is < 3.8 in your environment.
- `clearPendingInjectedRevision` / `clearPendingReadDisposition` do not exist
  under those names in `bridge.mjs`.

## Maintenance notes

- Any new early-return in `selectContext` must clear pending state and save,
  exactly like the two existing early returns, or the next request will
  promote a stale pending revision.
- Reviewers: the semantic difference between "no reads" and "reads but nothing
  tracked" is now both `applied: false`; telemetry consumers
  (`adapters/hermes/replay.mjs:139`) already read `applied` and need no change.
- Deferred: emitting a one-line stderr diagnostic from the bridge when it fails
  open (today it is silent) would make the PCR 0159-class debugging faster;
  not included because stderr is currently reserved for fatal errors that flip
  the exit code.
