import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RETIRED_TERM = ["side", "car"].join("");

test("tracked paths and text use Isolated Semantic Engine vocabulary", async () => {
  const paths = spawnSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(paths.status, 0, paths.stderr);
  assert.equal(
    paths.stdout
      .split("\0")
      .filter(Boolean)
      .some((path) => path.toLowerCase().includes(RETIRED_TERM)),
    false,
    "tracked path still uses retired vocabulary",
  );

  const matches = spawnSync(
    "git",
    ["grep", "-I", "-i", "-n", "-e", RETIRED_TERM, "--", "."],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(matches.status, 1, matches.stdout || matches.stderr);

  const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["ise:install"], "npm --prefix ise/treesitter ci --omit=dev");
  assert.equal(Object.hasOwn(packageJson.scripts, `${RETIRED_TERM}:install`), false);
});
