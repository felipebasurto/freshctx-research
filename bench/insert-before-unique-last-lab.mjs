import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { goldBytesForRead } from "./oracle.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";

export const INSERT_BEFORE_UNIQUE_LAST_LAB_PACK_ID = "insert-before-unique-last-dev-v0.1";
export const INSERT_BEFORE_UNIQUE_LAST_LAB_MANIFEST_PATH =
  "bench/splits/insert-before-unique-last-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const MARKER_ALPHA = "// lab-unique-last unique marker alpha-7cdc";
const MARKER_BETA = "// lab-unique-last unique marker beta-7cdc";
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};

const BODY_FIRST = "\tName              string  // benchmark name";
const BODY_LAST = "\tOrd               int     // ordinal position within a benchmark run";
const BODY_N = "\tN                 int     // number of iterations";
const COMPETING_FIRST = "Name              string  // benchmark name";
const INSERT_AT_LINE = "\tNsPerOp = 1 << iota";

const COMPETING_PAIR = [
  COMPETING_FIRST,
  "\t// lab-unique-last competing interior 1",
  "\t// lab-unique-last competing interior 2",
  "\t// lab-unique-last competing interior 3",
  "\t// lab-unique-last competing interior 4",
  "\t// lab-unique-last competing interior 5",
  "\t// lab-unique-last competing interior 6",
  BODY_LAST,
].join("\n");

const INSERT_COMPETING_PAIR = {
  expected: INSERT_AT_LINE,
  replacement: `${COMPETING_PAIR}\n${INSERT_AT_LINE}`,
};

const INTERIOR_N = {
  expected: BODY_N,
  replacement: `${BODY_N} // lab-unique-last-interior-7cdc`,
};

const TRAILING_DECOY = {
  expected: "// ParseLine extracts a Benchmark from a single line of testing.B",
  replacement: `${BODY_LAST}\n\n// ParseLine extracts a Benchmark from a single line of testing.B`,
};

export const INSERT_BEFORE_UNIQUE_LAST_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/insert-before/benchmark-fields-unique-last",
    family: "insert-before",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutations: [INSERT_COMPETING_PAIR, INTERIOR_N],
    pinRelocatedGold: true,
  },
  {
    id: "decoy",
    name: "go-tools/insert-before/benchmark-fields-unique-last-trailing-decoy",
    family: "insert-before",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutations: [INSERT_COMPETING_PAIR, INTERIOR_N, TRAILING_DECOY],
    pinRelocatedGold: true,
  },
  {
    id: "codex",
    name: "go-tools/insert-before/benchmark-renamed-header-unique-last",
    family: "insert-before",
    startLine: 28,
    endLine: 37,
    selector: "Benchmark.type",
    task: "review Benchmark type",
    mutations: [
      {
        expected: "type Benchmark struct {",
        replacement: `${MARKER_ALPHA}\n${MARKER_BETA}\ntype Benchmark struct {`,
      },
      {
        expected: "type Benchmark struct {",
        replacement: "type BenchmarkSnapshot struct {",
      },
    ],
    pinRelocatedGold: false,
  },
];

export function insertBeforeUniqueLastLabManifestDraft() {
  return {
    packId: INSERT_BEFORE_UNIQUE_LAST_LAB_PACK_ID,
    benchmarkVersion: INSERT_BEFORE_UNIQUE_LAST_LAB_PACK_ID,
    label: "insert-before-unique-last-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["insert-before"],
    seeds: { traceSelection: INSERT_BEFORE_UNIQUE_LAST_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: INSERT_BEFORE_UNIQUE_LAST_LAB_CELLS.length,
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
    manifestPath: INSERT_BEFORE_UNIQUE_LAST_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/insert-before-unique-last-dev-v0.1",
    reportsDir: `bench/packs/${INSERT_BEFORE_UNIQUE_LAST_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${INSERT_BEFORE_UNIQUE_LAST_LAB_PACK_ID}/provenance`,
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

function insertedLineCount(mutations) {
  return mutations.reduce((total, mutation) => {
    const expected = String(mutation.expected).split("\n").length;
    const replacement = String(mutation.replacement).split("\n").length;
    return total + Math.max(0, replacement - expected);
  }, 0);
}

function relocatedRegion(mutated, cell, insertOnlyMutations) {
  const lineCount = cell.endLine - cell.startLine + 1;
  const shift = insertedLineCount(insertOnlyMutations);
  const startLine = cell.startLine + shift;
  return extractRegion(mutated, startLine, startLine + lineCount - 1);
}

function uniqueLastRegion(mutated, lastLine, lineCount, afterStartLine) {
  const lines = mutated.split("\n");
  const matches = [];
  for (let index = afterStartLine - 1; index < lines.length; index += 1) {
    if (lines[index] === lastLine) matches.push(index);
  }
  if (matches.length !== 1) {
    throw new Error(`unique last after ${afterStartLine} matched ${matches.length}`);
  }
  const end = matches[0];
  return lines.slice(end - lineCount + 1, end + 1).join("\n");
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

async function secondCaptureBytes(mutated, cell, initialContent) {
  const oracle = await oracleGoldBytes(mutated, cell, initialContent);
  if (!cell.pinRelocatedGold) return oracle;

  const insertOnly = cell.mutations.filter((mutation) => mutation !== TRAILING_DECOY);
  const relocated = relocatedRegion(mutated, cell, insertOnly);
  const lineCount = cell.endLine - cell.startLine + 1;
  const shift = insertedLineCount(insertOnly);
  if (!cell.mutations.includes(TRAILING_DECOY)) {
    const lastPinned = uniqueLastRegion(mutated, BODY_LAST, lineCount, cell.startLine + shift);
    if (lastPinned !== relocated) {
      throw new Error("unique-last gold diverged from relocated offsets");
    }
  }
  if (relocated !== oracle) {
    throw new Error("oracle gold diverged from relocated unique-last region");
  }
  const stale = extractRegion(mutated, cell.startLine, cell.endLine);
  if (stale === relocated) {
    throw new Error("relocated gold collapsed to stale original line numbers");
  }
  return relocated;
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
  const mutated = applyMutations(sourceText, cell.mutations);
  const secondSha = sha256(await secondCaptureBytes(mutated, cell, initialContent));

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
      ...cell.mutations.map((mutation) => ({
        type: "replace-exact",
        path: PARSE_PATH,
        expected: mutation.expected,
        replacement: mutation.replacement,
      })),
      captureEvent(cell, secondSha),
    ],
  };
}

export async function buildInsertBeforeUniqueLastLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(`insert-before-unique-last lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`);
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");
  if (sourceText.includes(MARKER_ALPHA) || sourceText.includes(MARKER_BETA)) {
    throw new Error("insert-before-unique-last lab markers already present in parse.go");
  }

  const traces = [];
  for (const cell of INSERT_BEFORE_UNIQUE_LAST_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: INSERT_BEFORE_UNIQUE_LAST_LAB_CELLS };
}

export async function generateInsertBeforeUniqueLastLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildInsertBeforeUniqueLastLabTraces({ goParse, goCommit });
  await mkdir(join(root, pack.tracesDir), { recursive: true });
  const traceNames = [];
  for (const trace of traces) {
    const fileName = `${trace.name.replaceAll("/", "-")}.json`;
    await writeFile(join(root, pack.tracesDir, fileName), `${JSON.stringify(trace, null, 2)}\n`);
    traceNames.push(trace.name);
  }
  return { tracesWritten: traces.length, traceNames };
}

function payloadResolutionMethod(payloadText) {
  const units = decodeProjectionUnits(payloadText ?? "");
  if (units.length === 0) return "unresolved";
  const resolution = units[0].resolution;
  if (!resolution || resolution === "unresolved") return "unresolved";
  return resolution;
}

export async function runInsertBeforeUniqueLastLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(
    INSERT_BEFORE_UNIQUE_LAST_LAB_CELLS.map((cell) => [cell.name, cell]),
  );
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
        payloadSha256: capture.payloadSha256,
        implementationCommitSha,
      }),
    );
  }
  await mkdir(join(root, pack.reportsDir), { recursive: true });
  await writeFile(
    join(root, pack.reportsDir, "results.jsonl"),
    jsonlLines.length ? `${jsonlLines.join("\n")}\n` : "",
  );
  return {
    records: jsonlLines.length,
    summary: `Ran ${jsonlLines.length} insert-before-unique-last lab cell(s).`,
    recordsWritten: jsonlLines.length,
  };
}
