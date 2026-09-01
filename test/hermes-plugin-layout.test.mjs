import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { installHermesPlugin } from "../adapters/hermes/install.mjs";
import {
  assertBridgeImports,
  assertLayoutComplete,
  missingLayoutPaths,
  probeBridge,
  stageHermesOnlyExtract,
} from "../adapters/hermes/verify-layout.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HERMES_SOURCE = join(ROOT, "adapters", "hermes");

test("hermes-only plugin layout fails layout check", async () => {
  const { tempRoot, pluginsDir } = await stageHermesOnlyExtract(HERMES_SOURCE);
  try {
    const missing = await missingLayoutPaths(pluginsDir);
    assert.ok(missing.some((item) => item.label === "request-prune.mjs"));
    assert.ok(missing.some((item) => item.label === "engine-factory.mjs"));
    assert.ok(missing.some((item) => item.label === "shell-read.mjs"));
    assert.ok(missing.some((item) => item.label === "src/index.mjs"));
    assert.ok(missing.some((item) => item.label === "ise/treesitter/client.mjs"));
    await assert.rejects(
      () => assertLayoutComplete(pluginsDir),
      /hermes-only or incomplete plugin layout/u,
    );

    const bridge = join(pluginsDir, "context_engine", "freshctx", "bridge.mjs");
    const run = probeBridge(bridge, { cwd: tempRoot });
    assert.notEqual(run.status, 0, "hermes-only bridge must fail import");
    assert.match(run.stderr ?? "", /Cannot find module/u);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("install script stages layout-complete plugin tree", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-hermes-install-"));
  const pluginsDir = join(tempRoot, "plugins");
  try {
    await installHermesPlugin(pluginsDir);
    await assertLayoutComplete(pluginsDir);
    await assertBridgeImports(pluginsDir, { cwd: tempRoot });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
