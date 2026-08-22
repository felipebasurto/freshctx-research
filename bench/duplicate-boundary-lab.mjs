import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { hashDirectoryJsonSet, hashJsonlSet } from "./holdout-hashes.mjs";
import { goldBytesForRead } from "./oracle.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";

export const DUPLICATE_BOUNDARY_LAB_PACK_ID = "duplicate-boundary-dev-v0.1";
export const DUPLICATE_BOUNDARY_LAB_MANIFEST_PATH =
  "bench/splits/duplicate-boundary-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const MARKER_ALPHA = "// lab-dup-boundary unique marker alpha-0118";
const MARKER_BETA = "// lab-dup-boundary unique marker beta-0118";
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};

const UNIT_START = 29;
const UNIT_END = 36;
const BODY_LAST = "\tOrd               int     // ordinal position within a benchmark run";
const PARSE_LINE_GODOC = "// ParseLine extracts a Benchmark from a single line of testing.B";
const TYPE_HEADER = "type Benchmark struct {";
const GAP_FIRST = "\t// lab-dup-boundary gap 01";

const STRIP_CONST_AND_STRUCT = (unit) => ({
  expected: `const (
\tNsPerOp = 1 << iota
\tMBPerS
\tAllocedBytesPerOp
\tAllocsPerOp
)

// Benchmark is one run of a single benchmark.
type Benchmark struct {
${unit}
}`,
  replacement: `${unit}
type Benchmark struct {
${Array.from({ length: 8 }, (_, index) => `\t// lab-dup-boundary gap ${String(index + 1).padStart(2, "0")}`).join("\n")}
}`,
});

const INSERT_COPY2 = (unit) => ({
  expected: "\n}\n\n// ParseLine extracts a Benchmark from a single line of testing.B",
  replacement: `\n}\n${unit}\n\n// ParseLine extracts a Benchmark from a single line of testing.B`,
});

const TRAILING_DECOY = {
  expected: PARSE_LINE_GODOC,
  replacement: `${BODY_LAST}\n\n${PARSE_LINE_GODOC}`,
};

export const DUPLICATE_BOUNDARY_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/duplicate-boundary/benchmark-fields",
    family: "duplicate-boundary",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["strip-and-duplicate", "insert-copy2"],
  },
  {
    id: "decoy",
    name: "go-tools/duplicate-boundary/benchmark-fields-trailing-decoy",
    family: "duplicate-boundary",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["strip-and-duplicate", "insert-copy2", "trailing-decoy"],
  },
  {
    id: "codex",
    name: "go-tools/duplicate-boundary/benchmark-renamed-header",
    family: "duplicate-boundary",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["strip-and-duplicate", "insert-copy2", "rename-type-once"],
  },
];

function cellMutations(cell, unit) {
  const byId = {
    "strip-and-duplicate": STRIP_CONST_AND_STRUCT(unit),
    "insert-copy2": INSERT_COPY2(unit),
    "trailing-decoy": TRAILING_DECOY,
    "gap-markers": {
      expected: GAP_FIRST,
      replacement: `${MARKER_ALPHA}\n${MARKER_BETA}\n${GAP_FIRST}`,
    },
    "rename-type-once": {
      expected: TYPE_HEADER,
      replacement: "type BenchmarkSnapshot struct {",
    },
  };
  return cell.mutationIds.map((id) => {
    const mutation = byId[id];
    if (!mutation) throw new Error(`unknown mutation ${id}`);
    return mutation;
  });
}

export function duplicateBoundaryLabManifestDraft() {
  return {
    packId: DUPLICATE_BOUNDARY_LAB_PACK_ID,
    benchmarkVersion: DUPLICATE_BOUNDARY_LAB_PACK_ID,
    label: "duplicate-boundary-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["duplicate-boundary"],
    seeds: { traceSelection: DUPLICATE_BOUNDARY_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: DUPLICATE_BOUNDARY_LAB_CELLS.length,
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
    manifestPath: DUPLICATE_BOUNDARY_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/duplicate-boundary-dev-v0.1",
    reportsDir: `bench/packs/${DUPLICATE_BOUNDARY_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${DUPLICATE_BOUNDARY_LAB_PACK_ID}/provenance`,
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

async function secondCaptureBytes(mutated, cell, initialContent) {
  // After a tied duplicate pair, required identity is ambiguous — do not pin a guess.
  await oracleGoldBytes(mutated, cell, initialContent);
  return "";
}

function captureEvent(cell, digest) {
  const requiredUnits =
    digest.length > 0
      ? [
          {
            path: PARSE_PATH,
            selector: cell.selector,
            sha256: digest,
          },
        ]
      : [];
  return {
    type: "capture-request",
    task: cell.task,
    budgetChars: BUDGET_CHARS,
    requiredUnits,
  };
}

async function buildCellTrace(cell, sourceText, goCommit) {
  const unit = extractRegion(sourceText, cell.startLine, cell.endLine);
  const initialContent = unit;
  const firstSha = sha256(await oracleGoldBytes(sourceText, cell, initialContent));
  const mutations = cellMutations(cell, unit);
  const mutated = applyMutations(sourceText, mutations);
  await secondCaptureBytes(mutated, cell, initialContent);

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
      captureEvent(cell, ""),
    ],
  };
}

export async function buildDuplicateBoundaryLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(`duplicate-boundary lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`);
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");
  if (sourceText.includes(MARKER_ALPHA) || sourceText.includes(MARKER_BETA)) {
    throw new Error("duplicate-boundary lab markers already present in parse.go");
  }

  const traces = [];
  for (const cell of DUPLICATE_BOUNDARY_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: DUPLICATE_BOUNDARY_LAB_CELLS };
}

export async function generateDuplicateBoundaryLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildDuplicateBoundaryLabTraces({ goParse, goCommit });
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

export async function runDuplicateBoundaryLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(DUPLICATE_BOUNDARY_LAB_CELLS.map((cell) => [cell.name, cell]));
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
  const resultsRel = join(pack.reportsDir, "results.jsonl").replaceAll("\\", "/");
  await writeFile(join(root, resultsRel), jsonlLines.length ? `${jsonlLines.join("\n")}\n` : "");
  const resultSetHash = await hashJsonlSet(root, resultsRel);
  return {
    records: jsonlLines.length,
    summary: `Ran ${jsonlLines.length} duplicate-boundary lab cell(s).`,
    recordsWritten: jsonlLines.length,
    resultSetHash,
  };
}
