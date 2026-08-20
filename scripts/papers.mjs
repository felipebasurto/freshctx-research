import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = join(ROOT, "papers", "manifest.json");
const LOCK_PATH = join(ROOT, "papers", "papers.lock.json");
const CACHE_DIR = join(ROOT, "papers", "cache");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function manifestWithDigest() {
  const raw = await readFile(MANIFEST_PATH);
  return { manifest: JSON.parse(raw.toString("utf8")), digest: sha256(raw) };
}

function assertPlausiblePdf(bytes, id) {
  if (bytes.length < 10_000) throw new Error(`${id}: response is too small to be a paper PDF`);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`${id}: response does not start with a PDF signature`);
  }
}

async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function fetchPaper(paper) {
  const response = await fetch(paper.pdfUrl, {
    redirect: "follow",
    headers: { "user-agent": "FreshCtx literature fetcher/0.1 (research reproducibility)" },
  });
  if (!response.ok) throw new Error(`${paper.id}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assertPlausiblePdf(bytes, paper.id);
  const path = join(CACHE_DIR, `${paper.id}.pdf`);
  await writeFile(path, bytes);
  return {
    id: paper.id,
    arxiv: paper.arxiv,
    url: response.url,
    file: `cache/${paper.id}.pdf`,
    bytes: bytes.length,
    sha256: sha256(bytes),
    retrievedAt: new Date().toISOString(),
  };
}

async function fetchCorpus(all) {
  const { manifest, digest } = await manifestWithDigest();
  const papers = manifest.papers.filter((paper) => all || paper.required);
  await mkdir(CACHE_DIR, { recursive: true });
  const entries = [];

  for (const paper of papers) {
    process.stderr.write(`Downloading ${paper.id}...\n`);
    entries.push(await fetchPaper(paper));
  }

  const lock = {
    schemaVersion: 1,
    manifestSha256: digest,
    scope: all ? "all" : "required",
    papers: Object.fromEntries(entries.sort((a, b) => a.id.localeCompare(b.id)).map((entry) => [entry.id, entry])),
  };
  await atomicJson(LOCK_PATH, lock);
  process.stdout.write(`Locked ${entries.length} papers; manifest sha256:${digest}\n`);
}

async function verifyCorpus() {
  const { manifest, digest } = await manifestWithDigest();
  let lock;
  try {
    lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
  } catch {
    throw new Error("paper lock missing; run npm run papers:fetch first");
  }
  if (lock.manifestSha256 !== digest) {
    throw new Error("paper manifest changed after the corpus was locked; fetch again and review the diff");
  }

  for (const paper of manifest.papers.filter((item) => item.required)) {
    const entry = lock.papers?.[paper.id];
    if (!entry) throw new Error(`${paper.id}: required paper is absent from lock`);
    const bytes = await readFile(join(ROOT, "papers", entry.file));
    assertPlausiblePdf(bytes, paper.id);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(`${paper.id}: bytes do not match papers.lock.json`);
    }
  }
  process.stdout.write(`Verified required paper corpus; manifest sha256:${digest}\n`);
}

async function listCorpus() {
  const { manifest, digest } = await manifestWithDigest();
  for (const paper of manifest.papers) {
    process.stdout.write(`${paper.required ? "required" : "adjacent"}\t${paper.id}\t${paper.title}\n`);
  }
  process.stdout.write(`manifest\tsha256:${digest}\n`);
}

const [command = "list", ...flags] = process.argv.slice(2);
if (command === "fetch") await fetchCorpus(flags.includes("--all"));
else if (command === "verify") await verifyCorpus();
else if (command === "list") await listCorpus();
else throw new Error(`unknown command: ${command}`);
