import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARMS,
  MARKER_V0,
  MARKER_V1,
  SIBLING_MARKER,
  TARGET_FILE,
  validateArm,
} from "./pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixture");
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

const MARKERS = {
  MARKER_SETTLE: { path: TARGET_FILE, v0: MARKER_V0, v1: MARKER_V1 },
  MARKER_SIBLING: { path: TARGET_FILE, v0: SIBLING_MARKER, v1: SIBLING_MARKER },
};

function workDir(arm) {
  validateArm(arm);
  return join(WORK_ROOT, arm);
}

function parseResetArgs(argv) {
  let source = FIXTURE;
  let arm = argv[0];
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === "--source") source = argv[++i] ?? source;
  }
  return { arm, source };
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

async function markerState(root) {
  const state = {};
  for (const [name, spec] of Object.entries(MARKERS)) {
    const full = join(root, spec.path);
    try {
      await stat(full);
    } catch {
      state[name] = { path: spec.path, exists: false, value: null };
      continue;
    }
    const text = await readFile(full, "utf8");
    let value = null;
    if (text.includes(spec.v1)) value = spec.v1;
    else if (text.includes(spec.v0)) value = spec.v0;
    state[name] = { path: spec.path, exists: true, value };
  }
  return state;
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

async function reset(arm, source) {
  const dest = workDir(arm);
  await rm(dest, { recursive: true, force: true });
  await mkdir(WORK_ROOT, { recursive: true });
  await copySource(source, dest);
  const snap = await snapshot(dest);
  await writeFile(join(dest, ".snapshot.json"), `${JSON.stringify(snap, null, 2)}\n`);
  return dest;
}

async function flipMarker(root, name) {
  const spec = MARKERS[name];
  const path = join(root, spec.path);
  const text = await readFile(path, "utf8");
  if (!text.includes(spec.v0)) {
    throw new Error(`${name} missing ${spec.v0} in ${spec.path}`);
  }
  await writeFile(path, text.replaceAll(spec.v0, spec.v1));
}

async function mutate(arm, name) {
  const root = workDir(arm);
  const actions = {
    async "flip-settle"() {
      await flipMarker(root, "MARKER_SETTLE");
    },
  };
  if (!actions[name]) {
    throw new Error(`unknown mutate ${name}. use ${Object.keys(actions).join("|")}`);
  }
  await actions[name]();
}

async function main(argv) {
  const cmd = argv[0];
  if (cmd === "reset") {
    const { arm, source } = parseResetArgs(argv.slice(1));
    const dest = await reset(arm, source);
    process.stdout.write(`reset ${arm} from ${source} -> ${dest}\n`);
    process.stdout.write(`cd ${dest}\n`);
    return;
  }
  if (cmd === "mutate") {
    await mutate(argv[1], argv[2]);
    const state = await markerState(workDir(argv[1]));
    process.stdout.write(`${JSON.stringify({ arm: argv[1], mutate: argv[2], markers: state }, null, 2)}\n`);
    return;
  }
  if (cmd === "status") {
    validateArm(argv[1]);
    const root = workDir(argv[1]);
    const before = JSON.parse(await readFile(join(root, ".snapshot.json"), "utf8"));
    const now = await snapshot(root);
    const changed = now.files.filter((path) => before.hashes[path] !== now.hashes[path]);
    const deleted = before.files.filter((path) => !now.files.includes(path));
    const added = now.files.filter((path) => !before.files.includes(path));
    process.stdout.write(
      `${JSON.stringify({ arm: argv[1], root, markers: await markerState(root), changed, deleted, added }, null, 2)}\n`,
    );
    return;
  }
  if (cmd === "arms") {
    process.stdout.write(`${ARMS.join("\n")}\n`);
    return;
  }
  throw new Error("usage: live.mjs reset|mutate|status|arms ...");
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}

export { MARKERS, markerState, mutate, reset, workDir };
