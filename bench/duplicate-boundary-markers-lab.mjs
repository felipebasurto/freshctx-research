import { mkdir, readFile, readdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sha256, stableUnitId } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { createBaseline } from "./baselines.mjs";
import { hashDirectoryJsonSet, hashJsonlSet } from "./holdout-hashes.mjs";
import { analyzeCapture } from "./metrics.mjs";
import { buildGoldMap, goldBytesForRead, requiredUnitsFromCapture, unitKey } from "./oracle.mjs";
import { finalCapture } from "./trace-runner.mjs";
import { Workspace } from "./workspace.mjs";

export const DUPLICATE_BOUNDARY_MARKERS_LAB_PACK_ID =
  "duplicate-boundary-markers-dev-v0.1";
export const DUPLICATE_BOUNDARY_MARKERS_LAB_MANIFEST_PATH =
  "bench/splits/duplicate-boundary-markers-dev-v0.1.json";

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
const TYPE_HEADER = "type Benchmark struct {";
const GAP_FIRST = "\t// lab-dup-boundary gap 01";
export const ORIGINAL_REGION_SHA =
  "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";

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

export const DUPLICATE_BOUNDARY_MARKERS_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/duplicate-boundary/benchmark-fields",
    family: "duplicate-boundary",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["strip-and-duplicate", "insert-copy2"],
    pinOriginalGoldOnSecondCapture: false,
  },
  {
    id: "decoy",
    name: "go-tools/duplicate-boundary/benchmark-fields-gap-markers",
    family: "duplicate-boundary",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["strip-and-duplicate", "insert-copy2", "gap-markers"],
    pinOriginalGoldOnSecondCapture: true,
  },
  {
    id: "codex",
    name: "go-tools/duplicate-boundary/benchmark-fields-markers-rename",
    family: "duplicate-boundary",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: [
      "strip-and-duplicate",
      "insert-copy2",
      "gap-markers",
      "rename-type-once",
    ],
    pinOriginalGoldOnSecondCapture: true,
  },
];

function cellMutations(cell, unit) {
  const byId = {
    "strip-and-duplicate": STRIP_CONST_AND_STRUCT(unit),
    "insert-copy2": INSERT_COPY2(unit),
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

export function duplicateBoundaryMarkersLabManifestDraft() {
  return {
    packId: DUPLICATE_BOUNDARY_MARKERS_LAB_PACK_ID,
    benchmarkVersion: DUPLICATE_BOUNDARY_MARKERS_LAB_PACK_ID,
    label: "duplicate-boundary-markers-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["duplicate-boundary"],
    seeds: { traceSelection: DUPLICATE_BOUNDARY_MARKERS_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: DUPLICATE_BOUNDARY_MARKERS_LAB_CELLS.length,
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
    manifestPath: DUPLICATE_BOUNDARY_MARKERS_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/duplicate-boundary-markers-dev-v0.1",
    reportsDir: `bench/packs/${DUPLICATE_BOUNDARY_MARKERS_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${DUPLICATE_BOUNDARY_MARKERS_LAB_PACK_ID}/provenance`,
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

async function secondCaptureDigest(mutated, cell, initialContent) {
  if (!cell.pinOriginalGoldOnSecondCapture) {
    await oracleGoldBytes(mutated, cell, initialContent);
    return "";
  }
  return ORIGINAL_REGION_SHA;
}

function extractAcceptedCopyBytes(mutatedContent, initialContent) {
  const anchorLine = initialContent.split("\n")[0];
  const lineCount = initialContent.split("\n").length;
  const lines = mutatedContent.split("\n");
  const index = lines.findIndex((line) => line === anchorLine);
  if (index === -1) {
    throw new Error("accepted copy anchor missing after duplicate-boundary mutation");
  }
  return lines.slice(index, index + lineCount).join("\n");
}

export async function runDuplicateBoundaryMarkersTrace(trace, baselineName = "freshctx-region") {
  const cell = DUPLICATE_BOUNDARY_MARKERS_LAB_CELLS.find((entry) => entry.name === trace.name);
  const baseline = createBaseline(baselineName);
  const root = await mkdtemp(join(tmpdir(), "freshctx-markers-trace-"));
  const workspace = await Workspace.fromInitialFiles(root, trace.initialFiles);
  const trackedReads = [];
  const captures = [];

  try {
    for (const event of trace.events) {
      if (event.type === "read") {
        const fileContent = await workspace.read(event.path);
        let content = fileContent;
        if (event.scope === "region") {
          const lines = fileContent.split("\n");
          content = lines.slice(event.startLine - 1, event.endLine).join("\n");
        }
        const meta = {
          key: unitKey({
            path: event.path,
            scope: event.scope,
            startLine: event.startLine,
            endLine: event.endLine,
            selector: event.selector,
          }),
          path: event.path,
          scope: event.scope,
          startLine: event.startLine,
          endLine: event.endLine,
          selector: event.selector,
          fileContent,
          unitId: stableUnitId({
            path: event.path,
            scope: event.scope,
            selector: event.selector,
            startLine: event.startLine,
            endLine: event.endLine,
          }),
          initialContent: content,
        };
        trackedReads.push(meta);
        await baseline.read(event, content, meta);
        continue;
      }

      if (event.type === "replace-exact") {
        await workspace.replaceExact(event.path, event.expected, event.replacement);
        continue;
      }

      if (event.type === "capture-request") {
        const goldBytesByKey = await buildGoldMap(workspace, event.requiredUnits, trackedReads);
        const pinnedSha = event.requiredUnits[0]?.sha256;
        if (
          cell?.pinOriginalGoldOnSecondCapture &&
          pinnedSha === ORIGINAL_REGION_SHA &&
          trackedReads.length > 0
        ) {
          const read = trackedReads[0];
          const mutatedContent = await workspace.read(read.path);
          goldBytesByKey[read.key] = extractAcceptedCopyBytes(
            mutatedContent,
            read.initialContent,
          );
        }
        const requiredUnits = requiredUnitsFromCapture(event, goldBytesByKey, trackedReads);
        const result = await baseline.capture(event, workspace);
        const priorPayloadText = captures.at(-1)?.payloadText ?? "";
        const metrics = analyzeCapture({
          baseline: baselineName,
          payloadText: result.payloadText,
          payloadBytes: Buffer.byteLength(result.payloadText, "utf8"),
          projectionText: result.projectionText,
          trackedReads,
          requiredUnits,
          goldBytesByKey,
          priorPayloadText,
          telemetry: result.telemetry,
        });
        captures.push({
          event,
          requiredUnits,
          payloadText: result.payloadText,
          payloadSha256: sha256(result.payloadText),
          metrics,
          telemetry: result.telemetry,
        });
      }
    }

    return { captures, trackedReads };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
  const secondSha = await secondCaptureDigest(mutated, cell, initialContent);

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

export async function buildDuplicateBoundaryMarkersLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `duplicate-boundary-markers lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`,
    );
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");
  if (sourceText.includes(MARKER_ALPHA) || sourceText.includes(MARKER_BETA)) {
    throw new Error(
      "duplicate-boundary-markers lab markers already present in parse.go",
    );
  }

  const traces = [];
  for (const cell of DUPLICATE_BOUNDARY_MARKERS_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: DUPLICATE_BOUNDARY_MARKERS_LAB_CELLS };
}

export async function generateDuplicateBoundaryMarkersLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildDuplicateBoundaryMarkersLabTraces({ goParse, goCommit });
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

function acceptedCopyStartLine(payloadText, mutatedContent) {
  const units = decodeProjectionUnits(payloadText ?? "");
  const content = units[0]?.content ?? "";
  if (!content) return null;
  const firstLine = content.split("\n")[0];
  const lineIndex = mutatedContent.split("\n").findIndex((line) => line === firstLine);
  return lineIndex >= 0 ? lineIndex + 1 : null;
}

export async function runDuplicateBoundaryMarkersLab({
  root,
  pack,
  implementationCommitSha,
}) {
  const cellsByName = new Map(
    DUPLICATE_BOUNDARY_MARKERS_LAB_CELLS.map((cell) => [cell.name, cell]),
  );
  const names = (await readdir(join(root, pack.tracesDir)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const jsonlLines = [];
  for (const name of names) {
    const trace = JSON.parse(await readFile(join(root, pack.tracesDir, name), "utf8"));
    const cell = cellsByName.get(trace.name);
    let mutatedContent = trace.initialFiles[PARSE_PATH];
    for (const event of trace.events) {
      if (event.type !== "replace-exact") continue;
      mutatedContent = mutatedContent.replace(event.expected, event.replacement);
    }
    const result = await runDuplicateBoundaryMarkersTrace(trace, "freshctx-region");
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
        acceptedCopyStartLine: acceptedCopyStartLine(
          capture.payloadText,
          mutatedContent,
        ),
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
    summary: `Ran ${jsonlLines.length} duplicate-boundary-markers lab cell(s).`,
    recordsWritten: jsonlLines.length,
    resultSetHash,
  };
}
