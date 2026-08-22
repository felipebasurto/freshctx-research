#!/usr/bin/env node
/** Stage a layout-complete Hermes FreshCtx plugin from a source checkout.

Creates symlinks (default) so `bridge.mjs` resolves sibling imports:
  context_engine/freshctx/bridge.mjs  ->  ../request-prune.mjs, ../../src/index.mjs

Usage:
  node adapters/hermes/install.mjs [plugins-dir]

`plugins-dir` defaults to `./plugins` (Hermes Agent repo root) or
`HERMES_PLUGINS` when set. Pass the directory that contains `context_engine/`.
*/

import { access, lstat, mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERMES_DIR = dirname(fileURLToPath(import.meta.url));
const ADAPTERS_DIR = dirname(HERMES_DIR);
const REPO_ROOT = dirname(ADAPTERS_DIR);

export const LAYOUT_PATHS = {
  freshctxDir: ["context_engine", "freshctx"],
  requestPrune: ["context_engine", "request-prune.mjs"],
  srcDir: ["src"],
};

export function resolveLayoutPaths(pluginsDir) {
  const root = resolve(pluginsDir);
  return {
    pluginsDir: root,
    freshctxDir: join(root, ...LAYOUT_PATHS.freshctxDir),
    requestPrune: join(root, ...LAYOUT_PATHS.requestPrune),
    srcDir: join(root, ...LAYOUT_PATHS.srcDir),
    bridge: join(root, ...LAYOUT_PATHS.freshctxDir, "bridge.mjs"),
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureSymlink(target, linkPath) {
  if (await pathExists(linkPath)) {
    const stat = await lstat(linkPath);
    if (stat.isSymbolicLink()) {
      await rm(linkPath);
    } else {
      throw new Error(`refusing to replace non-symlink: ${linkPath}`);
    }
  }
  await mkdir(dirname(linkPath), { recursive: true });
  await symlink(target, linkPath);
}

export async function installHermesPlugin(pluginsDir, { mode = "symlink" } = {}) {
  if (mode !== "symlink") {
    throw new Error(`unsupported install mode: ${mode}`);
  }

  const layout = resolveLayoutPaths(pluginsDir);
  const hermesSource = join(ADAPTERS_DIR, "hermes");
  const requestPruneSource = join(ADAPTERS_DIR, "request-prune.mjs");
  const srcSource = join(REPO_ROOT, "src");

  await ensureSymlink(hermesSource, layout.freshctxDir);
  await ensureSymlink(requestPruneSource, layout.requestPrune);
  await ensureSymlink(srcSource, layout.srcDir);

  return layout;
}

async function main() {
  const pluginsDir = process.argv[2]
    ?? process.env.HERMES_PLUGINS
    ?? join(process.cwd(), "plugins");
  const layout = await installHermesPlugin(pluginsDir);
  process.stdout.write(
    `${[
      "FreshCtx Hermes plugin installed (layout-complete):",
      `  freshctx     -> ${layout.freshctxDir}`,
      `  request-prune -> ${layout.requestPrune}`,
      `  src          -> ${layout.srcDir}`,
      "",
      "Select in Hermes configuration:",
      "  context:",
      "    engine: freshctx",
    ].join("\n")}\n`,
  );
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
