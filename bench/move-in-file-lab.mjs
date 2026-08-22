import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { hashDirectoryJsonSet, hashJsonlSet } from "./holdout-hashes.mjs";
import { goldBytesForRead } from "./oracle.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";

export const MOVE_IN_FILE_LAB_PACK_ID = "move-in-file-dev-v0.1";
export const MOVE_IN_FILE_LAB_MANIFEST_PATH = "bench/splits/move-in-file-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const MARKER_ALPHA = "// lab-move-in-file unique marker alpha-c6b5";
const MARKER_BETA = "// lab-move-in-file unique marker beta-c6b5";
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};

const BODY_FIRST = "\tName              string  // benchmark name";
const BODY_FIRST_RELOCATED = "\tNameRelocated       string  // benchmark name relocated";
const BODY_LAST = "\tOrd               int     // ordinal position within a benchmark run";
const FIELDS = [
  BODY_FIRST,
  "\tN                 int     // number of iterations",
  "\tNsPerOp           float64 // nanoseconds per iteration",
  "\tAllocedBytesPerOp uint64  // bytes allocated per iteration",
  "\tAllocsPerOp       uint64  // allocs per iteration",
  "\tMBPerS            float64 // MB processed per second",
  "\tMeasured          int     // which measurements were recorded",
  BODY_LAST,
].join("\n");
const FIELDS_RELOCATED = FIELDS.replace(BODY_FIRST, BODY_FIRST_RELOCATED);
const SET_COMMENT = "// Set is a collection of benchmarks from one";
const EMPTY_STRUCT = "type Benchmark struct {\n}";
const TYPE_HEADER = "type Benchmark struct {";

const MOVE_OUT = {
  expected: `${FIELDS}\n`,
  replacement: "",
};

const MOVE_IN = {
  expected: SET_COMMENT,
  replacement: `${FIELDS}\n\n${SET_COMMENT}`,
};

const MOVE_IN_RELOCATED = {
  expected: SET_COMMENT,
  replacement: `${FIELDS_RELOCATED}\n\n${SET_COMMENT}`,
};

const DUPLICATE_AT_OLD = {
  expected: EMPTY_STRUCT,
  replacement: `type Benchmark struct {\n${FIELDS}\n}`,
};

const MARKERS_AT_OLD = {
  expected: EMPTY_STRUCT,
  replacement: `${TYPE_HEADER}\n\t${MARKER_ALPHA}\n\t${MARKER_BETA}\n}`,
};

const RENAME_HEADER = {
  expected: TYPE_HEADER,
  replacement: "type BenchmarkSnapshot struct {",
};

export const MOVE_IN_FILE_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/move-in-file/benchmark-fields",
    family: "move-in-file",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["move-out", "move-in"],
  },
  {
    id: "decoy",
    name: "go-tools/move-in-file/benchmark-fields-duplicate-decoy",
    family: "move-in-file",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["move-out", "move-in", "duplicate-at-old"],
  },
  {
    id: "codex",
    name: "go-tools/move-in-file/benchmark-fields-leftover-markers",
    family: "move-in-file",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["move-out", "markers-at-old", "rename-header", "move-in-relocated"],
  },
];

function cellMutations(cell) {
  const byId = {
    "move-out": MOVE_OUT,
    "move-in": MOVE_IN,
    "move-in-relocated": MOVE_IN_RELOCATED,
    "duplicate-at-old": DUPLICATE_AT_OLD,
    "markers-at-old": MARKERS_AT_OLD,
    "rename-header": RENAME_HEADER,
  };
  return cell.mutationIds.map((id) => {
    const mutation = byId[id];
    if (!mutation) throw new Error(`unknown mutation ${id}`);
    return mutation;
  });
}

export function moveInFileLabManifestDraft() {
  return {
    packId: MOVE_IN_FILE_LAB_PACK_ID,
    benchmarkVersion: MOVE_IN_FILE_LAB_PACK_ID,
    label: "move-in-file-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["move-in-file"],
    seeds: { traceSelection: MOVE_IN_FILE_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: MOVE_IN_FILE_LAB_CELLS.length,
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
    manifestPath: MOVE_IN_FILE_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/move-in-file-dev-v0.1",
    reportsDir: `bench/packs/${MOVE_IN_FILE_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${MOVE_IN_FILE_LAB_PACK_ID}/provenance`,
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
  if (initialContent !== FIELDS) {
    throw new Error(`${cell.id} does not match locked Benchmark.fields bytes`);
  }
  const mutations = cellMutations(cell);
  const firstSha = sha256(await oracleGoldBytes(sourceText, cell, initialContent));
  const mutated = applyMutations(sourceText, mutations);
  const secondSha = sha256(await oracleGoldBytes(mutated, cell, initialContent));

  if (cell.id === "door" || cell.id === "decoy") {
    if (mutated.split(FIELDS).length - 1 < (cell.id === "decoy" ? 2 : 1)) {
      throw new Error(`${cell.id} missing relocated Benchmark.fields bytes`);
    }
  }

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

export async function buildMoveInFileLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(`move-in-file lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`);
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");
  if (sourceText.includes(MARKER_ALPHA) || sourceText.includes(MARKER_BETA)) {
    throw new Error("move-in-file lab markers already present in parse.go");
  }

  const traces = [];
  for (const cell of MOVE_IN_FILE_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: MOVE_IN_FILE_LAB_CELLS };
}

export async function generateMoveInFileLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildMoveInFileLabTraces({ goParse, goCommit });
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

function liveIncludesLookalike(payloadText) {
  const units = decodeProjectionUnits(payloadText ?? "");
  const lookalike = `${BODY_FIRST}\n${BODY_LAST}`;
  return units.some(
    (unit) =>
      unit.content.includes(lookalike) &&
      !unit.content.includes("\tN                 int     // number of iterations"),
  );
}

export async function runMoveInFileLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(MOVE_IN_FILE_LAB_CELLS.map((cell) => [cell.name, cell]));
  const names = (await readdir(join(root, pack.tracesDir)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const jsonlLines = [];
  for (const name of names) {
    const trace = JSON.parse(await readFile(join(root, pack.tracesDir, name), "utf8"));
    const cell = cellsByName.get(trace.name);
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
        liveIncludesLookalike: liveIncludesLookalike(capture.payloadText),
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
    summary: `Ran ${jsonlLines.length} move-in-file lab cell(s).`,
    recordsWritten: jsonlLines.length,
    resultSetHash,
  };
}
