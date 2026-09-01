import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  FRESHCTX_ENGINE_NAME,
  discoverFreshctxEngine,
  installHermesPlugin,
  resolveLayoutPaths,
} from "../adapters/hermes/install.mjs";
import { missingLayoutPaths } from "../adapters/hermes/verify-layout.mjs";
import { FORCE_HOST_READ_PLUGIN_NAME } from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import { hermesConfigYaml, prepareHermesHome } from "../docs/lab/hermes-trial-ts/launch-hermes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const hermesInit = join(here, "../adapters/hermes/__init__.py");

test("PCR 0134 FreshCtx plugin registers context engine name freshctx", async () => {
  const python = await readFile(hermesInit, "utf8");
  assert.match(python, /^def register\(ctx\):/mu);
  assert.match(python, /ctx\.register_context_engine\(/u);
  assert.match(python, /return "freshctx"/u);
  assert.equal(FRESHCTX_ENGINE_NAME, "freshctx");
});

test("PCR 0134 install stages user-plugin name freshctx beside destaged Isolated Semantic Engine", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-pcr-0134-install-"));
  const pluginsDir = join(tempRoot, "plugins");
  try {
    const layout = await installHermesPlugin(pluginsDir);
    await access(layout.userPluginDir);
    await access(join(layout.userPluginDir, "plugin.yaml"));
    await access(join(layout.userPluginDir, "__init__.py"));
    await access(layout.engineFactory);
    await access(layout.shellRead);
    const yaml = await readFile(join(layout.userPluginDir, "plugin.yaml"), "utf8");
    assert.match(yaml, /^name:\s*freshctx\s*$/mu);
    const missing = await missingLayoutPaths(pluginsDir);
    assert.equal(missing.length, 0);
    assert.equal(layout.userPluginDir, join(pluginsDir, "freshctx"));
    assert.equal(resolveLayoutPaths(pluginsDir).freshctxDir.endsWith("context_engine/freshctx"), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("PCR 0134 isolated HERMES_HOME enables and discovers freshctx on FreshCtx arms", async () => {
  const hermesHome = await mkdtemp(join(tmpdir(), "freshctx-pcr-0134-home-"));
  try {
    const prepared = await prepareHermesHome({ arm: "freshctx-ts", hermesHome });
    assert.equal(prepared.engine, "freshctx");
    const config = await readFile(join(hermesHome, "config.yaml"), "utf8");
    assert.match(config, new RegExp(`enabled:\\n\\s+- ${FORCE_HOST_READ_PLUGIN_NAME}\\n\\s+- freshctx`, "u"));
    assert.match(config, /engine:\s*freshctx/u);
    const yaml = hermesConfigYaml({ engine: "freshctx" });
    assert.match(yaml, /-\s+freshctx/u);
    const nothingYaml = hermesConfigYaml({});
    assert.doesNotMatch(nothingYaml, /-\s+freshctx/u);
    assert.doesNotMatch(nothingYaml, /engine:\s*freshctx/u);

    const found = await discoverFreshctxEngine({
      bundledContextEngineDir: join(hermesHome, "bundled-missing", "context_engine"),
      userPluginsDir: prepared.pluginsDir,
      configYaml: config,
    });
    assert.equal(found.found, true);
    assert.equal(found.source, "user-plugin");
    assert.equal(found.name, "freshctx");
  } finally {
    await rm(hermesHome, { recursive: true, force: true });
  }
});

test("PCR 0134 destaged context_engine tree alone does not discover freshctx", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-pcr-0134-nested-only-"));
  const pluginsDir = join(tempRoot, "plugins");
  try {
    await installHermesPlugin(pluginsDir);
    const enabledFreshctx = [
      "plugins:",
      "  enabled:",
      `    - ${FORCE_HOST_READ_PLUGIN_NAME}`,
      "    - freshctx",
      "context:",
      "  engine: freshctx",
    ].join("\n");
    const destageOnly = await discoverFreshctxEngine({
      bundledContextEngineDir: join(tempRoot, "hermes-agent", "plugins", "context_engine"),
      userPluginsDir: pluginsDir,
      configYaml: enabledFreshctx,
    });
    assert.equal(destageOnly.found, true, "install must also expose the user-plugin name");

    const leftover = await discoverFreshctxEngine({
      bundledContextEngineDir: join(tempRoot, "hermes-agent", "plugins", "context_engine"),
      userPluginsDir: join(tempRoot, "plugins-without-user-name"),
      configYaml: enabledFreshctx,
    });
    assert.equal(leftover.found, false);
    assert.equal(leftover.reason, "not-found");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
