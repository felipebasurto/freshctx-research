import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function read(relativePath) {
  return readFile(join(ROOT, relativePath), "utf8");
}

test("public status documents report living repository facts", async () => {
  const [readme, architecture, roadmap] = await Promise.all([
    read("README.md"),
    read("docs/ARCHITECTURE.md"),
    read("docs/ROADMAP.md"),
  ]);
  const publicStatus = `${readme}\n${architecture}\n${roadmap}`;

  assert.match(publicStatus, /130 Public Change Records/);
  assert.match(publicStatus, /whole-file, line-region, and symbol scope/i);
  assert.match(publicStatus, /Python, JavaScript, TypeScript, Go, and Rust/);
  assert.match(publicStatus, /src\/.*Node\.js standard library/i);
  assert.match(publicStatus, /holdout-v0\.3-apex/);
  assert.match(publicStatus, /passAt1.*null.*out of scope/i);
  assert.match(publicStatus, /locally frozen/i);
  assert.match(publicStatus, /not production-GHA sealed/i);
  assert.match(publicStatus, /8504 payload bytes/i);
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
  assert.match(readme, /Isolated Semantic Engine \| 8504 payload bytes/);
  assert.match(readme, /Whole-file baseline \(`corvus-file`\) \| 36701 payload bytes/);
  assert.match(readme, /Required recall was \*\*5\/5\*\*/);
});

test("Pi documentation reports implemented symbol refresh", async () => {
  const piReadme = await read("adapters/pi/README.md");

  assert.match(piReadme, /symbol scope/i);
  assert.match(piReadme, /Tree-sitter/i);
  assert.doesNotMatch(piReadme, /Symbol \/ Tree-sitter providers/);
});

test("PCR count in public status matches Markdown files on disk", async () => {
  const entries = await readdir(join(ROOT, "docs", "lab", "pcr"));
  const count = entries.filter((name) => name.endsWith(".md")).length;

  assert.equal(count, 130);
});
