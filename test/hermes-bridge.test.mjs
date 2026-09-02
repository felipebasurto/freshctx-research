import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("Hermes bridge replaces a captured read with one current file", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-hermes-test-"));
  const current = "export const value = 'current-revision';\n";
  const stale = "export const value = 'stale-revision';\n";
  await writeFile(join(workspace, "source.ts"), current);
  const payload = {
    operation: "select",
    cwd: workspace,
    stateFile: join(workspace, "state", "session.json"),
    budgetTokens: 100_000,
    messages: [
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "read_file", arguments: JSON.stringify({ path: "source.ts" }) },
          },
        ],
      },
      { role: "tool", tool_call_id: "call-1", content: stale },
    ],
  };
  const bridge = fileURLToPath(new URL("../adapters/hermes/bridge.mjs", import.meta.url));
  const run = spawnSync(process.execPath, [bridge], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });

  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  const serialized = JSON.stringify(result.messages);
  assert.doesNotMatch(serialized, /stale-revision/);
  assert.equal(serialized.split("current-revision").length - 1, 1);
  assert.match(serialized, /freshctx:/);
});

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
