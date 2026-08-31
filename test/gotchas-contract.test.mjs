import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("architecture classifies protected and documented sharp edges", async () => {
  const architecture = await readFile(join(ROOT, "docs", "ARCHITECTURE.md"), "utf8");
  const expected = [
    ["PCR 0079 stateless request bodies", "KEEP"],
    ["PCR 0080 refreshed-unit cap exception", "KEEP"],
    ["Fail-closed freshness", "KEEP"],
    ["Adapter fail-open", "KEEP"],
    ["Selection order versus render order", "KEEP"],
    ["Revision-free historical markers", "KEEP"],
    ["Process-local adapter state", "DOCUMENT"],
    ["Out-of-process parser availability", "DOCUMENT"],
    ["Local apex classification", "DOCUMENT"],
    ["Programmatic benchmark report writes", "FIX"],
  ];

  assert.match(architecture, /^## Sharp-edge audit$/m);
  for (const [edge, classification] of expected) {
    assert.ok(
      architecture.includes(`| ${edge} | ${classification} |`),
      `${edge} must be ${classification}`,
    );
  }
  assert.match(architecture, /test\/report-hygiene\.test\.mjs/);
});
