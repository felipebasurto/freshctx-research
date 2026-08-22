import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sha256, stableUnitId } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { createBaseline } from "./baselines.mjs";
import { analyzeCapture } from "./metrics.mjs";
import { hashDirectoryJsonSet, hashJsonlSet } from "./holdout-hashes.mjs";
import { buildGoldMap, goldBytesForRead, requiredUnitsFromCapture, unitKey } from "./oracle.mjs";
import { finalCapture } from "./trace-runner.mjs";
import { Workspace } from "./workspace.mjs";

export const MOVE_LOOKALIKE_LAB_PACK_ID = "move-lookalike-dev-v0.1";
export const MOVE_LOOKALIKE_LAB_MANIFEST_PATH = "bench/splits/move-lookalike-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const MARKER_ALPHA = "// lab-move-lookalike unique marker alpha-aa32";
const MARKER_BETA = "// lab-move-lookalike unique marker beta-aa32";
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};
const RELOCATED_FIELDS_SHA = "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";

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
const LOOKALIKE_FIELDS = `${BODY_FIRST}\n${BODY_LAST}`;
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

const LOOKALIKE_AT_OLD = {
  expected: EMPTY_STRUCT,
  replacement: `type Benchmark struct {\n${LOOKALIKE_FIELDS}\n}`,
};

const MARKERS_AT_OLD = {
  expected: EMPTY_STRUCT,
  replacement: `${TYPE_HEADER}\n\t${MARKER_ALPHA}\n\t${MARKER_BETA}\n}`,
};

const RENAME_HEADER = {
  expected: TYPE_HEADER,
  replacement: "type BenchmarkSnapshot struct {",
};

export const MOVE_LOOKALIKE_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/move-lookalike/benchmark-fields",
    family: "move-in-file",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["move-out", "move-in"],
    pinRelocatedGold: false,
  },
  {
    id: "decoy",
    name: "go-tools/move-lookalike/benchmark-fields-lookalike-decoy",
    family: "move-in-file",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["move-out", "move-in", "lookalike-at-old"],
    pinRelocatedGold: true,
  },
  {
    id: "codex",
    name: "go-tools/move-lookalike/benchmark-fields-leftover-markers",
    family: "move-in-file",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["move-out", "markers-at-old", "rename-header", "move-in-relocated"],
    pinRelocatedGold: false,
  },
];

function cellMutations(cell) {
  const byId = {
    "move-out": MOVE_OUT,
    "move-in": MOVE_IN,
    "move-in-relocated": MOVE_IN_RELOCATED,
    "lookalike-at-old": LOOKALIKE_AT_OLD,
    "markers-at-old": MARKERS_AT_OLD,
    "rename-header": RENAME_HEADER,
  };
  return cell.mutationIds.map((id) => {
    const mutation = byId[id];
    if (!mutation) throw new Error(`unknown mutation ${id}`);
    return mutation;
  });
}

export function moveLookalikeLabManifestDraft() {
  return {
    packId: MOVE_LOOKALIKE_LAB_PACK_ID,
    benchmarkVersion: MOVE_LOOKALIKE_LAB_PACK_ID,
    label: "move-lookalike-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["move-in-file"],
    seeds: { traceSelection: MOVE_LOOKALIKE_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: MOVE_LOOKALIKE_LAB_CELLS.length,
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
    manifestPath: MOVE_LOOKALIKE_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/move-lookalike-dev-v0.1",
    reportsDir: `bench/packs/${MOVE_LOOKALIKE_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${MOVE_LOOKALIKE_LAB_PACK_ID}/provenance`,
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
  const oracle = await oracleGoldBytes(mutated, cell, initialContent);
  if (!cell.pinRelocatedGold) return oracle;

  if (!mutated.includes(FIELDS)) {
    throw new Error(`${cell.id} missing relocated Benchmark.fields bytes`);
  }
  if (oracle === FIELDS) {
    throw new Error(`${cell.id} oracle resolved relocated gold without duplicate Name`);
  }
  return FIELDS;
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
  const finalBytes = await secondCaptureBytes(mutated, cell, initialContent);
  const finalSha = sha256(finalBytes);

  if (cell.id === "door" || cell.id === "decoy") {
    if (!mutated.includes(FIELDS)) {
      throw new Error(`${cell.id} missing relocated Benchmark.fields bytes`);
    }
  }
  if (cell.id === "decoy") {
    const atOldStart = extractRegion(mutated, cell.startLine, cell.startLine + 1);
    if (atOldStart !== LOOKALIKE_FIELDS) {
      throw new Error(`${cell.id} did not retain Name+Ord lookalike at stored start`);
    }
    if (mutated.includes(`${FIELDS}\n${FIELDS}`)) {
      throw new Error(`${cell.id} must not leave a full duplicate at the old slot`);
    }
    if (finalSha !== RELOCATED_FIELDS_SHA) {
      throw new Error(`${cell.id} pinned gold must match relocated fields SHA`);
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
      captureEvent(cell, finalSha),
    ],
  };
}

export async function buildMoveLookalikeLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(`move-lookalike lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`);
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");
  if (sourceText.includes(MARKER_ALPHA) || sourceText.includes(MARKER_BETA)) {
    throw new Error("move-lookalike lab markers already present in parse.go");
  }

  const traces = [];
  for (const cell of MOVE_LOOKALIKE_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: MOVE_LOOKALIKE_LAB_CELLS };
}

export async function generateMoveLookalikeLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildMoveLookalikeLabTraces({ goParse, goCommit });
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
  return units.some(
    (unit) =>
      unit.content.includes(LOOKALIKE_FIELDS) &&
      !unit.content.includes("\tN                 int     // number of iterations"),
  );
}

async function pinRelocatedGoldMap(goldBytesByKey, trackedReads, workspace, cell) {
  if (!cell?.pinRelocatedGold) return goldBytesByKey;
  const current = String(await workspace.read(PARSE_PATH)).replaceAll("\r\n", "\n");
  if (!current.includes(FIELDS)) return goldBytesByKey;

  const read = trackedReads[0];
  const oracleGold = read ? goldBytesByKey[read.key] : null;
  if (oracleGold === FIELDS) return goldBytesByKey;

  const next = { ...goldBytesByKey };
  for (const trackedRead of trackedReads) {
    next[trackedRead.key] = FIELDS;
  }
  return next;
}

export async function runMoveLookalikeTrace(trace, cell, { workspaceRoot } = {}) {
  const baseline = createBaseline("freshctx-region");
  const root = workspaceRoot ?? (await mkdtemp(join(tmpdir(), "freshctx-move-lookalike-")));
  const owned = !workspaceRoot;
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
        const goldBytesByKey = await pinRelocatedGoldMap(
          await buildGoldMap(workspace, event.requiredUnits, trackedReads),
          trackedReads,
          workspace,
          cell,
        );
        const requiredUnits = requiredUnitsFromCapture(event, goldBytesByKey, trackedReads);
        const result = await baseline.capture(event, workspace);
        const priorPayloadText = captures.at(-1)?.payloadText ?? "";
        const metrics = analyzeCapture({
          baseline: "freshctx-region",
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

    return {
      traceName: trace.name,
      captures,
      trackedReads,
    };
  } finally {
    if (owned) await rm(root, { recursive: true, force: true });
  }
}

export async function runMoveLookalikeLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(MOVE_LOOKALIKE_LAB_CELLS.map((cell) => [cell.name, cell]));
  const names = (await readdir(join(root, pack.tracesDir)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const jsonlLines = [];
  for (const name of names) {
    const trace = JSON.parse(await readFile(join(root, pack.tracesDir, name), "utf8"));
    const cell = cellsByName.get(trace.name);
    const result = await runMoveLookalikeTrace(trace, cell);
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
  const resultsRel = join(pack.reportsDir, "results.jsonl");
  await writeFile(
    join(root, resultsRel),
    jsonlLines.length ? `${jsonlLines.join("\n")}\n` : "",
  );
  const resultSetHash = await hashJsonlSet(root, resultsRel.replace(/\\/g, "/"));
  return {
    records: jsonlLines.length,
    summary: `Ran ${jsonlLines.length} move-lookalike lab cell(s).`,
    recordsWritten: jsonlLines.length,
    resultSetHash,
  };
}
