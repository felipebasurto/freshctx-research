import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createAdapterEngine } from "../adapters/engine-factory.mjs";
import { parseSource } from "../sidecar/treesitter/parse.mjs";
import { annotateReadMessage } from "../src/transcript.mjs";
import { sha256 } from "../src/hash.mjs";
import { CorvusSyncedFileSet, renderSyncedContext } from "./corvus.mjs";
import { enumerateIndependentSymbols } from "./independent-symbols.mjs";
import { percentile } from "./metrics.mjs";

export const SYMBOL_PACK_ID = "symbol-scope-dev-v0.1";
export const SYMBOL_PACK_LABEL = "symbol-scope-dev";
export const SYMBOL_PACK_WARMUPS = 5;
export const SYMBOL_PACK_REPS = 21;
export const SYMBOL_PACK_BUDGET_CHARS = 12000;
export const SYMBOL_SENTINEL = "FRESHCTX_SYMBOL_DEV_V01";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const SYMBOL_PACK_TARGETS = [
  {
    id: "flask-as-view",
    repo: "flask",
    path: "src/flask/views.py",
    name: "as_view",
    smokeTrace: "bench/traces/smoke/flask-interior-edit.json",
    source: {
      repository: "https://github.com/pallets/flask.git",
      license: "BSD-3-Clause",
    },
    expected: "        return view",
    replacement: `        return view  # ${SYMBOL_SENTINEL}`,
    task: "refresh as_view after an interior symbol edit",
  },
  {
    id: "express-create-application",
    repo: "express",
    path: "lib/express.js",
    name: "createApplication",
    smokeTrace: "bench/traces/smoke/express-interior-edit.json",
    source: {
      repository: "https://github.com/expressjs/express.git",
      license: "MIT",
    },
    expected: "  app.init();",
    replacement: `  app.init(); // ${SYMBOL_SENTINEL}`,
    task: "refresh createApplication after an interior symbol edit",
  },
];

export const SYSTEMS = ["isolated-semantic-engine", "corvus-file"];

export const NESTED_HELPER_NESTED_PATH = "class View::method as_view::if@0::function view";
export const NESTED_HELPER_PARENT_PATH = "class View::method as_view";
export const NESTED_HELPER_PARENT_TAIL = "        return view";

export const NESTED_HELPER_SHOWDOWN = Object.freeze({
  id: "flask-as-view-if0-view",
  repo: "flask",
  path: "src/flask/views.py",
  smokeTrace: "bench/traces/smoke/flask-interior-edit.json",
  source: {
    repository: "https://github.com/pallets/flask.git",
    license: "BSD-3-Clause",
  },
  expected: "self = view.view_class(",
  replacement: `self = view.view_class(  # ${SYMBOL_SENTINEL}`,
  task: "refresh nested if@0 view after an interior symbol edit",
  parentTail: NESTED_HELPER_PARENT_TAIL,
  spanSource: "isolated-semantic-engine",
  tiers: Object.freeze([
    Object.freeze({
      id: "tier-1-nested-helper",
      tier: 1,
      system: "isolated-semantic-engine",
      qualifiedSelector: NESTED_HELPER_NESTED_PATH,
      goldSelector: NESTED_HELPER_NESTED_PATH,
    }),
    Object.freeze({
      id: "tier-2-parent-method",
      tier: 2,
      system: "isolated-semantic-engine",
      qualifiedSelector: NESTED_HELPER_PARENT_PATH,
      goldSelector: NESTED_HELPER_PARENT_PATH,
    }),
    Object.freeze({
      id: "tier-3-corvus-file",
      tier: 3,
      system: "corvus-file",
      qualifiedSelector: NESTED_HELPER_NESTED_PATH,
      goldSelector: NESTED_HELPER_NESTED_PATH,
    }),
  ]),
});

function messageText(messages) {
  return messages
    .flatMap((message) => {
      if (typeof message.content === "string") return [message.content];
      if (!Array.isArray(message.content)) return [];
      return message.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text);
    })
    .join("\n");
}

export function serializeProviderPayload(messages) {
  return JSON.stringify(messages);
}

export function serializedRequestBytes(messages) {
  return Buffer.byteLength(serializeProviderPayload(messages), "utf8");
}

export function payloadContainsCurrentBytes(serialized, goldBytes) {
  if (serialized.includes(goldBytes)) return true;
  const escaped = JSON.stringify(goldBytes).slice(1, -1);
  return escaped.length > 0 && serialized.includes(escaped);
}

export function readPeakRssBytes() {
  try {
    const status = readFileSync("/proc/self/status", "utf8");
    const match = status.match(/VmHWM:\s+(\d+)\s+kB/u);
    if (match) return Number(match[1]) * 1024;
  } catch {
    // fall through to process RSS
  }
  return process.memoryUsage().rss;
}

export function latencySummary(samples) {
  return {
    n: samples.length,
    warmups: SYMBOL_PACK_WARMUPS,
    repetitions: SYMBOL_PACK_REPS,
    min: Math.min(...samples),
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    max: Math.max(...samples),
  };
}

export function judgeCell({
  observation,
  originalSerialized,
  transformedSerialized,
  goldBytes,
  engineSpawn,
  system,
}) {
  if (observation?.scope !== "symbol" || !observation?.selector) {
    return { verdict: "fail", reason: "observation-not-symbol" };
  }
  if (system === "isolated-semantic-engine" && engineSpawn === "missing") {
    return { verdict: "fail", reason: "missing-engine" };
  }
  if (system === "isolated-semantic-engine" && engineSpawn === "error") {
    return { verdict: "fail", reason: "engine-error" };
  }
  if (transformedSerialized === originalSerialized) {
    return { verdict: "fail", reason: "fail-open" };
  }
  if (!payloadContainsCurrentBytes(transformedSerialized, goldBytes)) {
    return { verdict: "fail", reason: "gold-absent" };
  }
  return { verdict: "pass", reason: null };
}

function lockCommit(lock, repo) {
  const commit = lock.repositories?.[repo]?.commit;
  if (!commit) throw new Error(`repos.lock.json is missing ${repo}`);
  return commit;
}

export async function loadSmokeFile(root, target) {
  const trace = JSON.parse(await readFile(join(root, target.smokeTrace), "utf8"));
  const text = trace.initialFiles?.[target.path];
  if (typeof text !== "string") {
    throw new Error(`${target.smokeTrace} is missing ${target.path}`);
  }
  return String(text).replaceAll("\r\n", "\n");
}

function applyInteriorEdit(text, target) {
  if (!text.includes(target.expected)) {
    throw new Error(`mutation needle missing in ${target.path}: ${target.expected}`);
  }
  if (text.split(target.expected).length !== 2) {
    throw new Error(`mutation needle is not unique in ${target.path}`);
  }
  return text.replace(target.expected, target.replacement);
}

function sliceSpan(text, startLine, endLine) {
  return String(text).replaceAll("\r\n", "\n").split("\n").slice(startLine - 1, endLine).join("\n");
}

export function goldSpanForFile(path, text, name) {
  const extracted = enumerateIndependentSymbols({ path, bytes: text });
  const matches = (extracted.units ?? []).filter(
    (unit) => unit.selector === name || unit.qualifiedSelector === name,
  );
  if (matches.length !== 1) {
    throw new Error(
      `independent-symbols needs exactly one ${name} in ${path} (found ${matches.length}${extracted.error ? `, ${extracted.error}` : ""})`,
    );
  }
  const unit = matches[0];
  const bytes = sliceSpan(text, unit.startLine, unit.endLine);
  return { ...unit, name: unit.selector, bytes };
}

export async function engineSpanForFile(path, text, qualifiedSelector) {
  const parsed = await parseSource({ path, bytes: text });
  const matches = (parsed.units ?? []).filter(
    (unit) => unit.selector === qualifiedSelector || unit.qualifiedSelector === qualifiedSelector,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Isolated Semantic Engine needs exactly one ${qualifiedSelector} in ${path} (found ${matches.length}${parsed.error ? `, ${parsed.error}` : ""})`,
    );
  }
  const unit = matches[0];
  const bytes = sliceSpan(text, unit.startLine, unit.endLine);
  return {
    ...unit,
    selector: qualifiedSelector,
    name: qualifiedSelector,
    bytes,
    sha256: sha256(bytes),
  };
}

export function forceSymbolObservation({ path, selector, startLine, endLine }) {
  if (!selector) {
    throw new Error("turn-1 observation requires a selector");
  }
  return {
    type: "read",
    path,
    scope: "symbol",
    selector,
    startLine,
    endLine,
  };
}

export function buildSymbolTrace({ target, commit, initialText, observed, mutatedText, gold }) {
  const observation = forceSymbolObservation({
    path: target.path,
    selector: observed.selector,
    startLine: observed.startLine,
    endLine: observed.endLine,
  });
  if (observation.scope !== "symbol" || !observation.selector) {
    throw new Error("turn-1 observation must emit scope=symbol with a selector");
  }
  return {
    schemaVersion: 1,
    name: `${target.repo}/symbol-scope/${target.name}`,
    packId: SYMBOL_PACK_ID,
    label: SYMBOL_PACK_LABEL,
    source: { ...target.source, commit },
    goldExtract: {
      source: "independent-symbols",
      path: gold.path,
      selector: gold.selector,
      startLine: gold.startLine,
      endLine: gold.endLine,
      sha256: gold.sha256,
    },
    initialFiles: {
      [target.path]: initialText,
    },
    events: [
      observation,
      {
        type: "replace-exact",
        path: target.path,
        expected: target.expected,
        replacement: target.replacement,
      },
      {
        type: "capture-request",
        task: target.task,
        budgetChars: SYMBOL_PACK_BUDGET_CHARS,
        requiredUnits: [
          {
            path: target.path,
            selector: gold.selector,
            sha256: gold.sha256,
          },
        ],
      },
    ],
    mutatedFiles: {
      [target.path]: mutatedText,
    },
  };
}

export async function generateSymbolPack({ root = ROOT } = {}) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const tracesDir = join(root, "bench/traces/lab", SYMBOL_PACK_ID);
  await mkdir(tracesDir, { recursive: true });
  const traces = [];
  for (const target of SYMBOL_PACK_TARGETS) {
    const commit = lockCommit(lock, target.repo);
    const initialText = await loadSmokeFile(root, target);
    const observed = goldSpanForFile(target.path, initialText, target.name);
    const mutatedText = applyInteriorEdit(initialText, target);
    const gold = goldSpanForFile(target.path, mutatedText, target.name);
    if (!gold.bytes.includes(SYMBOL_SENTINEL)) {
      throw new Error(`independent-symbols gold for ${target.name} is missing ${SYMBOL_SENTINEL}`);
    }
    const trace = buildSymbolTrace({
      target,
      commit,
      initialText,
      observed,
      mutatedText,
      gold,
    });
    const fileName = `${trace.name.replaceAll("/", "-")}.json`;
    await writeFile(join(tracesDir, fileName), `${JSON.stringify(trace, null, 2)}\n`);
    traces.push({ fileName, trace, target, observed, gold });
  }
  return { tracesDir, traces };
}

function classifyEngineSpawn(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT|Cannot find module|isolated-semantic-engine-missing/iu.test(message)) {
    return { state: "missing", detail: message };
  }
  return { state: "error", detail: message };
}

export async function probeIsolatedSemanticEngine(createEngine = createAdapterEngine) {
  try {
    const engine = createEngine();
    const probeBytes = "def probe_symbol_pack():\n    return 1\n";
    engine.trackRead({
      path: "probe.py",
      content: probeBytes,
      scope: "symbol",
      selector: "probe_symbol_pack",
      startLine: 1,
      endLine: 2,
    });
    engine.advanceTurn();
    await engine.refresh({ "probe.py": probeBytes });
    const unit = engine.registry.list()[0];
    if (!unit || unit.state !== "resolved") {
      return { state: "missing", detail: unit?.resolutionMethod ?? "unresolved" };
    }
    return { state: "ok", detail: unit.resolutionMethod };
  } catch (error) {
    return classifyEngineSpawn(error);
  }
}

function originalHostRequest(observedBytes, task) {
  return [
    { role: "tool", content: observedBytes },
    { role: "user", content: `TASK: ${task}` },
  ];
}

async function captureIsolatedSemanticEngine({
  observed,
  mutatedText,
  target,
  createEngine,
}) {
  const engine = createEngine();
  const unit = engine.trackRead({
    path: target.path,
    content: observed.bytes,
    scope: "symbol",
    selector: observed.selector,
    startLine: observed.startLine,
    endLine: observed.endLine,
  });
  const hostMessages = [
    annotateReadMessage({ role: "tool", content: observed.bytes }, unit),
  ];
  const original = originalHostRequest(observed.bytes, target.task);
  engine.advanceTurn();
  try {
    const request = await engine.buildRequest(hostMessages, {
      sourceProvider: { [target.path]: mutatedText },
      task: target.task,
      budgetChars: SYMBOL_PACK_BUDGET_CHARS,
    });
    return {
      messages: request.messages,
      originalMessages: original,
      telemetry: request.telemetry,
      failOpen: false,
    };
  } catch (error) {
    return {
      messages: original,
      originalMessages: original,
      telemetry: { totalMs: 0, payloadBytes: serializedRequestBytes(original) },
      failOpen: true,
      error,
    };
  }
}

async function captureCorvus({ mutatedText, target, observed }) {
  const synced = new CorvusSyncedFileSet();
  const marker = synced.syncFile(target.path);
  const history = [
    { role: "tool", content: marker },
    { role: "user", content: `TASK: ${target.task}` },
  ];
  const original = originalHostRequest(observed.bytes, target.task);
  const started = performance.now();
  const files = [{ path: target.path, content: mutatedText }];
  const projectionText = renderSyncedContext(files);
  const messages = [...history, { role: "user", content: projectionText }];
  return {
    messages,
    originalMessages: original,
    telemetry: {
      totalMs: performance.now() - started,
      payloadBytes: serializedRequestBytes(messages),
    },
    failOpen: false,
  };
}

async function timeCapture(runOnce) {
  for (let index = 0; index < SYMBOL_PACK_WARMUPS; index += 1) {
    await runOnce();
  }
  const samples = [];
  let last;
  for (let index = 0; index < SYMBOL_PACK_REPS; index += 1) {
    last = await runOnce();
    samples.push(last.telemetry?.totalMs ?? 0);
  }
  return { last, latency: latencySummary(samples), peakRssBytes: readPeakRssBytes() };
}

export async function runSymbolCell({
  target,
  observed,
  gold,
  mutatedText,
  system,
  createEngine = createAdapterEngine,
  engineSpawn,
}) {
  const runOnce = () => {
    if (system === "isolated-semantic-engine") {
      return captureIsolatedSemanticEngine({
        observed,
        mutatedText,
        target,
        createEngine,
      });
    }
    return captureCorvus({ mutatedText, target, observed });
  };
  const timed = await timeCapture(runOnce);
  const capture = timed.last;
  const transformedSerialized = serializeProviderPayload(capture.messages);
  const originalSerialized = serializeProviderPayload(capture.originalMessages);
  const judged = judgeCell({
    observation: { scope: "symbol", selector: observed.selector },
    originalSerialized,
    transformedSerialized: capture.failOpen ? originalSerialized : transformedSerialized,
    goldBytes: gold.bytes,
    engineSpawn: system === "isolated-semantic-engine" ? engineSpawn : "n/a",
    system,
  });
  return {
    packId: SYMBOL_PACK_ID,
    system,
    repo: target.repo,
    path: target.path,
    selector: observed.selector,
    observationScope: "symbol",
    verdict: judged.verdict,
    reason: judged.reason,
    failOpen: capture.failOpen || transformedSerialized === originalSerialized,
    goldInPayload: payloadContainsCurrentBytes(
      capture.failOpen ? originalSerialized : transformedSerialized,
      gold.bytes,
    ),
    payloadBytes: serializedRequestBytes(capture.messages),
    peakRssBytes: timed.peakRssBytes,
    latencyMs: timed.latency,
    engineSpawn: system === "isolated-semantic-engine" ? engineSpawn : "n/a",
    payloadSha256: sha256(transformedSerialized),
    goldSha256: gold.sha256,
    transformedSerialized,
  };
}

function publicCellRow(row) {
  const { transformedSerialized, ...rest } = row;
  return rest;
}

function formatTelemetryTable(rows) {
  const header = [
    "system",
    "repo",
    "symbol",
    "verdict",
    "reason",
    "payload_bytes",
    "peak_rss_bytes",
    "latency_p50_ms",
    "latency_p95_ms",
    "gold_in_payload",
    "fail_open",
    "engine_spawn",
  ];
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.system} | ${row.repo} | ${row.selector} | ${row.verdict} | ${row.reason ?? ""} | ${row.payloadBytes} | ${row.peakRssBytes} | ${row.latencyMs.p50.toFixed(2)} | ${row.latencyMs.p95.toFixed(2)} | ${row.goldInPayload} | ${row.failOpen} | ${row.engineSpawn} |`,
    );
  }
  const flask = rows.filter((row) => row.repo === "flask");
  const express = rows.filter((row) => row.repo === "express");
  const deltas = [];
  for (const group of [flask, express]) {
    const isolated = group.find((row) => row.system === "isolated-semantic-engine");
    const corvus = group.find((row) => row.system === "corvus-file");
    if (!isolated || !corvus) continue;
    deltas.push(
      `${isolated.repo}/${isolated.selector}: payload_bytes delta (isolated-semantic-engine - corvus-file) = ${isolated.payloadBytes - corvus.payloadBytes}`,
    );
  }
  return `${lines.join("\n")}\n\n${deltas.join("\n")}\n`;
}

export async function runSymbolPack({
  root = ROOT,
  generated,
  createEngine = createAdapterEngine,
} = {}) {
  const pack = generated ?? await generateSymbolPack({ root });
  const probe = await probeIsolatedSemanticEngine(createEngine);
  const rows = [];
  for (const item of pack.traces) {
    for (const system of SYSTEMS) {
      rows.push(
        await runSymbolCell({
          target: item.target,
          observed: item.observed,
          gold: item.gold,
          mutatedText: item.trace.mutatedFiles[item.target.path],
          system,
          createEngine,
          engineSpawn: probe.state,
        }),
      );
    }
  }
  const reportsDir = join(root, "bench/packs", SYMBOL_PACK_ID, "reports");
  await mkdir(reportsDir, { recursive: true });
  const jsonl = rows.map((row) => JSON.stringify(publicCellRow(row))).join("\n");
  await writeFile(join(reportsDir, "results.jsonl"), jsonl ? `${jsonl}\n` : "");
  const table = formatTelemetryTable(rows);
  const failed = rows.filter((row) => row.verdict !== "pass");
  const footnotes = failed.length === 0
    ? ""
    : `\nFailed cells are not small-payload wins. A missing Isolated Semantic Engine spawn is \`missing-engine\`. A transformed request that equals the original host request is \`fail-open\`. Current-revision gold bytes absent from the serialized payload is \`gold-absent\`.\n`;
  await writeFile(
    join(reportsDir, "telemetry.md"),
    `# ${SYMBOL_PACK_ID}\n\nLabel: \`${SYMBOL_PACK_LABEL}\`. Disposable public-repo smoke pack. Not a holdout or Level 4 result.\n\nGold spans come from \`bench/independent-symbols.mjs\` (Python \`ast\` / JavaScript declaration scan).\nPayload bytes are \`Buffer.byteLength(JSON.stringify(messages), \"utf8\")\`.\nLatency uses ${SYMBOL_PACK_WARMUPS} warmups and ${SYMBOL_PACK_REPS} measured repetitions.\n\n${table}${footnotes}`,
  );
  return { rows, table, reportsDir, engineSpawn: probe.state };
}

export function formatNestedHelperTable(rows) {
  const header = [
    "tier",
    "system",
    "selector",
    "verdict",
    "reason",
    "payload_bytes",
    "delta_vs_coarser",
    "delta_vs_corvus",
    "gold_in_payload",
    "fail_open",
    "engine_spawn",
  ];
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  const byTier = [...rows].sort((left, right) => left.granularity - right.granularity);
  const corvus = byTier.find((row) => row.system === "corvus-file");
  for (let index = 0; index < byTier.length; index += 1) {
    const row = byTier[index];
    const coarser = byTier[index + 1];
    const deltaCoarser = coarser ? row.payloadBytes - coarser.payloadBytes : "";
    const deltaCorvus = corvus ? row.payloadBytes - corvus.payloadBytes : "";
    lines.push(
      `| ${row.granularity} | ${row.system} | ${row.selector} | ${row.verdict} | ${row.reason ?? ""} | ${row.payloadBytes} | ${deltaCoarser} | ${deltaCorvus} | ${row.goldInPayload} | ${row.failOpen} | ${row.engineSpawn} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export async function runNestedHelperShowdown({
  root = ROOT,
  createEngine = createAdapterEngine,
} = {}) {
  const cell = NESTED_HELPER_SHOWDOWN;
  const initialText = await loadSmokeFile(root, cell);
  const mutatedText = applyInteriorEdit(initialText, cell);
  const probe = await probeIsolatedSemanticEngine(createEngine);
  const goldCache = new Map();
  const rows = [];
  for (const tier of cell.tiers) {
    const observed = await engineSpanForFile(cell.path, initialText, tier.qualifiedSelector);
    if (!goldCache.has(tier.goldSelector)) {
      goldCache.set(tier.goldSelector, await engineSpanForFile(cell.path, mutatedText, tier.goldSelector));
    }
    const gold = goldCache.get(tier.goldSelector);
    if (!gold.bytes.includes(SYMBOL_SENTINEL)) {
      throw new Error(`Isolated Semantic Engine gold for ${tier.goldSelector} is missing ${SYMBOL_SENTINEL}`);
    }
    const row = await runSymbolCell({
      target: {
        ...cell,
        name: tier.qualifiedSelector,
      },
      observed,
      gold,
      mutatedText,
      system: tier.system,
      createEngine,
      engineSpawn: probe.state,
    });
    rows.push({
      ...row,
      tier: tier.id,
      granularity: tier.tier,
      parentTailInPayload: row.transformedSerialized.includes(cell.parentTail),
    });
  }
  const reportsDir = join(root, "bench/packs", SYMBOL_PACK_ID, "reports");
  await mkdir(reportsDir, { recursive: true });
  const jsonl = rows.map((row) => JSON.stringify(publicCellRow(row))).join("\n");
  await writeFile(join(reportsDir, "nested-helper-showdown.jsonl"), jsonl ? `${jsonl}\n` : "");
  const table = formatNestedHelperTable(rows);
  await writeFile(
    join(reportsDir, "nested-helper-showdown.md"),
    `# nested-helper-showdown\n\nDisposable Isolated Semantic Engine granularity cell. Not official symbol-pack gold and not a holdout result.\nSpans come from Isolated Semantic Engine parse, not \`bench/independent-symbols.mjs\`.\nPayload bytes are \`Buffer.byteLength(JSON.stringify(messages), \"utf8\")\`.\nLatency uses ${SYMBOL_PACK_WARMUPS} warmups and ${SYMBOL_PACK_REPS} measured repetitions.\n\n${table}`,
  );
  return { rows, table, reportsDir, engineSpawn: probe.state };
}

const isMain = process.argv[1] && process.argv[1].endsWith("generate-symbol-pack.mjs");
if (isMain) {
  const generated = await generateSymbolPack({ root: ROOT });
  const result = await runSymbolPack({ root: ROOT, generated });
  const showdown = await runNestedHelperShowdown({ root: ROOT });
  process.stdout.write(result.table);
  process.stdout.write("\n");
  process.stdout.write(showdown.table);
  if (
    result.rows.some((row) => row.verdict !== "pass")
    || showdown.rows.some((row) => row.verdict !== "pass")
  ) {
    process.exitCode = 1;
  }
}
