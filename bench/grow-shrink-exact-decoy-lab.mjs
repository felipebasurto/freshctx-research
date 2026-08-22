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

export const GROW_SHRINK_EXACT_DECOY_LAB_PACK_ID = "grow-shrink-exact-decoy-dev-v0.1";
export const GROW_SHRINK_EXACT_DECOY_LAB_MANIFEST_PATH =
  "bench/splits/grow-shrink-exact-decoy-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const INSERT_ALPHA = "\t// lab-grow-shrink-exact unique block alpha-c2af";
const INSERT_BETA = "\t// lab-grow-shrink-exact unique block beta-c2af";
const INSERT_BLOCK = `${INSERT_ALPHA}\n${INSERT_BETA}`;
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};

const UNIT_START = 29;
const UNIT_END = 36;
const BODY_FIRST = "\tName              string  // benchmark name";
const BODY_LAST = "\tOrd               int     // ordinal position within a benchmark run";
const BODY_N = "\tN                 int     // number of iterations";
const FIELDS = [
  BODY_FIRST,
  BODY_N,
  "\tNsPerOp           float64 // nanoseconds per iteration",
  "\tAllocedBytesPerOp uint64  // bytes allocated per iteration",
  "\tAllocsPerOp       uint64  // allocs per iteration",
  "\tMBPerS            float64 // MB processed per second",
  "\tMeasured          int     // which measurements were recorded",
  BODY_LAST,
].join("\n");
const PREFIX_FIELDS = FIELDS.split("\n").slice(0, 6).join("\n");
const SET_COMMENT = "// Set is a collection of benchmarks from one";
const EMPTY_STRUCT = "type Benchmark struct {\n}";
const LOOKALIKE_FIELDS = `${BODY_FIRST}\n${BODY_LAST}`;
const RELOCATED_FIELDS_SHA =
  "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";

const INSERT_INSIDE = {
  expected: `${BODY_FIRST}\n${BODY_N}`,
  replacement: `${BODY_FIRST}\n${INSERT_BLOCK}\n${BODY_N}`,
};

const PLANT_ORIGINAL = {
  expected: SET_COMMENT,
  replacement: `${FIELDS}\n\n${SET_COMMENT}`,
};

const PREFIX_SHRINK = {
  expected: `${FIELDS}\n`,
  replacement: `${PREFIX_FIELDS}\n`,
};

const MOVE_OUT = {
  expected: `${FIELDS}\n`,
  replacement: "",
};

const MOVE_IN = {
  expected: SET_COMMENT,
  replacement: `${FIELDS}\n\n${SET_COMMENT}`,
};

const LOOKALIKE_AT_OLD = {
  expected: EMPTY_STRUCT,
  replacement: `type Benchmark struct {\n${LOOKALIKE_FIELDS}\n}`,
};

export const GROW_SHRINK_EXACT_DECOY_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/grow-shrink-exact/benchmark-fields-grow-decoy",
    family: "grow-shrink-exact",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["insert-inside", "plant-original"],
    pinMode: "grown",
  },
  {
    id: "decoy",
    name: "go-tools/grow-shrink-exact/benchmark-fields-shrink-decoy",
    family: "grow-shrink-exact",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["prefix-shrink", "plant-original"],
    pinMode: "prefix-shrink",
  },
  {
    id: "codex",
    name: "go-tools/grow-shrink-exact/benchmark-fields-lookalike-relocated",
    family: "grow-shrink-exact",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutationIds: ["move-out", "move-in", "lookalike-at-old"],
    pinMode: "relocated-decoy",
  },
];

function cellMutations(cell) {
  const byId = {
    "insert-inside": INSERT_INSIDE,
    "plant-original": PLANT_ORIGINAL,
    "prefix-shrink": PREFIX_SHRINK,
    "move-out": MOVE_OUT,
    "move-in": MOVE_IN,
    "lookalike-at-old": LOOKALIKE_AT_OLD,
  };
  return cell.mutationIds.map((id) => {
    const mutation = byId[id];
    if (!mutation) throw new Error(`unknown mutation ${id}`);
    return mutation;
  });
}

export function growShrinkExactDecoyLabManifestDraft() {
  return {
    packId: GROW_SHRINK_EXACT_DECOY_LAB_PACK_ID,
    benchmarkVersion: GROW_SHRINK_EXACT_DECOY_LAB_PACK_ID,
    label: "grow-shrink-exact-decoy-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["grow-shrink-exact"],
    seeds: { traceSelection: GROW_SHRINK_EXACT_DECOY_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: GROW_SHRINK_EXACT_DECOY_LAB_CELLS.length,
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
    manifestPath: GROW_SHRINK_EXACT_DECOY_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/grow-shrink-exact-decoy-dev-v0.1",
    reportsDir: `bench/packs/${GROW_SHRINK_EXACT_DECOY_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${GROW_SHRINK_EXACT_DECOY_LAB_PACK_ID}/provenance`,
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

function normalizedLine(value) {
  return value.trim().replace(/\s+/gu, " ");
}

function grownUnitBytes(mutated) {
  const lines = mutated.split("\n");
  const start = lines.indexOf(BODY_FIRST);
  if (start === -1) throw new Error("grown first missing");
  const end = lines.findIndex((line, index) => index > start && line === BODY_LAST);
  if (end === -1) throw new Error("grown last missing");
  return lines.slice(start, end + 1).join("\n");
}

function prefixShrinkBytes(mutated) {
  const lines = mutated.split("\n");
  const start = lines.indexOf(BODY_FIRST);
  if (start === -1) throw new Error("prefix shrink first missing");
  return lines.slice(start, start + PREFIX_FIELDS.split("\n").length).join("\n");
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
  if (cell.pinMode === "relocated-decoy") {
    if (!mutated.includes(FIELDS)) {
      throw new Error(`${cell.id} missing relocated Benchmark.fields bytes`);
    }
    return RELOCATED_FIELDS_SHA;
  }
  if (cell.pinMode === "grown") {
    const grown = grownUnitBytes(mutated);
    if (!grown.includes(INSERT_BLOCK)) throw new Error("grown gold missing insert");
    return sha256(grown);
  }
  if (cell.pinMode === "prefix-shrink") {
    const prefix = prefixShrinkBytes(mutated);
    if (prefix === initialContent) throw new Error("prefix shrink gold collapsed to original");
    return sha256(prefix);
  }
  return sha256(await oracleGoldBytes(mutated, cell, initialContent));
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
  const mutations = cellMutations(cell);
  const mutated = applyMutations(sourceText, mutations);
  const secondSha = await secondCaptureBytes(mutated, cell, initialContent);

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

export async function buildGrowShrinkExactDecoyLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `grow-shrink-exact-decoy lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`,
    );
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");
  if (sourceText.includes(INSERT_ALPHA) || sourceText.includes(INSERT_BETA)) {
    throw new Error("grow-shrink-exact-decoy lab markers already present in parse.go");
  }

  const traces = [];
  for (const cell of GROW_SHRINK_EXACT_DECOY_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: GROW_SHRINK_EXACT_DECOY_LAB_CELLS };
}

export async function generateGrowShrinkExactDecoyLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildGrowShrinkExactDecoyLabTraces({ goParse, goCommit });
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

async function pinGoldMap(goldBytesByKey, trackedReads, workspace, cell, event) {
  const current = String(await workspace.read(PARSE_PATH)).replaceAll("\r\n", "\n");
  const read = trackedReads[0];
  const declaredSha = event.requiredUnits?.[0]?.sha256;
  const originalSha = sha256(read?.initialContent ?? "");
  const postMutationCapture = Boolean(declaredSha && declaredSha !== originalSha);

  if (cell.pinMode === "relocated-decoy") {
    if (!current.includes(FIELDS)) return goldBytesByKey;
    const oracleGold = read ? goldBytesByKey[read.key] : null;
    if (oracleGold === FIELDS) return goldBytesByKey;
    const next = { ...goldBytesByKey };
    for (const trackedRead of trackedReads) {
      next[trackedRead.key] = FIELDS;
    }
    return next;
  }

  if (!postMutationCapture) return goldBytesByKey;

  let pinned = null;
  if (cell.pinMode === "grown") {
    if (!current.includes(INSERT_BLOCK)) return goldBytesByKey;
    pinned = grownUnitBytes(current);
  }
  if (cell.pinMode === "prefix-shrink") {
    pinned = prefixShrinkBytes(current);
  }
  if (!pinned) return goldBytesByKey;

  const next = { ...goldBytesByKey };
  for (const read of trackedReads) {
    next[read.key] = pinned;
  }
  return next;
}

export async function runGrowShrinkExactDecoyTrace(trace, baselineName = "freshctx-region") {
  const cell = GROW_SHRINK_EXACT_DECOY_LAB_CELLS.find((entry) => entry.name === trace.name);
  const baseline = createBaseline(baselineName);
  const root = await mkdtemp(join(tmpdir(), "freshctx-grow-shrink-trace-"));
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
        const goldBytesByKey = await pinGoldMap(
          await buildGoldMap(workspace, event.requiredUnits, trackedReads),
          trackedReads,
          workspace,
          cell,
          event,
        );
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

export async function runGrowShrinkExactDecoyLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(
    GROW_SHRINK_EXACT_DECOY_LAB_CELLS.map((cell) => [cell.name, cell]),
  );
  const names = (await readdir(join(root, pack.tracesDir)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const jsonlLines = [];
  for (const name of names) {
    const trace = JSON.parse(await readFile(join(root, pack.tracesDir, name), "utf8"));
    const cell = cellsByName.get(trace.name);
    const result = await runGrowShrinkExactDecoyTrace(trace, "freshctx-region");
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
    summary: `Ran ${jsonlLines.length} grow-shrink-exact-decoy lab cell(s).`,
    recordsWritten: jsonlLines.length,
    resultSetHash,
  };
}
