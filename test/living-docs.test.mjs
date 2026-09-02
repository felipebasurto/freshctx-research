import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function read(relativePath) {
  return readFile(join(ROOT, relativePath), "utf8");
}

async function pcrIds() {
  const entries = await readdir(join(ROOT, "docs", "lab", "pcr"));
  return entries
    .filter((name) => /^\d{4}-.*\.md$/u.test(name))
    .map((name) => name.slice(0, 4))
    .sort();
}

test("public status documents report living repository facts", async () => {
  const [readme, architecture, roadmap] = await Promise.all([
    read("README.md"),
    read("docs/ARCHITECTURE.md"),
    read("docs/ROADMAP.md"),
  ]);
  const publicStatus = `${readme}\n${architecture}\n${roadmap}`;

  const ids = await pcrIds();
  assert.ok(ids.length > 0, "no PCR files found");
  assert.match(readme, new RegExp(`There are ${ids.length} Public Change Records`));
  assert.match(architecture, new RegExp(`There are ${ids.length} Public Change Records`));
  assert.match(publicStatus, /whole-file, line-region, and symbol scope/i);
  assert.match(publicStatus, /Python, JavaScript, TypeScript, Go, and Rust/);
  assert.match(publicStatus, /src\/.*Node\.js standard library/i);
  assert.match(publicStatus, /holdout-v0\.3-apex/);
  assert.match(publicStatus, /passAt1.*null.*out of scope/i);
  assert.match(publicStatus, /locally frozen/i);
  assert.match(publicStatus, /not production-GHA sealed/i);
  assert.match(publicStatus, /8589 payload bytes/i);
  assert.match(publicStatus, /36701 payload bytes/i);
  assert.match(publicStatus, /Required recall.*5\/5/i);

  assert.doesNotMatch(publicStatus, /75 Public Change Records/);
  assert.doesNotMatch(publicStatus, /invariant prototype/i);
  assert.doesNotMatch(publicStatus, /\bLevel 4\b/i);
  assert.doesNotMatch(publicStatus, /\bSOTA\b|state of the art/i);
});

test("README separates behavior, test evidence, measurement, and production gaps", async () => {
  const readme = await read("README.md");

  assert.match(readme, /^## Current behavior$/m);
  assert.match(readme, /^## What the tests prove$/m);
  assert.match(readme, /^## Recorded evaluation$/m);
  assert.match(readme, /^## Production gaps$/m);
  assert.doesNotMatch(readme, /\bCursor\b|\bClaude(?: Code)?\b/);
});

test("README presents FreshCtx before the exactly-once whole-file citation", async () => {
  const readme = await read("README.md");
  const citation = "Zheng et al., arXiv:2607.22711";
  const citationOffset = readme.indexOf(citation);

  assert.equal(readme.match(/Zheng et al\./gu)?.length, 1);
  assert.equal(readme.match(/https:\/\/arxiv\.org\/abs\/2607\.22711/gu)?.length, 1);
  assert.equal(readme.match(/\bCORVUS\b/gu)?.length, 1);
  assert.ok(citationOffset > readme.indexOf("FreshCtx is a local-first context substrate"));
  assert.match(readme, /bench\/corvus\.mjs/);
  assert.match(readme, /`corvus-file`/);
  assert.match(readme, /Isolated Semantic Engine \| 8589 payload bytes/);
  assert.match(readme, /Whole-file baseline \(`corvus-file`\) \| 36701 payload bytes/);
  assert.match(readme, /Required recall was \*\*5\/5\*\*/);
});

test("Pi documentation reports implemented symbol refresh", async () => {
  const piReadme = await read("adapters/pi/README.md");

  assert.match(piReadme, /symbol scope/i);
  assert.match(piReadme, /Tree-sitter/i);
  assert.doesNotMatch(piReadme, /Symbol \/ Tree-sitter providers/);
});

test("PCR ledgers mention the newest PCR on disk", async () => {
  const ids = await pcrIds();
  const newest = ids.at(-1);
  const [index, metrics] = await Promise.all([
    read("docs/lab/INDEX.md"),
    read("docs/lab/METRICS.md"),
  ]);
  assert.match(index, new RegExp(`\\[${newest}\\]\\(pcr/${newest}-`), "INDEX.md lacks newest PCR");
  assert.match(metrics, new RegExp(`\\[${newest}\\]\\(pcr/${newest}-`), "METRICS.md lacks newest PCR");
  assert.equal(new Set(ids).size, ids.length, "duplicate PCR ids on disk");
});
