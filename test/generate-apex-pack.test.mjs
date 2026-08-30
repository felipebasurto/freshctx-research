import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APEX_NESTED_SELECTOR,
  APEX_PACK_ID,
  APEX_SENTINEL,
  assertNotLegacyHoldout,
  pairApexRows,
  pickUniqueNeedle,
  publicApexRow,
} from "../bench/generate-apex-pack.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BANNED = "sidecar";

test("apex generator source does not use the banned Isolated Semantic Engine alias", async () => {
  const source = await readFile(join(ROOT, "bench/generate-apex-pack.mjs"), "utf8");
  assert.equal(source.toLowerCase().includes(BANNED), false);
});

test("apex generator refuses to write the sealed holdout-v0.2 tree", () => {
  assert.throws(() => assertNotLegacyHoldout(join(ROOT, "bench/packs/holdout-v0.2/reports/results.jsonl")));
  assert.doesNotThrow(() => assertNotLegacyHoldout(join(ROOT, "bench/packs", APEX_PACK_ID, "reports/results.jsonl")));
});

test("pickUniqueNeedle appends a sentinel on a unique unit line", () => {
  const text = "func Alpha() {\n  return\n}\nfunc Beta() {\n  return 2\n}\n";
  const unit = "func Beta() {\n  return 2\n}";
  const needle = pickUniqueNeedle(text, unit, APEX_SENTINEL, "//");
  assert.equal(needle.expected, "  return 2");
  assert.equal(needle.replacement.includes(APEX_SENTINEL), true);
  assert.equal(text.split(needle.expected).length, 2);
});

test("pairApexRows records negative Isolated Semantic Engine payload deltas", () => {
  const rows = pairApexRows([
    {
      system: "isolated-semantic-engine",
      repo: "flask",
      path: "src/flask/views.py",
      selector: APEX_NESTED_SELECTOR,
      payloadBytes: 1058,
      granularity: "nested-enclosing-span",
    },
    {
      system: "corvus-file",
      repo: "flask",
      path: "src/flask/views.py",
      selector: APEX_NESTED_SELECTOR,
      payloadBytes: 7482,
      granularity: "nested-enclosing-span",
    },
  ]);
  const isolated = rows.find((row) => row.system === "isolated-semantic-engine");
  const corvus = rows.find((row) => row.system === "corvus-file");
  assert.equal(isolated.payloadDeltaVsCorvus, -6424);
  assert.equal(corvus.payloadDeltaVsCorvus, 0);
  const published = publicApexRow({
    ...isolated,
    packId: APEX_PACK_ID,
    observationScope: "symbol",
    verdict: "pass",
    reason: null,
    failOpen: false,
    goldInPayload: true,
    peakRssBytes: 1,
    latencyMs: { n: 1, warmups: 0, repetitions: 1, min: 0, p50: 0, p95: 0, p99: 0, max: 0 },
    engineSpawn: "ok",
    payloadSha256: "a",
    goldSha256: "b",
    transformedSerialized: "secret",
  });
  assert.equal(Object.hasOwn(published, "transformedSerialized"), false);
  assert.equal(published.goldSource, "independent-symbols");
  assert.equal(published.granularity, "nested-enclosing-span");
});

test("generated apex traces use independent gold and nested enclosing-span reads", async () => {
  const tracesDir = join(ROOT, "bench/packs", APEX_PACK_ID, "traces");
  const names = (await readdir(tracesDir)).filter((name) => name.endsWith(".json")).sort();
  assert.equal(names.length >= 5, true);
  const traces = [];
  for (const name of names) {
    traces.push(JSON.parse(await readFile(join(tracesDir, name), "utf8")));
  }
  const nested = traces.find((trace) => trace.events[0]?.selector === APEX_NESTED_SELECTOR);
  assert.ok(nested);
  assert.equal(nested.packId, APEX_PACK_ID);
  assert.equal(nested.goldExtract.source, "independent-symbols");
  assert.equal(nested.events[0].scope, "symbol");
  const repos = new Set(traces.map((trace) => trace.name.split("/")[0]));
  assert.deepEqual([...repos].sort(), ["express", "flask", "go-tools", "ripgrep"]);
});

test("committed apex results.jsonl has Isolated Semantic Engine payload wins", async () => {
  const jsonlPath = join(ROOT, "bench/packs", APEX_PACK_ID, "reports/results.jsonl");
  const raw = await readFile(jsonlPath, "utf8");
  const rows = raw.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(rows.length > 0, true);
  const isolated = rows.filter((row) => row.system === "isolated-semantic-engine");
  assert.equal(isolated.length > 0, true);
  assert.equal(isolated.every((row) => row.payloadDeltaVsCorvus < 0), true);
  assert.equal(isolated.every((row) => row.goldSource === "independent-symbols"), true);
  assert.equal(isolated.some((row) => row.selector === APEX_NESTED_SELECTOR), true);
});

test("sealed holdout-v0.2 result rows stay intact", async () => {
  const text = await readFile(join(ROOT, "bench/packs/holdout-v0.2/reports/results.jsonl"), "utf8");
  assert.match(text, /bce6ac87f63c156d9123a13ec961294cbaf74794009df1305c3f8e3ac253a41e/u);
  assert.match(text, /4d51c24bd8cc0c8f77844779a38516058acd78f411fbb3f1544de580d791aa62/u);
});
