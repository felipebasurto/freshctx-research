import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { hashDirectoryJsonSet, hashJsonlSet } from "./holdout-hashes.mjs";
import { goldBytesForRead } from "./oracle.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";

export const PARSE_BROKEN_LAB_PACK_ID = "parse-broken-dev-v0.1";
export const PARSE_BROKEN_LAB_MANIFEST_PATH = "bench/splits/parse-broken-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const MARKER_ALPHA = "// lab-parse-broken unique marker alpha-6ce7";
const MARKER_BETA = "// lab-parse-broken unique marker beta-6ce7";
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};

const ORIGINAL_FIRST = "func ParseLine(line string) (*Benchmark, error) {";
const BROKEN_FIRST = "func ParseLineBroken(line string) (*Benchmark, error) {";
const SET_COMMENT = "// Set is a collection of benchmarks from one";
const UNIT_START = 41;
const UNIT_END = 62;

const UNCLOSED_STRING_BREAK = {
  expected: "\tb := &Benchmark{Name: fields[0], N: n}",
  replacement: '\tb := &Benchmark{Name: "lab-parse-broken unclosed, N: n}',
};

export const PARSE_BROKEN_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/parse-broken/parse-line",
    family: "parse-broken",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "ParseLine.fn",
    task: "review ParseLine function",
    mutationIds: ["unclosed-string-break"],
    pinBrokenGold: true,
  },
  {
    id: "decoy",
    name: "go-tools/parse-broken/parse-line-lookalike-decoy",
    family: "parse-broken",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "ParseLine.fn",
    task: "review ParseLine function",
    mutationIds: ["unclosed-string-break", "insert-lookalike"],
    pinBrokenGold: true,
  },
  {
    id: "codex",
    name: "go-tools/parse-broken/parse-line-markers-shift",
    family: "parse-broken",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "ParseLine.fn",
    task: "review ParseLine function",
    mutationIds: ["insert-markers", "rename-first", "unclosed-string-break"],
    pinBrokenGold: false,
  },
];

function cellMutations(cell, sourceText) {
  const healthyUnit = extractRegion(sourceText, UNIT_START, UNIT_END);
  const byId = {
    "unclosed-string-break": UNCLOSED_STRING_BREAK,
    "insert-markers": {
      expected: ORIGINAL_FIRST,
      replacement: `${MARKER_ALPHA}\n${MARKER_BETA}\n${ORIGINAL_FIRST}`,
    },
    "rename-first": {
      expected: ORIGINAL_FIRST,
      replacement: BROKEN_FIRST,
    },
    "insert-lookalike": {
      expected: SET_COMMENT,
      replacement: `${healthyUnit}\n\n${SET_COMMENT}`,
    },
  };
  return cell.mutationIds.map((id) => {
    const mutation = byId[id];
    if (!mutation) throw new Error(`unknown mutation ${id}`);
    return mutation;
  });
}

export function parseBrokenLabManifestDraft() {
  return {
    packId: PARSE_BROKEN_LAB_PACK_ID,
    benchmarkVersion: PARSE_BROKEN_LAB_PACK_ID,
    label: "parse-broken-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["parse-broken"],
    seeds: { traceSelection: PARSE_BROKEN_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: PARSE_BROKEN_LAB_CELLS.length,
    },
    metrics: [
      "exact-current-precision",
      "required-current-recall",
      "stale-unit-rate",
      "duplicate-units",
      "projection-bytes",
    ],
    gates: {
      requiredRecallMin: 0,
      staleBytesMax: 0,
      duplicateUnitsMax: 0,
    },
    exclusions: [],
    reposLockPath: "bench/repos.lock.json",
    manifestPath: PARSE_BROKEN_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/parse-broken-dev-v0.1",
    reportsDir: `bench/packs/${PARSE_BROKEN_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${PARSE_BROKEN_LAB_PACK_ID}/provenance`,
  };
}

function extractRegion(content, startLine, endLine) {
  return content.split("\n").slice(startLine - 1, endLine).join("\n");
}

function applyMutations(content, mutations) {
  let next = content;
  for (const mutation of mutations) {
    const expected = String(mutation.expected).replaceAll("\r\n", "\n");
    const replacement = String(mutation.replacement).replaceAll("\r\n", "\n");
    if (!next.includes(expected)) {
      throw new Error(`replace-exact miss: ${expected.slice(0, 64)}`);
    }
    next = next.replace(expected, replacement);
  }
  return next;
}

function contentWorkspace(content) {
  return {
    async read() {
      return content;
    },
  };
}

function originalFirstCount(content) {
  return content.split("\n").filter((line) => line === ORIGINAL_FIRST).length;
}

async function oracleGoldBytes(content, cell, initialContent) {
  return goldBytesForRead(contentWorkspace(content), {
    path: PARSE_PATH,
    scope: "region",
    startLine: cell.startLine,
    endLine: cell.endLine,
    selector: cell.selector,
    initialContent,
  });
}

async function secondCaptureBytes(mutated, cell, initialContent, sourceText) {
  if (cell.pinBrokenGold) {
    const broken = extractRegion(mutated, cell.startLine, cell.endLine);
    if (broken === initialContent) {
      throw new Error("broken gold equals original bytes");
    }
    if (cell.id === "decoy") {
      if (originalFirstCount(mutated) < 2) {
        throw new Error("decoy mutated file missing healthy lookalike");
      }
      const door = PARSE_BROKEN_LAB_CELLS.find((entry) => entry.id === "door");
      const doorGold = extractRegion(
        applyMutations(sourceText, cellMutations(door, sourceText)),
        door.startLine,
        door.endLine,
      );
      if (broken !== doorGold) {
        throw new Error("decoy gold diverged from door broken unit");
      }
    }
    return broken;
  }

  return oracleGoldBytes(mutated, cell, initialContent);
}

function captureEvent(cell, digest) {
  return {
    type: "capture-request",
    task: cell.task,
    budgetChars: BUDGET_CHARS,
    requiredUnits: [
      {
        path: PARSE_PATH,
        selector: cell.selector,
        sha256: digest,
      },
    ],
  };
}

async function buildCellTrace(cell, sourceText, goCommit) {
  const initialContent = extractRegion(sourceText, cell.startLine, cell.endLine);
  const firstSha = sha256(await oracleGoldBytes(sourceText, cell, initialContent));
  const mutations = cellMutations(cell, sourceText);
  const mutated = applyMutations(sourceText, mutations);
  const secondSha = sha256(await secondCaptureBytes(mutated, cell, initialContent, sourceText));

  return {
    schemaVersion: 1,
    name: cell.name,
    source: {
      ...GO_TOOLS_SOURCE,
      commit: goCommit,
    },
    initialFiles: {
      [PARSE_PATH]: sourceText,
    },
    events: [
      {
        type: "read",
        path: PARSE_PATH,
        scope: "region",
        startLine: cell.startLine,
        endLine: cell.endLine,
        selector: cell.selector,
      },
      captureEvent(cell, firstSha),
      ...mutations.map((mutation) => ({
        type: "replace-exact",
        path: PARSE_PATH,
        expected: mutation.expected,
        replacement: mutation.replacement,
      })),
      captureEvent(cell, secondSha),
    ],
  };
}

export async function buildParseBrokenLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(`parse-broken lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`);
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");
  if (sourceText.includes(MARKER_ALPHA) || sourceText.includes(MARKER_BETA)) {
    throw new Error("parse-broken lab markers already present in parse.go");
  }

  const traces = [];
  for (const cell of PARSE_BROKEN_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: PARSE_BROKEN_LAB_CELLS };
}

export async function generateParseBrokenLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildParseBrokenLabTraces({ goParse, goCommit });
  await mkdir(join(root, pack.tracesDir), { recursive: true });
  const traceNames = [];
  for (const trace of traces) {
    const fileName = `${trace.name.replaceAll("/", "-")}.json`;
    await writeFile(join(root, pack.tracesDir, fileName), `${JSON.stringify(trace, null, 2)}\n`);
    traceNames.push(trace.name);
  }
  const traceSetHash = await hashDirectoryJsonSet(root, pack.tracesDir);
  return { tracesWritten: traces.length, traceNames, traceSetHash };
}

function payloadResolutionMethod(payloadText) {
  const units = decodeProjectionUnits(payloadText ?? "");
  if (units.length === 0) return "unresolved";
  const resolution = units[0].resolution;
  if (!resolution || resolution === "unresolved") return "unresolved";
  return resolution;
}

function liveReplayedOriginal(payloadText, initialContent) {
  const units = decodeProjectionUnits(payloadText ?? "");
  return units.some((unit) => unit.content === initialContent);
}

export async function runParseBrokenLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(PARSE_BROKEN_LAB_CELLS.map((cell) => [cell.name, cell]));
  const names = (await readdir(join(root, pack.tracesDir)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const jsonlLines = [];
  for (const name of names) {
    const trace = JSON.parse(await readFile(join(root, pack.tracesDir, name), "utf8"));
    const cell = cellsByName.get(trace.name);
    const initialContent = extractRegion(
      trace.initialFiles[PARSE_PATH],
      cell?.startLine ?? UNIT_START,
      cell?.endLine ?? UNIT_END,
    );
    const result = await runTrace(trace, "freshctx-region");
    const capture = finalCapture(result);
    if (!capture) continue;
    jsonlLines.push(
      JSON.stringify({
        cell: cell?.id ?? trace.name,
        trace: trace.name,
        recall: capture.metrics.requiredRecall,
        exact: capture.metrics.exactCurrentRate,
        stale: capture.metrics.staleUnitRate,
        duplicate: capture.metrics.duplicateUnits,
        staleBytes: capture.metrics.staleBytes,
        projectionBytes: capture.metrics.projectionBytes,
        method: payloadResolutionMethod(capture.payloadText),
        replayedOriginal: liveReplayedOriginal(capture.payloadText, initialContent),
        payloadSha256: capture.payloadSha256,
        implementationCommitSha,
      }),
    );
  }
  await mkdir(join(root, pack.reportsDir), { recursive: true });
  const resultsRel = join(pack.reportsDir, "results.jsonl").replaceAll("\\", "/");
  await writeFile(join(root, resultsRel), jsonlLines.length ? `${jsonlLines.join("\n")}\n` : "");
  const resultSetHash = await hashJsonlSet(root, resultsRel);
  return {
    records: jsonlLines.length,
    summary: `Ran ${jsonlLines.length} parse-broken lab cell(s).`,
    recordsWritten: jsonlLines.length,
    resultSetHash,
  };
}
