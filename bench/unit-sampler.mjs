import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, sep } from "node:path";

const EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  "vendor",
  "third_party",
  "dist",
  "build",
  "out",
  ".git",
  "__pycache__",
  "target",
]);

const GENERATED_NAME = /(?:^|[._-])(?:generated|min|bundle)(?:[._-]|$)/iu;
const SOURCE_EXT = new Set([".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".go", ".rs", ".lua", ".c", ".h"]);

export function rankKey(commit, selector, scenario) {
  return createHash("sha256").update(`${commit}${selector}${scenario}`).digest("hex");
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRel(relPath) {
  return relPath.split(sep).join("/");
}

export function classifyPath(relPath) {
  const posix = normalizeRel(relPath);
  const parts = posix.split("/");
  if (parts.some((part) => part === ".." || part === "")) {
    return { reject: "path-escape" };
  }
  if (parts.some((part) => EXCLUDE_DIR_NAMES.has(part))) {
    return { reject: "vendored" };
  }
  if (parts.some((part) => part === "build" || part === "dist" || part === "out")) {
    return { reject: "build-output" };
  }
  const base = parts.at(-1) ?? "";
  if (/\.min\.(?:js|css)$/iu.test(base) || GENERATED_NAME.test(base)) {
    return { reject: "generated-or-minified" };
  }
  const dot = base.lastIndexOf(".");
  const ext = dot === -1 ? "" : base.slice(dot).toLowerCase();
  if (!SOURCE_EXT.has(ext)) {
    return { reject: "parser-not-implemented" };
  }
  return { reject: null };
}

export function fileCandidate({ commit, scenario, repoId, path, content }) {
  const text = String(content).replaceAll("\r\n", "\n");
  const lines = text.split("\n");
  const selector = `${path}::file`;
  return {
    repo: repoId,
    path,
    selector,
    scope: "file",
    startLine: 1,
    endLine: Math.max(1, lines.length),
    byteRange: [0, Buffer.byteLength(text)],
    sha256: sha256Bytes(text),
    rankKey: rankKey(commit, selector, scenario),
    content: text,
  };
}

export function sampleUnits({
  commit,
  scenario,
  repoId = "fixture",
  files,
  n = 10,
}) {
  const rejected = [];
  const eligible = [];
  for (const [path, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const verdict = classifyPath(path);
    if (verdict.reject) {
      rejected.push({
        repo: repoId,
        path,
        selector: `${path}::file`,
        reason: verdict.reject,
        rankKey: rankKey(commit, `${path}::file`, scenario),
      });
      continue;
    }
    eligible.push(fileCandidate({ commit, scenario, repoId, path, content }));
  }
  eligible.sort((a, b) => (a.rankKey < b.rankKey ? -1 : a.rankKey > b.rankKey ? 1 : a.selector.localeCompare(b.selector)));
  const selected = eligible.slice(0, n).map(({ content, ...rest }) => rest);
  const overflow = eligible.slice(n).map((unit) => ({
    repo: unit.repo,
    path: unit.path,
    selector: unit.selector,
    reason: "below-rank-cutoff",
    rankKey: unit.rankKey,
  }));
  return {
    schemaVersion: 1,
    selectionRule: "sha256(commit + selector + scenario)",
    commit,
    scenario,
    n,
    selected,
    rejected: [...rejected, ...overflow],
    bodies: Object.fromEntries(eligible.slice(0, n).map((unit) => [unit.path, unit.content])),
  };
}

async function walkFiles(absRoot, rel = "") {
  const entries = await readdir(join(absRoot, rel), { withFileTypes: true });
  const out = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
      out.push(...(await walkFiles(absRoot, next)));
      continue;
    }
    if (entry.isFile()) out.push(next);
  }
  return out;
}

export async function sampleWorkspace({ workspaceRoot, commit, scenario, repoId, n = 10 }) {
  const files = {};
  for (const rel of await walkFiles(workspaceRoot)) {
    const verdict = classifyPath(rel);
    if (verdict.reject && verdict.reject !== "parser-not-implemented" && verdict.reject !== "generated-or-minified") {
      files[rel] = "";
      continue;
    }
    files[rel] = await readFile(join(workspaceRoot, rel), "utf8");
  }
  return sampleUnits({ commit, scenario, repoId, files, n });
}

export function tracesFromSample({ sample, family = "interior-edit", repository = "synthetic://sampler", license = "MIT" }) {
  return sample.selected.map((unit) => {
    const body = sample.bodies[unit.path];
    const firstLine = body.split("\n")[0] ?? "";
    const mutated = body.replace(firstLine, `${firstLine} // sampler interior edit`);
    const gold = mutated
      .split("\n")
      .slice(unit.startLine - 1, unit.endLine)
      .join("\n");
    const replacement = `${firstLine} // sampler interior edit`;
    return {
      schemaVersion: 1,
      name: `${sample.selected[0] ? unit.repo : "repo"}/${family}/${unit.selector.replaceAll("/", "-")}`,
      source: { repository, commit: sample.commit, license },
      initialFiles: { [unit.path]: body },
      events: [
        {
          type: "read",
          path: unit.path,
          scope: "file",
          startLine: unit.startLine,
          endLine: unit.endLine,
          selector: unit.selector,
        },
        {
          type: "capture-request",
          task: `review ${unit.selector}`,
          budgetChars: 12000,
          requiredUnits: [{ path: unit.path, selector: unit.selector, sha256: unit.sha256 }],
        },
        {
          type: "replace-exact",
          path: unit.path,
          expected: firstLine,
          replacement: `${firstLine} // sampler interior edit`,
        },
        {
          type: "capture-request",
          task: `review ${unit.selector}`,
          budgetChars: 12000,
          requiredUnits: [{ path: unit.path, selector: unit.selector, sha256: sha256Bytes(gold) }],
        },
      ],
      goldExtract: {
        source: "generator-offsets",
        path: unit.path,
        startLine: unit.startLine,
        endLine: unit.endLine,
        byteRange: unit.byteRange,
        preSha256: unit.sha256,
        postSha256: sha256Bytes(gold),
        mutation: { type: "replace-exact", expected: firstLine, replacement },
      },
    };
  });
}

export async function generateSamplerTraces({ root, manifest, pack, files }) {
  const commit =
    manifest.repositoryLocks?.flask ??
    manifest.repositoryLocks?.synthetic?.commit ??
    manifest.repositoryLocks?.synthetic ??
    manifest.implementationCommitSha ??
    "0".repeat(40);
  const scenario = manifest.mutationFamilies?.[0] ?? "interior-edit";
  const n = manifest.samplingRules?.unitsPerFamily ?? 1;
  const fixtureFiles = files ?? {
    "src/alpha.py": "def alpha():\n    return 1\n",
    "src/beta.py": "def beta():\n    return 2\n",
    "vendor/skip.py": "def skip():\n    return 0\n",
    "notes.txt": "not source\n",
  };
  const sample = sampleUnits({
    commit,
    scenario,
    repoId: manifest.repositoryIds?.[0] ?? "synthetic",
    files: fixtureFiles,
    n,
  });
  await mkdir(join(root, pack.tracesDir), { recursive: true });
  const { bodies: _bodies, ...record } = sample;
  await writeFile(
    join(root, pack.tracesDir, "candidates.json"),
    `${JSON.stringify({ schemaVersion: 1, selected: record.selected, commit: record.commit, scenario: record.scenario }, null, 2)}\n`,
  );
  await writeFile(join(root, pack.tracesDir, "candidates-rejected.json"), `${JSON.stringify(record, null, 2)}\n`);
  const traces = tracesFromSample({ sample, family: scenario });
  for (const trace of traces) {
    const name = `${trace.name.replaceAll("/", "-")}.json`;
    await writeFile(join(root, pack.tracesDir, name), `${JSON.stringify(trace, null, 2)}\n`);
  }
  return { generator: "unit-sampler", selected: sample.selected.length, rejected: sample.rejected.length };
}

export function assertNoResolverImport(source) {
  const importRe = /^import\s+.*from\s+["'][^"']*(anchors|registry)\.mjs["']/m;
  return !importRe.test(source);
}
