import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  exportFunctionBlock,
  flipTargetInteriorMarker,
} from "../pi-trial-ts/live.mjs";
import {
  ARMS,
  HOSTS,
  MARKER_SEQUENCE,
  MUTATE_FLIPS,
  SIBLING_MARKER,
  TARGET_FILE,
  TARGET_SYMBOL,
  fixtureRoot,
  validateArm,
  validateHost,
  validateMutate,
} from "./pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const WORK_ROOT = join(here, ".work");
const SKIP_DIRS = new Set([
  ".git",
  ".venv",
  "node_modules",
  "__pycache__",
  ".pytest_cache",
  ".ruff_cache",
  ".mypy_cache",
  ".work",
]);

function workDir(host, arm) {
  validateHost(host);
  validateArm(arm);
  return join(WORK_ROOT, host, arm);
}

function parseResetArgs(argv) {
  let source = fixtureRoot();
  let host = argv[0];
  let arm = argv[1];
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--source") source = argv[++i] ?? source;
  }
  return { host, arm, source };
}

async function listFiles(root) {
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (entry.name === ".snapshot.json" || entry.name === "sheet.jsonl") continue;
      if (entry.isFile()) out.push(relative(root, full).split("\\").join("/"));
    }
  }
  await walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

async function fileHash(root, relPath) {
  const bytes = await readFile(join(root, relPath));
  return createHash("sha256").update(bytes).digest("hex");
}

async function snapshot(root) {
  const files = await listFiles(root);
  const hashes = {};
  for (const path of files) hashes[path] = await fileHash(root, path);
  return { files, hashes };
}

export function currentSettleMarker(source, symbol = TARGET_SYMBOL) {
  const block = exportFunctionBlock(source, symbol);
  for (const marker of [...MARKER_SEQUENCE].reverse()) {
    if (block.includes(marker)) return marker;
  }
  return null;
}

async function markerState(root) {
  const path = TARGET_FILE;
  const full = join(root, path);
  try {
    await stat(full);
  } catch {
    return {
      MARKER_SETTLE: { path, exists: false, value: null },
      MARKER_SIBLING: { path, exists: false, value: null },
    };
  }
  const text = await readFile(full, "utf8");
  return {
    MARKER_SETTLE: { path, exists: true, value: currentSettleMarker(text) },
    MARKER_SIBLING: {
      path,
      exists: true,
      value: text.includes(SIBLING_MARKER) ? SIBLING_MARKER : null,
    },
  };
}

async function copySource(source, dest) {
  await cp(source, dest, {
    recursive: true,
    filter: (from) => {
      const name = from.split("/").pop();
      return !SKIP_DIRS.has(name);
    },
  });
}

async function reset(host, arm, source = fixtureRoot()) {
  const dest = workDir(host, arm);
  await rm(dest, { recursive: true, force: true });
  await mkdir(WORK_ROOT, { recursive: true });
  await copySource(source, dest);
  const snap = await snapshot(dest);
  await writeFile(join(dest, ".snapshot.json"), `${JSON.stringify(snap, null, 2)}\n`);
  return dest;
}

async function mutate(host, arm, name) {
  validateMutate(name);
  const spec = MUTATE_FLIPS[name];
  const root = workDir(host, arm);
  const path = join(root, TARGET_FILE);
  const text = await readFile(path, "utf8");
  const flipped = flipTargetInteriorMarker(text, {
    v0: spec.from,
    v1: spec.to,
    symbol: TARGET_SYMBOL,
  });
  await writeFile(path, flipped);
}

async function main(argv) {
  const cmd = argv[0];
  if (cmd === "reset") {
    const { host, arm, source } = parseResetArgs(argv.slice(1));
    const dest = await reset(host, arm, source);
    process.stdout.write(`reset ${host} ${arm} from ${source} -> ${dest}\n`);
    process.stdout.write(`cd ${dest}\n`);
    return;
  }
  if (cmd === "mutate") {
    await mutate(argv[1], argv[2], argv[3]);
    const state = await markerState(workDir(argv[1], argv[2]));
    process.stdout.write(
      `${JSON.stringify({ host: argv[1], arm: argv[2], mutate: argv[3], markers: state }, null, 2)}\n`,
    );
    return;
  }
  if (cmd === "status") {
    validateHost(argv[1]);
    validateArm(argv[2]);
    const root = workDir(argv[1], argv[2]);
    const before = JSON.parse(await readFile(join(root, ".snapshot.json"), "utf8"));
    const now = await snapshot(root);
    const changed = now.files.filter((path) => before.hashes[path] !== now.hashes[path]);
    const deleted = before.files.filter((path) => !now.files.includes(path));
    const added = now.files.filter((path) => !before.files.includes(path));
    process.stdout.write(
      `${JSON.stringify({
        host: argv[1],
        arm: argv[2],
        root,
        markers: await markerState(root),
        changed,
        deleted,
        added,
      }, null, 2)}\n`,
    );
    return;
  }
  if (cmd === "arms") {
    process.stdout.write(`${ARMS.join("\n")}\n`);
    return;
  }
  if (cmd === "hosts") {
    process.stdout.write(`${HOSTS.join("\n")}\n`);
    return;
  }
  throw new Error("usage: live.mjs reset|mutate|status|arms|hosts ...");
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}

export { markerState, mutate, reset, workDir };
