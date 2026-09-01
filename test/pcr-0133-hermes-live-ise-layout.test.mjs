import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { installHermesPlugin, resolveLayoutPaths } from "../adapters/hermes/install.mjs";
import { missingLayoutPaths } from "../adapters/hermes/verify-layout.mjs";
import {
  buildReadToolCall as buildHermesReadToolCall,
  buildToolResultMessage,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import {
  exportFunctionBlock,
  flipTargetInteriorMarker,
} from "../docs/lab/pi-trial-ts/live.mjs";
import {
  MARKER_V1,
  SIBLING_MARKER,
  TARGET_FILE,
  TARGET_SYMBOL,
  hostReadToolArgs,
} from "../docs/lab/pi-trial-ts/pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../docs/lab/pi-trial-ts/fixture/src/settlement.ts");

async function destageLayout(pluginsDir, destPluginsDir) {
  const src = resolveLayoutPaths(pluginsDir);
  const dest = resolveLayoutPaths(destPluginsDir);
  await mkdir(dirname(dest.freshctxDir), { recursive: true });
  await cp(src.freshctxDir, dest.freshctxDir, { recursive: true });
  await cp(src.requestPrune, dest.requestPrune);
  await cp(src.engineFactory, dest.engineFactory);
  await cp(src.shellRead, dest.shellRead);
  await mkdir(dirname(dest.srcDir), { recursive: true });
  await cp(src.srcDir, dest.srcDir, { recursive: true });
  await mkdir(dirname(dest.iseDir), { recursive: true });
  await cp(src.iseDir, dest.iseDir, { recursive: true });
  return dest;
}

function runInstalledBridge(bridge, payload, timeoutMs = 15_000) {
  return spawnSync(process.execPath, [bridge], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: timeoutMs,
  });
}

test("PCR 0133 Hermes install layout names Isolated Semantic Engine siblings", async () => {
  const layout = resolveLayoutPaths("/tmp/freshctx-pcr-0133-layout-names");
  assert.equal(layout.engineFactory.endsWith("context_engine/engine-factory.mjs"), true);
  assert.equal(layout.shellRead.endsWith("context_engine/shell-read.mjs"), true);
  assert.equal(layout.iseDir.endsWith("/ise"), true);
  const python = await readFile(join(here, "../adapters/hermes/__init__.py"), "utf8");
  assert.match(python, /FRESHCTX_BRIDGE_TIMEOUT", "15\.0"/u);
});

test("PCR 0133 Hermes install ships Isolated Semantic Engine so a destaged plugin can import it", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-pcr-0133-install-"));
  const pluginsDir = join(tempRoot, "plugins");
  try {
    await installHermesPlugin(pluginsDir);
    const layout = resolveLayoutPaths(pluginsDir);
    await access(layout.engineFactory);
    await access(layout.shellRead);
    await access(join(layout.iseDir, "treesitter", "client.mjs"));
    await access(join(layout.iseDir, "treesitter", "parse.mjs"));
    const missing = await missingLayoutPaths(pluginsDir);
    assert.equal(missing.length, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("PCR 0133 destaged Hermes plugin symbol-scope settleDailyLedger refresh uses Isolated Semantic Engine", async () => {
  const source = await readFile(fixturePath, "utf8");
  const observedSymbol = exportFunctionBlock(source, TARGET_SYMBOL);
  const flippedFile = flipTargetInteriorMarker(source, {
    v0: "ST0",
    v1: MARKER_V1,
    symbol: TARGET_SYMBOL,
  });

  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-pcr-0133-destage-"));
  const pluginsDir = join(tempRoot, "plugins");
  const destPluginsDir = join(tempRoot, "destaged");
  const workspace = join(tempRoot, "ws");
  try {
    await installHermesPlugin(pluginsDir);
    const dest = await destageLayout(pluginsDir, destPluginsDir);
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, TARGET_FILE), flippedFile);
    const stateFile = await createHermesStateFile("freshctx-pcr-0133-destage-state-");
    const messages = [
      buildHermesReadToolCall({ toolCallId: "call-settle", ...hostReadToolArgs() }),
      buildToolResultMessage({ toolCallId: "call-settle", content: observedSymbol }),
      { role: "user", content: "quote current MARKER_SETTLE" },
    ];

    const observe = runInstalledBridge(dest.bridge, {
      operation: "observe",
      cwd: workspace,
      stateFile,
      messages,
    });
    assert.equal(observe.status, 0, observe.stderr || "observe failed");

    const select = runInstalledBridge(dest.bridge, {
      operation: "select",
      cwd: workspace,
      stateFile,
      budgetTokens: 8_000,
      messages,
    });
    assert.equal(select.status, 0, select.stderr || "select failed");
    assert.match(select.stdout, /<freshctx-unit/u);
    assert.match(select.stdout, /resolution":"isolated-semantic-engine"|resolution=\\"isolated-semantic-engine\\"/u);
    assert.match(select.stdout, /"ST1"|ST1/u);
    assert.equal(select.stdout.includes(SIBLING_MARKER), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
