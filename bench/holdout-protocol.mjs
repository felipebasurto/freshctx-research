import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { sha256 } from "../src/hash.mjs";

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export class ProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProtocolError";
  }
}

const IMPLEMENTATION_PATHS = [
  "src/policy.mjs",
  "src/anchors.mjs",
  "src/projector.mjs",
];

const PROVENANCE_GENERATE = "generate.json";
const PROVENANCE_RUN = "run.json";

export function computeManifestHash(manifest) {
  const clone = structuredClone(manifest);
  delete clone.manifestSha256;
  delete clone.freezeCommitSha;
  return sha256(`${JSON.stringify(clone, null, 2)}\n`);
}

export function resolvePackPaths(root, manifest) {
  return {
    root,
    packId: manifest.packId ?? manifest.benchmarkVersion,
    manifestPath: relative(root, join(root, manifest.manifestPath ?? `bench/splits/${manifest.packId}.json`)),
    tracesDir: manifest.tracePackDir ?? `bench/packs/${manifest.packId}/traces`,
    reportsDir: manifest.reportsDir ?? `bench/packs/${manifest.packId}/reports`,
    provenanceDir: manifest.provenanceDir ?? `bench/packs/${manifest.packId}/provenance`,
    reposLockPath: manifest.reposLockPath ?? "bench/repos.lock.json",
    reportFiles: manifest.reportFiles ?? [
      join(manifest.reportsDir ?? `bench/packs/${manifest.packId}/reports`, "report.md"),
      join(manifest.reportsDir ?? `bench/packs/${manifest.packId}/reports`, "results.jsonl"),
    ],
  };
}

export function protocolWatchPaths(pack) {
  return [
    pack.manifestPath,
    pack.reposLockPath,
    ...IMPLEMENTATION_PATHS,
    pack.tracesDir,
    pack.reportsDir,
    pack.provenanceDir,
  ];
}

function git(args, cwd) {
  const run = spawnSync("git", args, { encoding: "utf8", cwd });
  if (run.error?.code === "ENOENT") {
    throw new ProtocolError("git executable not found; fail closed");
  }
  return run;
}

export function requireGit() {
  const run = git(["--version"], DEFAULT_ROOT);
  if (run.status !== 0) {
    throw new ProtocolError("git unavailable; fail closed");
  }
}

export function gitRevParse(cwd, ref = "HEAD") {
  const run = git(["rev-parse", ref], cwd);
  if (run.status !== 0) {
    throw new ProtocolError(`git rev-parse ${ref} failed: ${run.stderr.trim()}`);
  }
  return run.stdout.trim();
}

export function gitObjectExists(cwd, objectish) {
  return git(["cat-file", "-e", objectish], cwd).status === 0;
}

function gitShow(cwd, objectish) {
  const run = git(["show", objectish], cwd);
  if (run.status !== 0) {
    throw new ProtocolError(`git show ${objectish} failed: ${run.stderr.trim()}`);
  }
  return run.stdout;
}

export function getDirtyPaths(cwd, paths, { allowUntrackedPrefixes = [] } = {}) {
  if (paths.length === 0) return [];
  const run = git(["status", "--porcelain", "--", ...paths], cwd);
  if (run.status !== 0) {
    throw new ProtocolError(`git status failed: ${run.stderr.trim()}`);
  }
  return run.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => {
      const code = line.slice(0, 2);
      const file = line.slice(3).trim();
      if (code === "??" && allowUntrackedPrefixes.some((prefix) => file.startsWith(prefix))) {
        return false;
      }
      return true;
    });
}

export function assertCleanProtocolPaths(cwd, pack, { phase = "generate" } = {}) {
  const allowUntrackedPrefixes =
    phase === "generate"
      ? []
      : [pack.tracesDir, pack.reportsDir, pack.provenanceDir].map((dir) => `${dir}/`);
  const dirty = getDirtyPaths(cwd, protocolWatchPaths(pack), { allowUntrackedPrefixes });
  if (dirty.length > 0) {
    throw new ProtocolError(`protocol paths dirty:\n${dirty.join("\n")}`);
  }
}

export function assertManifestTracked(cwd, manifestPath) {
  const run = git(["ls-files", "--error-unmatch", "--", manifestPath], cwd);
  if (run.status !== 0) {
    throw new ProtocolError(`manifest not tracked in git: ${manifestPath}`);
  }
}

export function findManifestFreezeCommit(cwd, manifestPath, expectedHash) {
  const run = git(["log", "--format=%H", "HEAD", "--", manifestPath], cwd);
  if (run.status !== 0 || !run.stdout.trim()) {
    throw new ProtocolError(`manifest has no commit history: ${manifestPath}`);
  }
  for (const commit of run.stdout.trim().split("\n")) {
    const objectish = `${commit}:${manifestPath}`;
    if (!gitObjectExists(cwd, objectish)) continue;
    const content = gitShow(cwd, objectish);
    const parsed = JSON.parse(content);
    if (computeManifestHash(parsed) === expectedHash) {
      return commit;
    }
  }
  throw new ProtocolError("no commit contains manifest with expected hash");
}

export function assertNoArtifactsAtCommit(cwd, commit, pack) {
  for (const dir of [pack.tracesDir, pack.reportsDir, pack.provenanceDir]) {
    const run = git(["ls-tree", "-r", "--name-only", commit, "--", dir], cwd);
    if (run.status !== 0) continue;
    const names = run.stdout.trim();
    if (names) {
      throw new ProtocolError(`artifacts already present at freeze commit ${commit} under ${dir}`);
    }
  }
  for (const file of pack.reportFiles) {
    const objectish = `${commit}:${file}`;
    if (gitObjectExists(cwd, objectish)) {
      throw new ProtocolError(`report artifact already present at freeze commit: ${file}`);
    }
  }
}

async function pathExists(root, target) {
  try {
    await access(join(root, target), fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function dirHasEntries(root, target) {
  const full = join(root, target);
  if (!(await pathExists(root, target))) return false;
  const entries = await readdir(full);
  return entries.length > 0;
}

async function assertArtifactPathsAbsent(root, pack) {
  if (await dirHasEntries(root, pack.tracesDir)) {
    throw new ProtocolError(`traces already exist: ${pack.tracesDir}`);
  }
  if (await dirHasEntries(root, pack.reportsDir)) {
    throw new ProtocolError(`reports already exist: ${pack.reportsDir}`);
  }
  if (await dirHasEntries(root, pack.provenanceDir)) {
    throw new ProtocolError(`provenance already exists: ${pack.provenanceDir}`);
  }
  for (const file of pack.reportFiles) {
    if (await pathExists(root, file)) {
      throw new ProtocolError(`report artifact already exists: ${file}`);
    }
  }
}

export async function readManifest(root, manifestPath) {
  try {
    const content = await readFile(join(root, manifestPath), "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new ProtocolError("generate/report/run attempted before freeze");
    }
    throw error;
  }
}

export async function readJson(root, relPath) {
  return JSON.parse(await readFile(join(root, relPath), "utf8"));
}

async function writeJson(root, relPath, value) {
  const full = join(root, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, `${JSON.stringify(value, null, 2)}\n`);
}

export function assertImplementationMatchesFreeze(cwd, manifest) {
  const recorded = manifest.implementationCommitSha;
  if (!recorded || !/^[0-9a-f]{40}$/.test(recorded)) {
    throw new ProtocolError("manifest missing valid implementationCommitSha");
  }
  if (!gitObjectExists(cwd, recorded)) {
    throw new ProtocolError(`implementation commit not in history: ${recorded}`);
  }
  for (const relPath of IMPLEMENTATION_PATHS) {
    const atRecorded = git(["diff", recorded, "HEAD", "--", relPath], cwd);
    if (atRecorded.status !== 0) {
      throw new ProtocolError(`git diff failed for ${relPath}`);
    }
    if (atRecorded.stdout.trim()) {
      throw new ProtocolError(`implementation path differs from freeze record: ${relPath}`);
    }
  }
}

export async function assertReposLockMatchesFreeze(root, manifest) {
  const lockPath = manifest.reposLockPath ?? "bench/repos.lock.json";
  const lockContent = await readFile(join(root, lockPath), "utf8");
  const lockHash = sha256(lockContent);
  if (lockHash !== manifest.reposLockSha256) {
    throw new ProtocolError("repos.lock hash differs from freeze record");
  }
  const lock = JSON.parse(lockContent);
  const recorded = manifest.repositoryLocks ?? {};
  for (const [repoId, commit] of Object.entries(recorded)) {
    const actual = lock.repositories?.[repoId]?.commit;
    if (actual !== commit) {
      throw new ProtocolError(`repository lock SHA differs for ${repoId}`);
    }
  }
}

export function assertManifestHashOnDisk(manifest) {
  const expected = manifest.manifestSha256;
  const actual = computeManifestHash(manifest);
  if (actual !== expected) {
    throw new ProtocolError("manifest hash mismatch (tampered after freeze)");
  }
}

async function loadManifestContext(root, manifestPath, phase = "generate") {
  const manifest = await readManifest(root, manifestPath);
  const pack = {
    ...resolvePackPaths(root, { ...manifest, manifestPath }),
    manifestPath,
  };
  assertManifestHashOnDisk(manifest);
  return { manifest, pack, phase };
}

export async function assertFreezePhaseComplete(root, manifestPath, phase = "generate") {
  requireGit();
  const { manifest, pack } = await loadManifestContext(root, manifestPath, phase);
  if (manifest.status !== "frozen") {
    throw new ProtocolError("generate/report/run attempted before freeze");
  }
  assertCleanProtocolPaths(root, pack, { phase });
  assertManifestTracked(root, manifestPath);
  const freezeCommitSha = findManifestFreezeCommit(root, manifestPath, manifest.manifestSha256);
  assertNoArtifactsAtCommit(root, freezeCommitSha, pack);
  assertImplementationMatchesFreeze(root, manifest);
  await assertReposLockMatchesFreeze(root, manifest);
  return { manifest, pack, freezeCommitSha };
}

export async function freezePack(root, manifestPath, manifestDraft) {
  requireGit();
  const pack = resolvePackPaths(root, { ...manifestDraft, manifestPath });
  await assertArtifactPathsAbsent(root, pack);

  const frozenAt = new Date().toISOString();
  const implementationCommitSha = gitRevParse(root, "HEAD");
  const lockPath = manifestDraft.reposLockPath ?? "bench/repos.lock.json";
  const lockContent = await readFile(join(root, lockPath), "utf8");
  const reposLockSha256 = sha256(lockContent);
  const lock = JSON.parse(lockContent);

  const repositoryLocks = {};
  for (const repoId of manifestDraft.repositoryIds ?? []) {
    const commit = lock.repositories?.[repoId]?.commit;
    if (!commit) {
      throw new ProtocolError(`repository ${repoId} missing from ${lockPath}`);
    }
    repositoryLocks[repoId] = commit;
  }

  const manifest = {
    schemaVersion: 2,
    protocolVersion: 1,
    ...manifestDraft,
    manifestPath,
    status: "frozen",
    frozenAt,
    implementationCommitSha,
    reposLockSha256,
    repositoryLocks,
    tracePackDir: pack.tracesDir,
    reportsDir: pack.reportsDir,
    provenanceDir: pack.provenanceDir,
    reposLockPath: lockPath,
  };
  manifest.manifestSha256 = computeManifestHash(manifest);

  const fullManifestPath = join(root, manifestPath);
  await mkdir(dirname(fullManifestPath), { recursive: true });
  await writeFile(fullManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    manifestPath,
    manifestSha256: manifest.manifestSha256,
    frozenAt,
    implementationCommitSha,
    reposLockSha256,
    pack,
  };
}

export async function generatePack(root, manifestPath, generateTraces) {
  const { manifest, pack, freezeCommitSha } = await assertFreezePhaseComplete(root, manifestPath, "generate");

  const generateProvenancePath = join(pack.provenanceDir, PROVENANCE_GENERATE);
  if (await pathExists(root, generateProvenancePath)) {
    throw new ProtocolError("generate provenance already exists");
  }
  if (await dirHasEntries(root, pack.tracesDir)) {
    throw new ProtocolError("traces already exist; refuse generate");
  }

  await mkdir(join(root, pack.tracesDir), { recursive: true });
  const traceSummary = await generateTraces({ root, manifest, pack });

  const provenance = {
    schemaVersion: 1,
    phase: "generate",
    generatedAt: new Date().toISOString(),
    packId: pack.packId,
    manifestPath,
    manifestSha256: manifest.manifestSha256,
    freezeCommitSha,
    implementationCommitSha: manifest.implementationCommitSha,
    reposLockSha256: manifest.reposLockSha256,
    repositoryLocks: manifest.repositoryLocks,
    ...traceSummary,
  };
  await writeJson(root, generateProvenancePath, provenance);

  return { manifest, pack, provenance };
}

async function loadGenerateProvenance(root, pack) {
  const path = join(pack.provenanceDir, PROVENANCE_GENERATE);
  if (!(await pathExists(root, path))) {
    throw new ProtocolError("generate before run/report");
  }
  const provenance = await readJson(root, path);
  if (provenance.manifestSha256 !== (await readManifest(root, pack.manifestPath)).manifestSha256) {
    throw new ProtocolError("generate provenance manifest hash mismatch");
  }
  return provenance;
}

export async function runPack(root, manifestPath, runBenchmarks) {
  const { manifest, pack, freezeCommitSha } = await assertFreezePhaseComplete(root, manifestPath, "run");
  const generateProvenance = await loadGenerateProvenance(root, pack);

  if (generateProvenance.freezeCommitSha !== freezeCommitSha) {
    throw new ProtocolError("freeze commit SHA mismatch vs generate provenance");
  }

  if (!(await dirHasEntries(root, pack.tracesDir))) {
    throw new ProtocolError("run attempted before generate (no traces)");
  }

  const runProvenancePath = join(pack.provenanceDir, PROVENANCE_RUN);
  if (await pathExists(root, runProvenancePath)) {
    throw new ProtocolError("run provenance already exists");
  }

  const implementationCommitSha = gitRevParse(root, "HEAD");
  const benchmarkSummary = await runBenchmarks({
    root,
    manifest,
    pack,
    generateProvenance,
    implementationCommitSha,
  });

  const provenance = {
    schemaVersion: 1,
    phase: "run",
    ranAt: new Date().toISOString(),
    packId: pack.packId,
    manifestPath,
    manifestSha256: manifest.manifestSha256,
    freezeCommitSha,
    implementationCommitSha,
    reposLockSha256: manifest.reposLockSha256,
    repositoryLocks: manifest.repositoryLocks,
    generateProvenancePath: join(pack.provenanceDir, PROVENANCE_GENERATE),
    ...benchmarkSummary,
  };
  await writeJson(root, runProvenancePath, provenance);

  return { manifest, pack, provenance, generateProvenance };
}

export async function reportPack(root, manifestPath, formatReport) {
  const { manifest, pack, freezeCommitSha } = await assertFreezePhaseComplete(root, manifestPath, "report");
  const generateProvenance = await loadGenerateProvenance(root, pack);
  const runProvenancePath = join(pack.provenanceDir, PROVENANCE_RUN);
  if (!(await pathExists(root, runProvenancePath))) {
    throw new ProtocolError("report attempted before run");
  }
  const runProvenance = await readJson(root, runProvenancePath);

  if (runProvenance.manifestSha256 !== manifest.manifestSha256) {
    throw new ProtocolError("run provenance manifest hash mismatch");
  }
  if (runProvenance.freezeCommitSha !== freezeCommitSha) {
    throw new ProtocolError("freeze commit SHA mismatch vs run provenance");
  }
  if (runProvenance.implementationCommitSha !== gitRevParse(root, "HEAD")) {
    throw new ProtocolError("implementation commit SHA mismatch at report time");
  }
  await assertReposLockMatchesFreeze(root, manifest);

  const reportBody = formatReport({
    manifest,
    pack,
    generateProvenance,
    runProvenance,
    freezeCommitSha,
  });

  const reportPath = join(pack.reportsDir, "report.md");
  await mkdir(join(root, pack.reportsDir), { recursive: true });
  await writeFile(join(root, reportPath), reportBody);

  return {
    manifest,
    pack,
    reportPath,
    runProvenance,
    reportBody,
  };
}

export function defaultReportFormatter({
  manifest,
  runProvenance,
  freezeCommitSha,
}) {
  return [
    `# Holdout report — ${manifest.packId}`,
    "",
    `Label: \`${manifest.label}\``,
    "",
    "## Provenance",
    "",
    `- freeze commit SHA: \`${freezeCommitSha}\``,
    `- manifest SHA-256: \`${manifest.manifestSha256}\``,
    `- implementation commit SHA: \`${runProvenance.implementationCommitSha}\``,
    `- repos.lock SHA-256: \`${runProvenance.reposLockSha256}\``,
    ...Object.entries(runProvenance.repositoryLocks ?? {}).map(
      ([repoId, commit]) => `- ${repoId} lock SHA: \`${commit}\``,
    ),
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    runProvenance.summary ?? "",
    "",
  ].join("\n");
}

export async function syntheticFixtureTrace({ root, manifest, pack }) {
  const trace = {
    schemaVersion: 1,
    name: `${manifest.packId}/interior-edit/protocol-fixture`,
    source: {
      repository: "synthetic://protocol-fixture",
      commit: "0000000000000000000000000000000000000000",
      license: "MIT",
    },
    initialFiles: {
      "src/auth.ts": [
        "export function authorize(user) {",
        "  if (!user) return false;",
        "  return user.role === 'admin';",
        "}",
      ].join("\n"),
    },
    events: [
      {
        type: "read",
        path: "src/auth.ts",
        scope: "region",
        startLine: 1,
        endLine: 4,
        selector: "authorize.fn",
      },
      {
        type: "capture-request",
        task: "protocol fixture",
        budgetChars: 12000,
        requiredUnits: [
          {
            path: "src/auth.ts",
            selector: "authorize.fn",
            sha256: sha256(
              [
                "export function authorize(user) {",
                "  if (!user) return false;",
                "  return user.role === 'admin';",
                "}",
              ].join("\n"),
            ),
          },
        ],
      },
      {
        type: "replace-exact",
        path: "src/auth.ts",
        expected: "return user.role === 'admin';",
        replacement: "return user.permissions.includes('write');",
      },
      {
        type: "capture-request",
        task: "protocol fixture",
        budgetChars: 12000,
        requiredUnits: [
          {
            path: "src/auth.ts",
            selector: "authorize.fn",
            sha256: sha256(
              [
                "export function authorize(user) {",
                "  if (!user) return false;",
                "  return user.permissions.includes('write');",
                "}",
              ].join("\n"),
            ),
          },
        ],
      },
    ],
  };
  const tracePath = join(pack.tracesDir, "protocol-fixture-interior-edit.json");
  await writeJson(root, tracePath, trace);
  return { tracesWritten: 1, traceNames: [trace.name] };
}

export async function syntheticFixtureRun({ root, pack }) {
  const { runTrace, finalCapture } = await import("./trace-runner.mjs");
  const names = (await readdir(join(root, pack.tracesDir))).filter((n) => n.endsWith(".json"));
  let records = 0;
  for (const name of names) {
    const trace = await readJson(root, join(pack.tracesDir, name));
    const result = await runTrace(trace, "freshctx-region");
    const capture = finalCapture(result);
    if (capture) records += 1;
  }
  return { records, summary: `Ran ${records} capture(s) on ${names.length} trace(s).` };
}
