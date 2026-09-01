#!/usr/bin/env node
/** Stage a layout-complete Hermes FreshCtx plugin from a source checkout.

Creates symlinks (default) so `bridge.mjs` resolves sibling imports:
  context_engine/freshctx/bridge.mjs  ->  ../request-prune.mjs, ../engine-factory.mjs,
  ../shell-read.mjs, ../../src/index.mjs, ../../ise/treesitter/client.mjs

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
  engineFactory: ["context_engine", "engine-factory.mjs"],
  shellRead: ["context_engine", "shell-read.mjs"],
  srcDir: ["src"],
  iseDir: ["ise"],
};

export function resolveLayoutPaths(pluginsDir) {
  const root = resolve(pluginsDir);
  return {
    pluginsDir: root,
    freshctxDir: join(root, ...LAYOUT_PATHS.freshctxDir),
    requestPrune: join(root, ...LAYOUT_PATHS.requestPrune),
    engineFactory: join(root, ...LAYOUT_PATHS.engineFactory),
    shellRead: join(root, ...LAYOUT_PATHS.shellRead),
    srcDir: join(root, ...LAYOUT_PATHS.srcDir),
    iseDir: join(root, ...LAYOUT_PATHS.iseDir),
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
  const engineFactorySource = join(ADAPTERS_DIR, "engine-factory.mjs");
  const shellReadSource = join(ADAPTERS_DIR, "shell-read.mjs");
  const srcSource = join(REPO_ROOT, "src");
  const iseSource = join(REPO_ROOT, "ise");

  await ensureSymlink(hermesSource, layout.freshctxDir);
  await ensureSymlink(requestPruneSource, layout.requestPrune);
  await ensureSymlink(engineFactorySource, layout.engineFactory);
  await ensureSymlink(shellReadSource, layout.shellRead);
  await ensureSymlink(srcSource, layout.srcDir);
  await ensureSymlink(iseSource, layout.iseDir);

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
      `  freshctx      -> ${layout.freshctxDir}`,
      `  request-prune -> ${layout.requestPrune}`,
      `  engine-factory -> ${layout.engineFactory}`,
      `  shell-read    -> ${layout.shellRead}`,
      `  src           -> ${layout.srcDir}`,
      `  ise           -> ${layout.iseDir}`,
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
