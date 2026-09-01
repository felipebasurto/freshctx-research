import assert from "node:assert/strict";
import { access, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  installHermesPlugin,
  resolveLayoutPaths,
} from "../adapters/hermes/install.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("layout map names only existing contract directories", async () => {
  const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  assert.equal(packageJson.scripts.test, "node --test test/*.test.mjs");

  const layout = await readFile(join(ROOT, "docs", "LAYOUT.md"), "utf8");
  assert.ok(layout.includes("```text\nnode --test test/*.test.mjs\n```"));
  for (const relativePath of [
    "src/",
    "adapters/",
    "ise/treesitter/",
    "test/",
    "bench/",
    "capture/",
    "autoresearch/",
    "docs/",
    "papers/",
  ]) {
    assert.ok(layout.includes(`\`${relativePath}\``), relativePath);
    await access(join(ROOT, relativePath));
  }
});

test("Hermes installed layout reaches request pruning and core source", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-layout-contract-"));
  const pluginsDir = join(tempRoot, "plugins");

  try {
    await installHermesPlugin(pluginsDir);
    const layout = resolveLayoutPaths(pluginsDir);
    assert.equal(
      await realpath(layout.requestPrune),
      await realpath(join(ROOT, "adapters", "request-prune.mjs")),
    );
    assert.equal(
      await realpath(layout.engineFactory),
      await realpath(join(ROOT, "adapters", "engine-factory.mjs")),
    );
    assert.equal(
      await realpath(layout.shellRead),
      await realpath(join(ROOT, "adapters", "shell-read.mjs")),
    );
    assert.equal(await realpath(layout.srcDir), await realpath(join(ROOT, "src")));
    assert.equal(await realpath(layout.iseDir), await realpath(join(ROOT, "ise")));
    assert.equal(await realpath(layout.userPluginDir), await realpath(join(ROOT, "adapters", "hermes")));
    await access(join(layout.srcDir, "index.mjs"));
    await access(join(layout.iseDir, "treesitter", "client.mjs"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
