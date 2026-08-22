import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const inTreeBridge = fileURLToPath(new URL("../adapters/hermes/bridge.mjs", import.meta.url));

function minimalSelectPayload(workspace) {
  return {
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
      { role: "tool", tool_call_id: "call-1", content: "stale\n" },
    ],
  };
}

test("Hermes bridge in-tree layout resolves sibling imports", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-hermes-intree-"));
  await writeFile(join(workspace, "source.ts"), "current\n");
  const run = spawnSync(process.execPath, [inTreeBridge], {
    input: JSON.stringify(minimalSelectPayload(workspace)),
    encoding: "utf8",
  });

  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.applied, true);
});

test("Hermes-only extract layout cannot resolve ../request-prune.mjs (PCR 0050 probe)", async () => {
  const extractRoot = await mkdtemp(join(tmpdir(), "freshctx-hermes-extract-"));
  const hermesDir = join(extractRoot, "adapters", "hermes");
  await mkdir(hermesDir, { recursive: true });
  await cp(inTreeBridge, join(hermesDir, "bridge.mjs"));

  const workspace = await mkdtemp(join(tmpdir(), "freshctx-hermes-extract-run-"));
  await writeFile(join(workspace, "source.ts"), "current\n");
  const isolatedBridge = join(hermesDir, "bridge.mjs");
  const run = spawnSync(process.execPath, [isolatedBridge], {
    input: JSON.stringify(minimalSelectPayload(workspace)),
    encoding: "utf8",
  });

  assert.notEqual(run.status, 0);
  assert.equal(run.stdout.trim(), "");
  assert.match(`${run.stderr}\n${run.stdout}`, /request-prune\.mjs|ERR_MODULE_NOT_FOUND/);
});
