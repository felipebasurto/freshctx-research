import assert from "node:assert/strict";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

const REPOS_SCRIPT = new URL("../scripts/repos.mjs", import.meta.url);
const MANIFEST_PATH = new URL("../bench/repos.manifest.json", import.meta.url);
const LOCK_PATH = new URL("../bench/repos.lock.json", import.meta.url);

function git(cwd, args) {
  const run = spawnSync("git", args, { encoding: "utf8", cwd });
  if (run.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${run.stderr}`);
  }
  return run.stdout.trim();
}

async function makeFixture({ lockBytes = null, repoIds = null }) {
  const root = join(tmpdir(), `freshctx-repos-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(join(root, "bench"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  if (repoIds) {
    manifest.repositories = manifest.repositories.filter((repo) => repoIds.includes(repo.id));
  }
  await writeFile(join(root, "bench/repos.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  if (lockBytes !== null) {
    await writeFile(join(root, "bench/repos.lock.json"), lockBytes);
  }

  await cp(REPOS_SCRIPT, join(root, "scripts/repos.mjs"));
  return root;
}

function runRepos(root, args, timeoutMs = 600_000) {
  return spawnSync("node", [join(root, "scripts/repos.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: timeoutMs,
  });
}

test("repos fetch honors existing lock without rewriting lock bytes", async (t) => {
  const lockBytes = await readFile(LOCK_PATH);
  const lock = JSON.parse(lockBytes.toString("utf8"));
  const root = await makeFixture({ lockBytes, repoIds: ["go-tools", "neovim"] });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const before = await readFile(join(root, "bench/repos.lock.json"));
  const run = runRepos(root, ["fetch", "--ids=go-tools,neovim"]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Honored existing lock/u);

  const after = await readFile(join(root, "bench/repos.lock.json"));
  assert.equal(after.compare(before), 0, "lock file bytes must be unchanged");

  for (const id of ["go-tools", "neovim"]) {
    const expected = lock.repositories[id].commit;
    const actual = git(join(root, "bench/repos", id), ["rev-parse", "HEAD"]);
    assert.equal(actual, expected, `${id} checkout must match locked commit`);
  }
});

test("repos fetch bootstraps lock from manifest refs when lock is missing", async (t) => {
  const root = await makeFixture({ lockBytes: null, repoIds: ["flask"] });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const run = runRepos(root, ["fetch", "--ids=flask"], 300_000);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Locked 1 repositories/u);

  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const head = git(join(root, "bench/repos/flask"), ["rev-parse", "HEAD"]);
  assert.equal(lock.repositories.flask.commit, head);
  assert.equal(lock.repositories.flask.requestedRef, "main");
});
