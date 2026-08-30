import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256 } from "../src/hash.mjs";
import { enumerateIndependentSymbols } from "./independent-symbols.mjs";
import {
  applyInteriorEdit,
  goldSpanForFile,
  loadSmokeFile,
  probeIsolatedSemanticEngine,
  publicCellRow,
  runSymbolCell,
  SYSTEMS,
} from "./generate-symbol-pack.mjs";

export const APEX_PACK_ID = "holdout-v0.3-apex";
export const APEX_PACK_LABEL = "holdout-v0.3-apex";
export const APEX_PACK_WARMUPS = 10;
export const APEX_PACK_REPS = 21;
export const APEX_PACK_BUDGET_CHARS = 12000;
export const APEX_SENTINEL = "FRESHCTX_APEX_V03";
export const APEX_NESTED_SELECTOR = "class View::method as_view::if@0::function view";
export const APEX_PARENT_SELECTOR = "class View::method as_view";
export const LEGACY_HOLDOUT_PACK_ID = "holdout-v0.2";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RIPGREP_MIN_BYTES = 2000;
const RIPGREP_MAX_BYTES = 20000;

export const APEX_MANDATED_TARGETS = Object.freeze([
  Object.freeze({
    id: "flask-nested-if0-view",
    repo: "flask",
    path: "src/flask/views.py",
    name: APEX_NESTED_SELECTOR,
    granularity: "nested-enclosing-span",
    smokeTrace: "bench/traces/smoke/flask-interior-edit.json",
    source: {
      repository: "https://github.com/pallets/flask.git",
      license: "BSD-3-Clause",
    },
    expected: "self = view.view_class(",
    replacement: `self = view.view_class(  # ${APEX_SENTINEL}`,
    task: "refresh nested if@0 view after an interior symbol edit",
  }),
  Object.freeze({
    id: "flask-as-view",
    repo: "flask",
    path: "src/flask/views.py",
    name: "as_view",
    granularity: "symbol",
    smokeTrace: "bench/traces/smoke/flask-interior-edit.json",
    source: {
      repository: "https://github.com/pallets/flask.git",
      license: "BSD-3-Clause",
    },
    expected: "        return view",
    replacement: `        return view  # ${APEX_SENTINEL}`,
    task: "refresh as_view after an interior symbol edit",
  }),
  Object.freeze({
    id: "express-create-application",
    repo: "express",
    path: "lib/express.js",
    name: "createApplication",
    granularity: "symbol",
    smokeTrace: "bench/traces/smoke/express-interior-edit.json",
    source: {
      repository: "https://github.com/expressjs/express.git",
      license: "MIT",
    },
    expected: "  app.init();",
    replacement: `  app.init(); // ${APEX_SENTINEL}`,
    task: "refresh createApplication after an interior symbol edit",
  }),
]);

function lockCommit(lock, repo) {
  const commit = lock.repositories?.[repo]?.commit;
  if (!commit) throw new Error(`repos.lock.json is missing ${repo}`);
  return commit;
}

export function assertNotLegacyHoldout(dest) {
  const normalized = String(dest).split(sep).join("/");
  if (normalized.includes(`/${LEGACY_HOLDOUT_PACK_ID}/`) || normalized.endsWith(`/${LEGACY_HOLDOUT_PACK_ID}`)) {
    throw new Error(`refusing to write ${LEGACY_HOLDOUT_PACK_ID}`);
  }
}

function rankKey(commit, selector) {
  return sha256(`${commit}${selector}interior-edit`);
}

function commentMarker(language) {
  return language === "python" ? "#" : "//";
}

export function pickUniqueNeedle(text, unitBytes, sentinel, marker) {
  const lines = String(unitBytes).split("\n").filter((line) => line.trim().length > 0);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const expected = lines[index];
    if (expected.includes(sentinel)) continue;
    if (text.split(expected).length !== 2) continue;
    return {
      expected,
      replacement: `${expected} ${marker} ${sentinel}`,
    };
  }
  throw new Error("no unique interior needle");
}

async function loadTraceEmbeddedFile(root, traceRel, path) {
  const trace = JSON.parse(await readFile(join(root, traceRel), "utf8"));
  const text = trace.initialFiles?.[path];
  if (typeof text !== "string") {
    throw new Error(`${traceRel} is missing ${path}`);
  }
  return String(text).replaceAll("\r\n", "\n");
}

async function listRipgrepSources(repoRoot) {
  const crates = join(repoRoot, "crates");
  const files = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["target", "tests", "examples", "benches", "fuzz"].includes(entry.name)) continue;
        await walk(abs);
        continue;
      }
      if (!entry.name.endsWith(".rs") || entry.name.endsWith("macros.rs")) continue;
      files.push(abs);
    }
  }
  await walk(crates);
  return files;
}

export function sampleUniqueUnit({ commit, path, text }) {
  const extracted = enumerateIndependentSymbols({ path, bytes: text });
  const unique = (extracted.units ?? []).filter((unit) => unit.kind !== "class");
  if (unique.length === 0) {
    throw new Error(`independent-symbols found no unique units in ${path}${extracted.error ? ` (${extracted.error})` : ""}`);
  }
  unique.sort((left, right) => {
    const a = rankKey(commit, left.qualifiedSelector);
    const b = rankKey(commit, right.qualifiedSelector);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  return unique[0];
}

async function sampleRipgrepTarget(root, lock) {
  const commit = lockCommit(lock, "ripgrep");
  const repoRoot = join(root, "bench/repos/ripgrep");
  if (!existsSync(repoRoot)) {
    throw new Error("ripgrep checkout missing; run npm run repos:fetch -- --ids=ripgrep --relock");
  }
  const files = await listRipgrepSources(repoRoot);
  const ranked = [];
  for (const abs of files) {
    const bytes = await readFile(abs);
    if (bytes.length < RIPGREP_MIN_BYTES || bytes.length > RIPGREP_MAX_BYTES) continue;
    const path = relative(repoRoot, abs).split(sep).join("/");
    const text = bytes.toString("utf8").replaceAll("\r\n", "\n");
    const extracted = enumerateIndependentSymbols({ path, bytes: text });
    for (const unit of extracted.units ?? []) {
      if (unit.kind === "class") continue;
      ranked.push({
        path,
        text,
        unit,
        key: rankKey(commit, unit.qualifiedSelector),
      });
    }
  }
  if (ranked.length === 0) {
    throw new Error("ripgrep has no eligible unique symbol for apex sampling");
  }
  ranked.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  const winner = ranked[0];
  const needle = pickUniqueNeedle(winner.text, sliceSpan(winner.text, winner.unit.startLine, winner.unit.endLine), APEX_SENTINEL, commentMarker("rust"));
  return {
    id: "ripgrep-sampled-symbol",
    repo: "ripgrep",
    path: winner.path,
    name: winner.unit.qualifiedSelector,
    granularity: "symbol",
    source: {
      repository: lock.repositories.ripgrep.url,
      license: lock.repositories.ripgrep.license,
    },
    initialText: winner.text,
    ...needle,
    task: `refresh ${winner.unit.qualifiedSelector} after an interior symbol edit`,
  };
}

function sliceSpan(text, startLine, endLine) {
  return String(text).replaceAll("\r\n", "\n").split("\n").slice(startLine - 1, endLine).join("\n");
}

async function sampleGoToolsTarget(root, lock) {
  const commit = lockCommit(lock, "go-tools");
  const path = "go/buildutil/util.go";
  const text = await loadTraceEmbeddedFile(root, "bench/traces/holdout/go-tools-interior-edit.json", path);
  const unit = sampleUniqueUnit({ commit, path, text });
  const needle = pickUniqueNeedle(text, sliceSpan(text, unit.startLine, unit.endLine), APEX_SENTINEL, commentMarker("go"));
  return {
    id: "go-tools-sampled-symbol",
    repo: "go-tools",
    path,
    name: unit.qualifiedSelector,
    granularity: "symbol",
    source: {
      repository: "https://go.googlesource.com/tools",
      license: "BSD-3-Clause",
    },
    initialText: text,
    ...needle,
    task: `refresh ${unit.qualifiedSelector} after an interior symbol edit`,
  };
}

async function resolveTargetSource(root, target) {
  if (target.initialText) return target.initialText;
  return loadSmokeFile(root, target);
}

export function buildApexTrace({ target, commit, initialText, observed, mutatedText, gold }) {
  return {
    schemaVersion: 1,
    name: `${target.repo}/interior-edit/${target.id}`,
    packId: APEX_PACK_ID,
    label: APEX_PACK_LABEL,
    source: { ...target.source, commit },
    goldExtract: {
      source: "independent-symbols",
      path: gold.path,
      selector: observed.selector,
      startLine: gold.startLine,
      endLine: gold.endLine,
      sha256: gold.sha256,
    },
    initialFiles: {
      [target.path]: initialText,
    },
    events: [
      {
        type: "read",
        path: target.path,
        scope: "symbol",
        selector: observed.selector,
        startLine: observed.startLine,
        endLine: observed.endLine,
      },
      {
        type: "replace-exact",
        path: target.path,
        expected: target.expected,
        replacement: target.replacement,
      },
      {
        type: "capture-request",
        task: target.task,
        budgetChars: APEX_PACK_BUDGET_CHARS,
        requiredUnits: [
          {
            path: target.path,
            selector: observed.selector,
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

function apexObservation(unit) {
  const bytes = unit.bytes;
  return {
    ...unit,
    selector: unit.qualifiedSelector,
    name: unit.qualifiedSelector,
    bytes,
  };
}

export async function resolveApexTargets({ root = ROOT, lock } = {}) {
  const resolvedLock = lock ?? JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goTarget = await sampleGoToolsTarget(root, resolvedLock);
  const rustTarget = await sampleRipgrepTarget(root, resolvedLock);
  return [...APEX_MANDATED_TARGETS, goTarget, rustTarget];
}

export async function generateApexPack({
  root = ROOT,
  targets,
  warmups = APEX_PACK_WARMUPS,
  repetitions = APEX_PACK_REPS,
  skipRun = false,
  skipReportWrite = false,
  createEngine,
} = {}) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const packDir = join(root, "bench/packs", APEX_PACK_ID);
  const tracesDir = join(packDir, "traces");
  const reportsDir = join(packDir, "reports");
  assertNotLegacyHoldout(packDir);
  assertNotLegacyHoldout(tracesDir);
  assertNotLegacyHoldout(reportsDir);

  const resolved = targets ?? await resolveApexTargets({ root, lock });
  await mkdir(tracesDir, { recursive: true });
  const traces = [];
  for (const target of resolved) {
    const commit = lockCommit(lock, target.repo);
    const initialText = await resolveTargetSource(root, target);
    const observedUnit = goldSpanForFile(target.path, initialText, target.name);
    const mutatedText = applyInteriorEdit(initialText, target);
    const goldUnit = goldSpanForFile(target.path, mutatedText, target.name);
    if (!goldUnit.bytes.includes(APEX_SENTINEL)) {
      throw new Error(`independent-symbols gold for ${target.name} is missing ${APEX_SENTINEL}`);
    }
    const observed = apexObservation({ ...observedUnit, bytes: observedUnit.bytes });
    const gold = apexObservation({ ...goldUnit, bytes: goldUnit.bytes });
    const trace = buildApexTrace({
      target,
      commit,
      initialText,
      observed,
      mutatedText,
      gold,
    });
    const fileName = `${trace.name.replaceAll("/", "-")}.json`;
    const dest = join(tracesDir, fileName);
    assertNotLegacyHoldout(dest);
    await writeFile(dest, `${JSON.stringify(trace, null, 2)}\n`);
    traces.push({ fileName, trace, target, observed, gold, mutatedText });
  }

  const statePath = join(packDir, "state.json");
  assertNotLegacyHoldout(statePath);
  await writeFile(
    statePath,
    `${JSON.stringify({
      schemaVersion: 1,
      packId: APEX_PACK_ID,
      classification: "candidate",
      generator: "generate-apex-pack.mjs",
      goldSource: "independent-symbols",
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  );

  if (skipRun) {
    return { tracesDir, reportsDir, traces, rows: [], engineSpawn: null };
  }

  const probe = await (createEngine
    ? probeIsolatedSemanticEngine(createEngine)
    : probeIsolatedSemanticEngine());
  const rows = [];
  for (const item of traces) {
    for (const system of SYSTEMS) {
      const row = await runSymbolCell({
        target: item.target,
        observed: item.observed,
        gold: item.gold,
        mutatedText: item.mutatedText,
        system,
        ...(createEngine ? { createEngine } : {}),
        engineSpawn: probe.state,
        packId: APEX_PACK_ID,
        warmups,
        repetitions,
      });
      rows.push({ ...row, granularity: item.target.granularity });
    }
  }

  const paired = pairApexRows(rows);
  if (!skipReportWrite) {
    await mkdir(reportsDir, { recursive: true });
    const jsonlPath = join(reportsDir, "results.jsonl");
    assertNotLegacyHoldout(jsonlPath);
    const jsonl = paired.map((row) => JSON.stringify(publicApexRow(row))).join("\n");
    await writeFile(jsonlPath, jsonl ? `${jsonl}\n` : "");
  }

  const failed = paired.filter((row) => row.verdict !== "pass");
  const positive = paired.filter((row) => row.system === "isolated-semantic-engine" && !(row.payloadDeltaVsCorvus < 0));
  if (failed.length > 0 || positive.length > 0) {
    const reasons = [
      ...failed.map((row) => `${row.repo}/${row.selector} ${row.reason ?? row.verdict}`),
      ...positive.map((row) => `${row.repo}/${row.selector} payloadDeltaVsCorvus=${row.payloadDeltaVsCorvus}`),
    ];
    throw new Error(`apex pack did not hold: ${reasons.join("; ")}`);
  }

  return { tracesDir, reportsDir, traces, rows: paired, engineSpawn: probe.state };
}

export function pairApexRows(rows) {
  const corvusByKey = new Map();
  for (const row of rows) {
    if (row.system !== "corvus-file") continue;
    corvusByKey.set(`${row.repo}\0${row.path}\0${row.selector}`, row);
  }
  return rows.map((row) => {
    const corvus = corvusByKey.get(`${row.repo}\0${row.path}\0${row.selector}`);
    const payloadDeltaVsCorvus = row.system === "corvus-file" || !corvus
      ? 0
      : row.payloadBytes - corvus.payloadBytes;
    return { ...row, payloadDeltaVsCorvus };
  });
}

export function publicApexRow(row) {
  const publicRow = publicCellRow(row);
  return {
    schemaVersion: 1,
    packId: publicRow.packId,
    system: publicRow.system,
    repo: publicRow.repo,
    path: publicRow.path,
    selector: publicRow.selector,
    observationScope: "symbol",
    granularity: row.granularity ?? "symbol",
    goldSource: "independent-symbols",
    verdict: publicRow.verdict,
    reason: publicRow.reason ?? null,
    failOpen: publicRow.failOpen,
    goldInPayload: publicRow.goldInPayload,
    payloadBytes: publicRow.payloadBytes,
    payloadDeltaVsCorvus: row.payloadDeltaVsCorvus,
    peakRssBytes: publicRow.peakRssBytes,
    latencyMs: publicRow.latencyMs,
    engineSpawn: publicRow.engineSpawn,
    payloadSha256: publicRow.payloadSha256,
    goldSha256: publicRow.goldSha256,
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith("generate-apex-pack.mjs");
if (isMain) {
  const result = await generateApexPack({ root: ROOT });
  for (const row of result.rows) {
    if (row.system !== "isolated-semantic-engine") continue;
    process.stdout.write(
      `${row.repo}/${row.selector} payload_bytes=${row.payloadBytes} delta=${row.payloadDeltaVsCorvus}\n`,
    );
  }
}
