import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BARE_CLONE_SKIP_COUNT,
  ENVIRONMENT_SKIP_GATES,
  LIVE_HERMES_COVERAGE,
  VENDORED_GO_TOOLS_LABS,
  VENDORED_GO_TOOLS_ROOT,
} from "../bench/skip-inventory.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("vendored go-tools lab boards no longer skip on a bare clone", async () => {
  assert.equal(VENDORED_GO_TOOLS_LABS.length, 16);
  for (const relative of VENDORED_GO_TOOLS_LABS) {
    const source = await readFile(join(ROOT, relative), "utf8");
    assert.equal(source.includes("{ skip:"), false, `${relative} must not environment-skip`);
    assert.ok(source.includes(VENDORED_GO_TOOLS_ROOT), `${relative} must read ${VENDORED_GO_TOOLS_ROOT}`);
  }
});

test("bare clone TAP has no remaining environment skip registrations", () => {
  assert.equal(BARE_CLONE_SKIP_COUNT, 0);
  assert.deepEqual(ENVIRONMENT_SKIP_GATES, []);
});

test("Hermes replay boards remain after live-host skips were removed", async () => {
  assert.equal(LIVE_HERMES_COVERAGE.removedIn, "b0f7282");
  for (const relative of LIVE_HERMES_COVERAGE.replayRemains) {
    const source = await readFile(join(ROOT, relative), "utf8");
    assert.ok(source.length > 0, relative);
    assert.equal(source.includes("{ skip:"), false, `${relative} must run without a host checkout`);
  }
});
