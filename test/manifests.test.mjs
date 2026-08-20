import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("paper manifest has unique primary-source records", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../papers/manifest.json", import.meta.url), "utf8"),
  );
  const ids = manifest.papers.map((paper) => paper.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(manifest.papers.filter((paper) => paper.required).length >= 8);
  for (const paper of manifest.papers) {
    assert.match(paper.arxiv, /^\d{4}\.\d{4,5}$/u);
    assert.equal(paper.landingUrl, `https://arxiv.org/abs/${paper.arxiv}`);
    assert.equal(paper.pdfUrl, `https://arxiv.org/pdf/${paper.arxiv}`);
  }
});

test("public repository manifest is diverse and requires a commit lock", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../bench/repos.manifest.json", import.meta.url), "utf8"),
  );
  const ids = manifest.repositories.map((repo) => repo.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(manifest.repositories.length >= 6);
  assert.ok(new Set(manifest.repositories.map((repo) => repo.language)).size >= 5);
  assert.match(manifest.freezeRule, /immutable commit/u);
  for (const repo of manifest.repositories) {
    assert.match(repo.url, /^https:\/\//u);
    assert.ok(repo.ref);
    assert.ok(repo.license);
  }
});
