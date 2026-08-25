import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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
  MARKER_README: { path: "README.md", v0: "RD0", v1: "RD1" },
  MARKER_CLI: { path: "src/viajante/cli.py", v0: "CL0", v1: "CL1" },
  MARKER_MODELS: { path: "src/viajante/models.py", v0: "MD0", v1: "MD1" },
  MARKER_FLIGHTS: { path: "src/viajante/flights.py", v0: "FL0", v1: "FL1" },
  MARKER_TODO: { path: "notes/freshctx-todo.md", v0: "TD0", v1: "TD1" },
};

function workDir(arm) {
  if (arm !== "with" && arm !== "without") {
    throw new Error("arm must be with or without");
  }
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

function stampLine(path, name, value) {
  if (path.endsWith(".py")) return `\n# ${name}=${value}\n`;
  if (path.endsWith(".md")) return `\n<!-- ${name}=${value} -->\n`;
  return `\n// ${name}=${value}\n`;
}

async function stampMarkers(root) {
  await mkdir(join(root, "notes"), { recursive: true });
  await writeFile(
    join(root, "notes/freshctx-todo.md"),
    `# freshctx trial\n\nMARKER_TODO=TD0\n\nDelete this file in cell 5.\n`,
    "utf8",
  );
  for (const [name, spec] of Object.entries(MARKERS)) {
    if (spec.path === "notes/freshctx-todo.md") continue;
    const full = join(root, spec.path);
    const text = await readFile(full, "utf8");
    if (text.includes(`${name}=`)) continue;
    await writeFile(full, `${text.replace(/\n$/u, "")}${stampLine(spec.path, name, spec.v0)}`);
  }
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
  await stampMarkers(dest);
  const snap = await snapshot(dest);
  await writeFile(join(dest, ".snapshot.json"), `${JSON.stringify(snap, null, 2)}\n`);
  return dest;
}

async function flipMarker(root, name) {
  const spec = MARKERS[name];
  const path = join(root, spec.path);
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replaceAll(spec.v0, spec.v1));
}

async function mutate(arm, name) {
  const root = workDir(arm);
  const actions = {
    async "flip-cli"() {
      await flipMarker(root, "MARKER_CLI");
    },
    async "flip-readme"() {
      await flipMarker(root, "MARKER_README");
    },
    async "flip-models"() {
      await flipMarker(root, "MARKER_MODELS");
    },
    async "delete-todo"() {
      await rm(join(root, "notes/freshctx-todo.md"), { force: true });
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
  throw new Error("usage: live.mjs reset|mutate|status ...");
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
