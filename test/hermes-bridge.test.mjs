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
