import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = join(ROOT, "bench", "repos.manifest.json");
const LOCK_PATH = join(ROOT, "bench", "repos.lock.json");
const REPOS_DIR = join(ROOT, "bench", "repos");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(args, cwd) {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(String(run.stderr ?? "").trim() || `git ${args[0]} failed`);
  return String(run.stdout ?? "").trim();
}

async function manifestWithDigest() {
  const raw = await readFile(MANIFEST_PATH);
  return { manifest: JSON.parse(raw.toString("utf8")), digest: sha256(raw) };
}

async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function loadExistingLock() {
  try {
    return JSON.parse(await readFile(LOCK_PATH, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function fetchRepos({ tier, ids, relock = false }) {
  const { manifest, digest } = await manifestWithDigest();
  const idSet = ids ? new Set(ids) : null;
  const repositories = manifest.repositories.filter((repo) => {
    if (idSet) return idSet.has(repo.id);
    return !tier || repo.tier === tier;
  });
  if (idSet) {
    for (const id of idSet) {
      if (!repositories.some((repo) => repo.id === id)) {
        throw new Error(`unknown repository id in --ids: ${id}`);
      }
    }
  }
  await mkdir(REPOS_DIR, { recursive: true });
  const existing = await loadExistingLock();
  const honorExistingLock = existing !== null && !relock;
  const locked = honorExistingLock ? null : { ...(existing?.repositories ?? {}) };

  for (const repo of repositories) {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(repo.id)) throw new Error(`unsafe repository id: ${repo.id}`);
    const lockedEntry = existing?.repositories?.[repo.id];
    const pinnedCommit = honorExistingLock ? lockedEntry?.commit : null;
    if (honorExistingLock && !pinnedCommit) {
      throw new Error(`${repo.id}: missing from existing lock; pass --relock to resolve from manifest`);
    }

    const destination = join(REPOS_DIR, repo.id);
    let exists = false;
    try {
      await stat(destination);
      exists = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    const checkoutLabel = pinnedCommit ? `locked ${pinnedCommit.slice(0, 7)}` : repo.ref;
    if (!exists) {
      process.stderr.write(`Cloning ${repo.id} at ${checkoutLabel}...\n`);
      git(["clone", "--filter=blob:none", "--no-checkout", repo.url, destination], ROOT);
    } else {
      if (git(["status", "--porcelain"], destination) !== "") {
        throw new Error(`${repo.id}: existing benchmark checkout is dirty`);
      }
      const origin = git(["remote", "get-url", "origin"], destination).replace(/\.git$/u, "");
      if (origin !== repo.url.replace(/\.git$/u, "")) {
        throw new Error(`${repo.id}: existing checkout has unexpected origin ${origin}`);
      }
      process.stderr.write(`Refreshing ${repo.id} at ${checkoutLabel}...\n`);
    }

    if (pinnedCommit) {
      git(["fetch", "--depth", "1", "origin", pinnedCommit], destination);
      git(["checkout", "--detach", pinnedCommit], destination);
      const commit = git(["rev-parse", "HEAD"], destination);
      if (commit !== pinnedCommit) {
        throw new Error(`${repo.id}: expected locked commit ${pinnedCommit}, found ${commit}`);
      }
    } else {
      git(["fetch", "--depth", "1", "origin", repo.ref], destination);
      git(["checkout", "--detach", "FETCH_HEAD"], destination);
      const commit = git(["rev-parse", "HEAD"], destination);
      locked[repo.id] = {
        url: repo.url,
        requestedRef: repo.ref,
        commit,
        language: repo.language,
        license: repo.license,
      };
    }
  }

  if (honorExistingLock) {
    process.stdout.write(`Honored existing lock for ${repositories.length} repositories\n`);
    return;
  }

  const scope = idSet ? "merge" : tier ?? "all";
  await atomicJson(LOCK_PATH, {
    schemaVersion: 1,
    manifestSha256: digest,
    scope,
    resolvedAt: new Date().toISOString(),
    repositories: locked,
  });
  process.stdout.write(`Locked ${Object.keys(locked).length} repositories; manifest sha256:${digest}\n`);
}

async function verifyRepos() {
  const { digest } = await manifestWithDigest();
  let lock;
  try {
    lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
  } catch {
    throw new Error("repository lock missing; run npm run repos:fetch first");
  }
  if (lock.manifestSha256 !== digest) throw new Error("repository manifest changed after lock");

  for (const [id, expected] of Object.entries(lock.repositories ?? {})) {
    const destination = join(REPOS_DIR, id);
    const actual = git(["rev-parse", "HEAD"], destination);
    if (actual !== expected.commit) throw new Error(`${id}: expected ${expected.commit}, found ${actual}`);
    if (git(["status", "--porcelain"], destination) !== "") {
      throw new Error(`${id}: benchmark checkout is dirty`);
    }
  }
  process.stdout.write(`Verified ${Object.keys(lock.repositories ?? {}).length} pinned repositories\n`);
}

const [command = "verify", ...flags] = process.argv.slice(2);
const tierFlag = flags.find((flag) => flag.startsWith("--tier="));
const idsFlag = flags.find((flag) => flag.startsWith("--ids="));
const tier = tierFlag?.slice("--tier=".length);
const ids = idsFlag?.slice("--ids=".length).split(",").filter(Boolean);
const relock = flags.includes("--relock");
if (command === "fetch") await fetchRepos({ tier, ids, relock });
else if (command === "verify") await verifyRepos();
else throw new Error(`unknown command: ${command}`);
