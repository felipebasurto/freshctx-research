import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const forbidden = /\/Users\/|\/var\/folders\//u;

async function filesUnder(relativeDir) {
  const found = [];
  const base = join(root, relativeDir);
  const entries = await readdir(base, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parent = entry.parentPath ?? entry.path;
    found.push(join(parent, entry.name));
  }
  return found;
}

test("published lab records and docs do not embed workstation paths", async () => {
  const paths = [
    ...(await filesUnder("labs/pi-outcome-v1")),
    ...(await filesUnder("docs")),
    join(root, "docs/lab/pi-trial/auto-rpc.mjs"),
  ];
  const leaks = [];
  for (const path of paths) {
    const text = await readFile(path, "utf8");
    if (forbidden.test(text)) leaks.push(path.slice(root.length));
  }
  assert.deepEqual(leaks, []);
});
