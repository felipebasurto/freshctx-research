#!/usr/bin/env node
/** Verify a Hermes plugin tree includes bridge sibling imports.

Fails when only `context_engine/freshctx/` is present (hermes-only extract).
*/

import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { mkdtemp, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveLayoutPaths } from "./install.mjs";

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function missingLayoutPaths(pluginsDir) {
  const layout = resolveLayoutPaths(pluginsDir);
  const required = [
    ["bridge", layout.bridge],
    ["request-prune.mjs", layout.requestPrune],
    ["src/index.mjs", join(layout.srcDir, "index.mjs")],
  ];
  const missing = [];
  for (const [label, path] of required) {
    if (!(await pathExists(path))) missing.push({ label, path });
  }
  return missing;
}

export async function assertLayoutComplete(pluginsDir) {
  const missing = await missingLayoutPaths(pluginsDir);
  if (missing.length > 0) {
    const detail = missing.map((item) => `${item.label} (${item.path})`).join(", ");
    throw new Error(`hermes-only or incomplete plugin layout; missing: ${detail}`);
  }
}

export function probeBridge(bridgePath, { cwd = process.cwd() } = {}) {
  const payload = {
    operation: "select",
    cwd,
    stateFile: join(cwd, "freshctx-layout-probe.json"),
    budgetTokens: 1000,
    messages: [],
  };
  return spawnSync(process.execPath, [bridgePath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

export async function assertBridgeImports(pluginsDir, { cwd = process.cwd() } = {}) {
  await assertLayoutComplete(pluginsDir);
  const { bridge } = resolveLayoutPaths(pluginsDir);
  const run = probeBridge(bridge, { cwd });
  if (run.status !== 0) {
    const detail = (run.stderr || run.stdout || "bridge probe failed").trim();
    throw new Error(`bridge import probe failed: ${detail}`);
  }
}

export async function stageHermesOnlyExtract(sourceHermesDir) {
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-hermes-only-"));
  const pluginsDir = join(tempRoot, "plugins");
  const freshctxDir = join(pluginsDir, "context_engine", "freshctx");
  await cp(sourceHermesDir, freshctxDir, { recursive: true });
  return { tempRoot, pluginsDir };
}

async function main() {
  const pluginsDir = process.argv[2] ?? join(process.cwd(), "plugins");
  await assertBridgeImports(pluginsDir);
  process.stdout.write(`layout-complete: ${resolve(pluginsDir)}\n`);
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
