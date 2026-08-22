import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { hashDirectoryJsonSet, hashJsonlSet } from "./holdout-hashes.mjs";
import { goldBytesForRead } from "./oracle.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";

export const MOVE_CROSS_FILE_LAB_PACK_ID = "move-cross-file-dev-v0.1";
export const MOVE_CROSS_FILE_LAB_MANIFEST_PATH = "bench/splits/move-cross-file-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const DEST_PATH = "benchmark/parse/parse_test.go";
const MARKER_ALPHA = "// lab-move-cross-file unique marker alpha-5a76";
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};
const RELOCATED_FIELDS_SHA = "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";

const BODY_FIRST = "\tName              string  // benchmark name";
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
const LOOKALIKE_FIELDS = `${BODY_FIRST}\n${BODY_LAST}`;
const EMPTY_STRUCT = "type Benchmark struct {\n}";
const DEST_ANCHOR = "func TestParseLine(t *testing.T) {";

const MUTATIONS = {
  "move-out": {
    path: PARSE_PATH,
    expected: `${FIELDS}\n`,
    replacement: "",
  },
  "move-in-dest": {
    path: DEST_PATH,
    expected: DEST_ANCHOR,
    replacement: `${FIELDS}\n\n${DEST_ANCHOR}`,
  },
  "duplicate-at-old": {
    path: PARSE_PATH,
    expected: EMPTY_STRUCT,
    replacement: `type Benchmark struct {\n${FIELDS}\n}`,
  },
  "lookalike-in-dest": {
    path: DEST_PATH,
    expected: DEST_ANCHOR,
    replacement: `${LOOKALIKE_FIELDS}\n\n${DEST_ANCHOR}`,
  },
};

export const MOVE_CROSS_FILE_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/move-cross-file/benchmark-fields",
    family: "move-cross-file",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["move-out", "move-in-dest"],
    absenceGold: true,
  },
  {
    id: "decoy",
    name: "go-tools/move-cross-file/benchmark-fields-duplicate-decoy",
    family: "move-cross-file",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["move-out", "move-in-dest", "duplicate-at-old"],
    absenceGold: false,
  },
  {
    id: "codex",
    name: "go-tools/move-cross-file/benchmark-fields-leftover-decoy",
    family: "move-cross-file",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["move-out", "lookalike-in-dest"],
    absenceGold: true,
  },
];

function cellMutations(cell) {
  return cell.mutationIds.map((id) => {
    const mutation = MUTATIONS[id];
    if (!mutation) throw new Error(`unknown mutation ${id}`);
    return mutation;
  });
}

export function moveCrossFileLabManifestDraft() {
  return {
    packId: MOVE_CROSS_FILE_LAB_PACK_ID,
    benchmarkVersion: MOVE_CROSS_FILE_LAB_PACK_ID,
    label: "move-cross-file-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["move-cross-file"],
    seeds: { traceSelection: MOVE_CROSS_FILE_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: MOVE_CROSS_FILE_LAB_CELLS.length,
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
    manifestPath: MOVE_CROSS_FILE_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/move-cross-file-dev-v0.1",
    reportsDir: `bench/packs/${MOVE_CROSS_FILE_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${MOVE_CROSS_FILE_LAB_PACK_ID}/provenance`,
  };
}

function extractRegion(content, startLine, endLine) {
  return content.split("\n").slice(startLine - 1, endLine).join("\n");
}

function applyMutations(files, mutations) {
  const next = { ...files };
  for (const mutation of mutations) {
    const filePath = mutation.path;
    const current = next[filePath];
    if (typeof current !== "string") {
      throw new Error(`missing file content for ${filePath}`);
    }
    const expected = String(mutation.expected).replaceAll("\r\n", "\n");
    const replacement = String(mutation.replacement).replaceAll("\r\n", "\n");
    if (!current.includes(expected)) {
      throw new Error(`replace-exact miss in ${filePath}: ${expected.slice(0, 64)}`);
    }
    next[filePath] = current.replace(expected, replacement);
  }
  return next;
}

function contentWorkspace(files) {
  return {
    async read(filePath) {
      if (!(filePath in files)) {
        const error = new Error(`ENOENT: ${filePath}`);
        error.code = "ENOENT";
        throw error;
      }
      return files[filePath];
    },
  };
}

async function oracleGoldBytes(files, cell, initialContent) {
  return goldBytesForRead(contentWorkspace(files), {
    path: PARSE_PATH,
    scope: "region",
    startLine: cell.startLine,
    endLine: cell.endLine,
    selector: cell.selector,
    initialContent,
  });
}

function firstCaptureEvent(cell, digest) {
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

function finalCaptureEvent(cell, digest) {
  if (cell.absenceGold) {
    return {
      type: "capture-request",
      task: cell.task,
      budgetChars: BUDGET_CHARS,
      requiredUnits: [],
    };
  }
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

async function buildCellTrace(cell, sourceText, destText, goCommit) {
  const initialContent = extractRegion(sourceText, cell.startLine, cell.endLine);
  if (initialContent !== FIELDS) {
    throw new Error(`${cell.id} does not match locked Benchmark.fields bytes`);
  }
  const mutations = cellMutations(cell);
  const firstSha = sha256(await oracleGoldBytes({ [PARSE_PATH]: sourceText }, cell, initialContent));
  const mutatedFiles = applyMutations(
    { [PARSE_PATH]: sourceText, [DEST_PATH]: destText },
    mutations,
  );
  const finalBytes = cell.absenceGold
    ? null
    : await oracleGoldBytes(mutatedFiles, cell, initialContent);
  const finalSha = finalBytes === null ? null : sha256(finalBytes);

  if (cell.id === "door" || cell.id === "codex") {
    if (mutatedFiles[PARSE_PATH].includes(FIELDS)) {
      throw new Error(`${cell.id} still includes full Benchmark.fields in parse.go`);
    }
  }
  if (cell.id === "door" || cell.id === "decoy") {
    if (!mutatedFiles[DEST_PATH].includes(FIELDS)) {
      throw new Error(`${cell.id} missing relocated Benchmark.fields in ${DEST_PATH}`);
    }
  }
  if (cell.id === "decoy") {
    if (!mutatedFiles[PARSE_PATH].includes(FIELDS)) {
      throw new Error(`${cell.id} missing duplicate Benchmark.fields at stored path`);
    }
    if (finalSha !== RELOCATED_FIELDS_SHA) {
      throw new Error(`${cell.id} gold must match relocated fields SHA at stored path`);
    }
  }
  if (cell.id === "codex") {
    if (!mutatedFiles[DEST_PATH].includes(LOOKALIKE_FIELDS)) {
      throw new Error(`${cell.id} missing first+last leftover in ${DEST_PATH}`);
    }
    if (mutatedFiles[DEST_PATH].includes(FIELDS)) {
      throw new Error(`${cell.id} must not plant full unit in ${DEST_PATH}`);
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
      [DEST_PATH]: destText,
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
      firstCaptureEvent(cell, firstSha),
      ...mutations.map((mutation) => ({
        type: "replace-exact",
        path: mutation.path,
        expected: mutation.expected,
        replacement: mutation.replacement,
      })),
      finalCaptureEvent(cell, finalSha),
    ],
  };
}

export async function buildMoveCrossFileLabTraces({ goParse, goParseTest, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(`move-cross-file lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`);
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");
  const destText = String(goParseTest).replaceAll("\r\n", "\n");
  if (sourceText.includes(MARKER_ALPHA) || destText.includes(MARKER_ALPHA)) {
    throw new Error("move-cross-file lab markers already present");
  }
  if (!destText.includes(DEST_ANCHOR)) {
    throw new Error(`move-cross-file lab missing destination anchor in ${DEST_PATH}`);
  }

  const traces = [];
  for (const cell of MOVE_CROSS_FILE_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, destText, goCommit));
  }
  return { traces, cells: MOVE_CROSS_FILE_LAB_CELLS };
}

export async function generateMoveCrossFileLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const goParseTest = await readFile(join(root, "bench/repos/go-tools", DEST_PATH), "utf8");
  const { traces } = await buildMoveCrossFileLabTraces({ goParse, goParseTest, goCommit });
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

function liveIncludesCrossFileBytes(payloadText) {
  const units = decodeProjectionUnits(payloadText ?? "");
  return units.some(
    (unit) =>
      unit.path === PARSE_PATH &&
      unit.content.includes(FIELDS) &&
      unit.content.includes("\tN                 int     // number of iterations"),
  );
}

function liveIncludesLookalike(payloadText) {
  const units = decodeProjectionUnits(payloadText ?? "");
  return units.some(
    (unit) =>
      unit.content.includes(LOOKALIKE_FIELDS) &&
      !unit.content.includes("\tN                 int     // number of iterations"),
  );
}

export async function runMoveCrossFileLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(MOVE_CROSS_FILE_LAB_CELLS.map((cell) => [cell.name, cell]));
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
        liveIncludesCrossFileBytes: liveIncludesCrossFileBytes(capture.payloadText),
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
    summary: `Ran ${jsonlLines.length} move-cross-file lab cell(s).`,
    recordsWritten: jsonlLines.length,
    resultSetHash,
  };
}
