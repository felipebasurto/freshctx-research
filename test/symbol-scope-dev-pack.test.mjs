import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { FreshCtxEngine } from "../src/engine.mjs";
import { missingSidecarRunner } from "../sidecar/treesitter/client.mjs";
import { parseSource } from "../sidecar/treesitter/parse.mjs";
import {
  NESTED_HELPER_NESTED_PATH,
  NESTED_HELPER_PARENT_PATH,
  NESTED_HELPER_PARENT_TAIL,
  NESTED_HELPER_SHOWDOWN,
  SYMBOL_PACK_REPS,
  SYMBOL_PACK_TARGETS,
  SYMBOL_PACK_WARMUPS,
  SYMBOL_SENTINEL,
  buildSymbolTrace,
  engineSpanForFile,
  forceSymbolObservation,
  generateSymbolPack,
  judgeCell,
  payloadContainsCurrentBytes,
  probeIsolatedSemanticEngine,
  runNestedHelperShowdown,
  runSymbolCell,
  serializeProviderPayload,
  serializedRequestBytes,
} from "../bench/generate-symbol-pack.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("turn-1 observation is forced to scope=symbol with a selector", () => {
  const observation = forceSymbolObservation({
    path: "lib/express.js",
    selector: "createApplication",
    startLine: 1,
    endLine: 4,
  });
  assert.equal(observation.scope, "symbol");
  assert.equal(observation.selector, "createApplication");
  assert.throws(() => forceSymbolObservation({ path: "x.js", selector: "", startLine: 1, endLine: 1 }));
});

test("generated smoke traces emit symbol scope on turn 1 and independent gold", async () => {
  const generated = await generateSymbolPack({ root: ROOT });
  assert.equal(generated.traces.length, 2);
  for (const item of generated.traces) {
    const read = item.trace.events[0];
    assert.equal(read.type, "read");
    assert.equal(read.scope, "symbol");
    assert.ok(read.selector);
    assert.equal(item.trace.goldExtract.source, "independent-symbols");
    assert.ok(item.gold.bytes.includes(SYMBOL_SENTINEL));
  }
});

test("success is gated on current-revision bytes in the serialized payload", () => {
  const gold = "function createApplication() {\n  app.init(); // FRESHCTX_SYMBOL_DEV_V01\n}";
  const messages = [{ role: "user", content: gold }];
  const serialized = serializeProviderPayload(messages);
  assert.equal(payloadContainsCurrentBytes(serialized, gold), true);
  assert.equal(serializedRequestBytes(messages), Buffer.byteLength(serialized, "utf8"));
  assert.notEqual(serializedRequestBytes(messages), Math.floor(gold.length / 4));

  const failOpen = judgeCell({
    observation: { scope: "symbol", selector: "createApplication" },
    originalSerialized: serialized,
    transformedSerialized: serialized,
    goldBytes: gold,
    engineSpawn: "ok",
    system: "isolated-semantic-engine",
  });
  assert.equal(failOpen.verdict, "fail");
  assert.equal(failOpen.reason, "fail-open");

  const stale = judgeCell({
    observation: { scope: "symbol", selector: "createApplication" },
    originalSerialized: "[]",
    transformedSerialized: serializeProviderPayload([{ role: "user", content: "old bytes" }]),
    goldBytes: gold,
    engineSpawn: "ok",
    system: "isolated-semantic-engine",
  });
  assert.equal(stale.reason, "gold-absent");
});

test("missing Isolated Semantic Engine spawn is an explicit failure", async () => {
  const judged = judgeCell({
    observation: { scope: "symbol", selector: "as_view" },
    originalSerialized: "[]",
    transformedSerialized: "{\"projection\":\"tiny\"}",
    goldBytes: "def as_view():\n    return 1\n",
    engineSpawn: "missing",
    system: "isolated-semantic-engine",
  });
  assert.equal(judged.verdict, "fail");
  assert.equal(judged.reason, "missing-engine");

  const probe = await probeIsolatedSemanticEngine(
    () => new FreshCtxEngine({ sidecarRunner: missingSidecarRunner() }),
  );
  assert.equal(probe.state, "missing");
});

test("Isolated Semantic Engine cell fails closed when spawn is missing", async () => {
  const generated = await generateSymbolPack({ root: ROOT });
  const flask = generated.traces.find((item) => item.target.repo === "flask");
  const row = await runSymbolCell({
    target: flask.target,
    observed: flask.observed,
    gold: flask.gold,
    mutatedText: flask.trace.mutatedFiles[flask.target.path],
    system: "isolated-semantic-engine",
    createEngine: () => new FreshCtxEngine({ sidecarRunner: missingSidecarRunner() }),
    engineSpawn: "missing",
  });
  assert.equal(row.verdict, "fail");
  assert.equal(row.reason, "missing-engine");
  assert.notEqual(row.reason, "pass");
});

test("generate-symbol-pack stays off the holdout-v0.2 pipeline", async () => {
  const source = await readFile(join(ROOT, "bench/generate-symbol-pack.mjs"), "utf8");
  assert.equal(source.includes("holdout-v0.2"), false);
  assert.equal(source.includes("holdout-v02"), false);
  assert.equal(source.includes("holdout-protocol"), false);
  assert.equal(source.includes("chars/4"), false);
  assert.match(source, /Buffer\.byteLength/u);
  assert.equal(SYMBOL_PACK_WARMUPS > 0, true);
  assert.equal(SYMBOL_PACK_REPS >= 21, true);
});

test("flask views.py nested view helpers uniquely resolve after enclosing-span paths", async () => {
  const generated = await generateSymbolPack({ root: ROOT });
  const flask = generated.traces.find((item) => item.target.repo === "flask");
  const parsed = await parseSource({
    path: flask.target.path,
    bytes: flask.trace.initialFiles[flask.target.path],
  });
  assert.equal(parsed.error, null);
  const asView = parsed.units.find((unit) => unit.selector === "as_view");
  assert.ok(asView);
  assert.equal(asView.qualifiedSelector, "class View::method as_view");
  const views = parsed.units.filter((unit) => unit.selector === "view");
  assert.deepEqual(
    views.map((unit) => unit.qualifiedSelector),
    [
      "class View::method as_view::if@0::function view",
      "class View::method as_view::else::function view",
    ],
  );
});

test("flask as_view resolves after nested view functions collide", async () => {
  const generated = await generateSymbolPack({ root: ROOT });
  const flask = generated.traces.find((item) => item.target.repo === "flask");
  const row = await runSymbolCell({
    target: flask.target,
    observed: flask.observed,
    gold: flask.gold,
    mutatedText: flask.trace.mutatedFiles[flask.target.path],
    system: "isolated-semantic-engine",
    engineSpawn: "ok",
  });
  assert.equal(row.verdict, "pass");
  assert.equal(row.goldInPayload, true);
  assert.equal(row.failOpen, false);
  assert.ok(row.payloadBytes > 390, "as_view body must enter the serialized payload");
});

test("nested helper showdown stays off official pack gold", () => {
  assert.equal(
    SYMBOL_PACK_TARGETS.some((target) => target.id === NESTED_HELPER_SHOWDOWN.id),
    false,
  );
  assert.equal(NESTED_HELPER_SHOWDOWN.spanSource, "isolated-semantic-engine");
  assert.equal(NESTED_HELPER_SHOWDOWN.tiers[0].qualifiedSelector, NESTED_HELPER_NESTED_PATH);
});

test("nested helper cell requests the full enclosing-span path", () => {
  const observation = forceSymbolObservation({
    path: NESTED_HELPER_SHOWDOWN.path,
    selector: NESTED_HELPER_NESTED_PATH,
    startLine: 1,
    endLine: 4,
  });
  assert.equal(observation.scope, "symbol");
  assert.equal(observation.selector, NESTED_HELPER_NESTED_PATH);
  assert.notEqual(observation.selector, "view");
});

test("Isolated Semantic Engine locates the nested if@0 view helper", async () => {
  const generated = await generateSymbolPack({ root: ROOT });
  const flask = generated.traces.find((item) => item.target.repo === "flask");
  const span = await engineSpanForFile(
    flask.target.path,
    flask.trace.initialFiles[flask.target.path],
    NESTED_HELPER_NESTED_PATH,
  );
  assert.equal(span.selector, NESTED_HELPER_NESTED_PATH);
  assert.equal(span.qualifiedSelector, NESTED_HELPER_NESTED_PATH);
  assert.equal(span.bytes.includes(NESTED_HELPER_PARENT_TAIL), false);
  assert.equal(span.bytes.includes("self = view.view_class("), true);
});

test("nested helper Isolated Semantic Engine payload omits the parent method tail", async () => {
  const showdown = await runNestedHelperShowdown({ root: ROOT });
  assert.equal(showdown.rows.length, 3);
  const nested = showdown.rows.find((row) => row.granularity === 1);
  const parent = showdown.rows.find((row) => row.granularity === 2);
  const corvus = showdown.rows.find((row) => row.granularity === 3);
  assert.equal(nested.system, "isolated-semantic-engine");
  assert.equal(nested.selector, NESTED_HELPER_NESTED_PATH);
  assert.equal(nested.verdict, "pass");
  assert.equal(nested.goldInPayload, true);
  assert.equal(nested.failOpen, false);
  assert.equal(parent.selector, NESTED_HELPER_PARENT_PATH);
  assert.equal(parent.verdict, "pass");
  assert.equal(corvus.system, "corvus-file");
  assert.equal(corvus.verdict, "pass");
  assert.equal(nested.parentTailInPayload, false);
  assert.equal(parent.parentTailInPayload, true);
  assert.equal(corvus.parentTailInPayload, true);
});

test("buildSymbolTrace refuses a non-symbol observation", () => {
  const target = {
    repo: "flask",
    path: "a.py",
    name: "as_view",
    source: { repository: "https://example.test/flask", license: "BSD-3-Clause" },
    expected: "return 1",
    replacement: "return 2",
    task: "t",
  };
  const observed = { selector: "as_view", startLine: 1, endLine: 2, bytes: "def as_view():\n    return 1" };
  const gold = { ...observed, path: "a.py", sha256: "abc" };
  const trace = buildSymbolTrace({
    target,
    commit: "0".repeat(40),
    initialText: observed.bytes,
    observed,
    mutatedText: "def as_view():\n    return 2",
    gold,
  });
  assert.equal(trace.events[0].scope, "symbol");
});
