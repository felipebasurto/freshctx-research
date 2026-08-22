import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = join(ROOT, "bench", "hosts.manifest.json");
const LOCK_PATH = join(ROOT, "bench", "hosts.lock.json");
const HOSTS_DIR = join(ROOT, "bench", "hosts");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRemoteUrl(url) {
  return String(url)
    .replace(/^https:\/\/[^@/]+@/u, "https://")
    .replace(/\.git$/u, "");
}

const GIT_BIN = process.env.GIT_BIN ?? "/usr/bin/git";

function git(args, cwd) {
  const run = spawnSync(GIT_BIN, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
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

async function assertContextModule(destination, contextModule) {
  const modulePath = join(destination, contextModule);
  try {
    await access(modulePath);
  } catch {
    throw new Error(`context module missing at locked checkout: ${contextModule}`);
  }
}

async function resolveCommitFromRef(destination, url, ref) {
  let exists = false;
  try {
    await stat(destination);
    exists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (!exists) {
    process.stderr.write(`Cloning host checkout at ${ref.slice(0, 7)}...\n`);
    git(["clone", "--filter=blob:none", "--no-checkout", url, destination], ROOT);
  } else {
    if (git(["status", "--porcelain"], destination) !== "") {
      throw new Error(`host checkout is dirty: ${destination}`);
    }
    const origin = normalizeRemoteUrl(git(["remote", "get-url", "origin"], destination));
    if (origin !== normalizeRemoteUrl(url)) {
      throw new Error(`unexpected origin for host checkout: ${origin}`);
    }
    process.stderr.write(`Refreshing host checkout at ${ref.slice(0, 7)}...\n`);
  }

  git(["fetch", "--depth", "1", "origin", ref], destination);
  git(["checkout", "--detach", "FETCH_HEAD"], destination);
  return git(["rev-parse", "HEAD"], destination);
}

async function walkBackToContextModule(url, startingRef, contextModule) {
  const temporary = join(HOSTS_DIR, `.resolve-${sha256(`${url}:${startingRef}`).slice(0, 12)}`);
  let currentRef = startingRef;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const commit = await resolveCommitFromRef(temporary, url, currentRef);
    try {
      await assertContextModule(temporary, contextModule);
      return { commit, requestedRef: startingRef, resolvedRef: currentRef };
    } catch (error) {
      if (attempt === 0 && currentRef === startingRef) {
        process.stderr.write(`${startingRef.slice(0, 7)} lacks ${contextModule}; walking ancestors...\n`);
      }
      const parents = git(["rev-list", "--parents", "-n", "1", commit], temporary).split(" ").slice(1);
      if (parents.length === 0) break;
      currentRef = parents[0];
    }
  }
  throw new Error(`unable to locate ${contextModule} within 32 ancestors of ${startingRef}`);
}

async function fetchHosts({ ids, relock = false }) {
  const { manifest, digest } = await manifestWithDigest();
  const idSet = ids ? new Set(ids) : null;
  const hosts = manifest.hosts.filter((host) => {
    if (idSet) return idSet.has(host.id);
    return true;
  });
  if (idSet) {
    for (const id of idSet) {
      if (!hosts.some((host) => host.id === id)) {
        throw new Error(`unknown host id in --ids: ${id}`);
      }
    }
  }

  await mkdir(HOSTS_DIR, { recursive: true });
  const existing = await loadExistingLock();
  const honorExistingLock = existing !== null && !relock;
  const locked = honorExistingLock ? null : { ...(existing?.hosts ?? {}) };

  for (const host of hosts) {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(host.id)) throw new Error(`unsafe host id: ${host.id}`);
    const lockedEntry = existing?.hosts?.[host.id];
    const pinnedCommit = honorExistingLock ? lockedEntry?.commit : null;
    if (honorExistingLock && !pinnedCommit) {
      throw new Error(`${host.id}: missing from existing lock; pass --relock to resolve from manifest`);
    }

    const destination = join(HOSTS_DIR, host.id);
    let commit = pinnedCommit;
    let requestedRef = lockedEntry?.requestedRef ?? host.ref;

    if (!pinnedCommit) {
      const resolved = await walkBackToContextModule(host.url, host.ref, host.contextModule);
      commit = resolved.commit;
      requestedRef = host.ref;
      if (resolved.resolvedRef !== host.ref) {
        process.stderr.write(
          `${host.id}: locked ancestor ${commit.slice(0, 7)} (requested ${host.ref.slice(0, 7)})\n`,
        );
      }
      git(["fetch", "--depth", "1", "origin", commit], destination);
      git(["checkout", "--detach", commit], destination);
    } else {
      process.stderr.write(`Checking out ${host.id} at locked ${pinnedCommit.slice(0, 7)}...\n`);
      let exists = false;
      try {
        await stat(destination);
        exists = true;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      if (!exists) {
        git(["clone", "--filter=blob:none", "--no-checkout", host.url, destination], ROOT);
      } else if (git(["status", "--porcelain"], destination) !== "") {
        throw new Error(`${host.id}: existing host checkout is dirty`);
      }
      git(["fetch", "--depth", "1", "origin", pinnedCommit], destination);
      git(["checkout", "--detach", pinnedCommit], destination);
      const actual = git(["rev-parse", "HEAD"], destination);
      if (actual !== pinnedCommit) {
        throw new Error(`${host.id}: expected locked commit ${pinnedCommit}, found ${actual}`);
      }
    }

    await assertContextModule(destination, lockedEntry?.contextModule ?? host.contextModule);

    if (!honorExistingLock) {
      locked[host.id] = {
        url: host.url,
        requestedRef,
        commit,
        contextModule: host.contextModule,
        license: host.license,
      };
    }
  }

  if (honorExistingLock) {
    process.stdout.write(`Honored existing lock for ${hosts.length} host checkouts\n`);
    return;
  }

  await atomicJson(LOCK_PATH, {
    schemaVersion: 1,
    manifestSha256: digest,
    scope: idSet ? "merge" : "native-host-bakeoff",
    resolvedAt: new Date().toISOString(),
    hosts: locked,
  });
  process.stdout.write(`Locked ${Object.keys(locked).length} host checkouts; manifest sha256:${digest}\n`);
}

async function verifyHosts() {
  const { digest } = await manifestWithDigest();
  let lock;
  try {
    lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
  } catch {
    throw new Error("host lock missing; run npm run hosts:fetch first");
  }
  if (lock.manifestSha256 !== digest) throw new Error("host manifest changed after lock");

  for (const [id, expected] of Object.entries(lock.hosts ?? {})) {
    const destination = join(HOSTS_DIR, id);
    const actual = git(["rev-parse", "HEAD"], destination);
    if (actual !== expected.commit) throw new Error(`${id}: expected ${expected.commit}, found ${actual}`);
    if (git(["status", "--porcelain"], destination) !== "") {
      throw new Error(`${id}: host checkout is dirty`);
    }
    await assertContextModule(destination, expected.contextModule);
  }
  process.stdout.write(`Verified ${Object.keys(lock.hosts ?? {}).length} pinned host checkouts\n`);
}

const [command = "verify", ...flags] = process.argv.slice(2);
const idsFlag = flags.find((flag) => flag.startsWith("--ids="));
const ids = idsFlag?.slice("--ids=".length).split(",").filter(Boolean);
const relock = flags.includes("--relock");
if (command === "fetch") await fetchHosts({ ids, relock });
else if (command === "verify") await verifyHosts();
else throw new Error(`unknown command: ${command}`);
