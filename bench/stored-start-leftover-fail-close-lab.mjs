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

export const STORED_START_LEFTOVER_FAIL_CLOSE_LAB_PACK_ID =
  "stored-start-leftover-fail-close-dev-v0.1";
export const STORED_START_LEFTOVER_FAIL_CLOSE_LAB_MANIFEST_PATH =
  "bench/splits/stored-start-leftover-fail-close-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};

const BODY_FIRST = "\tName              string  // benchmark name";
const BODY_N = "\tN                 int     // number of iterations";
const BODY_LAST = "\tOrd               int     // ordinal position within a benchmark run";
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
const LEFTOVER_FIELDS = `${BODY_FIRST}\n${BODY_LAST}`;
const PARSELINE_COMMENT = "// ParseLine extracts a Benchmark from a single line of testing.B";

const INTERIOR_DELETE = {
  expected: `${FIELDS}\n`,
  replacement: `${LEFTOVER_FIELDS}\n`,
};

const PREFIX_SHRINK = {
  expected: `${FIELDS}\n`,
  replacement: `${PREFIX_FIELDS}\n`,
};

const PLANT_ORIGINAL = {
  expected: PARSELINE_COMMENT,
  replacement: `${FIELDS}\n\n${PARSELINE_COMMENT}`,
};

const DISPLACED_LOOKALIKE = {
  expected: PARSELINE_COMMENT,
  replacement: `${BODY_FIRST}\n${BODY_LAST}\n\n${PARSELINE_COMMENT}`,
};

export const STORED_START_LEFTOVER_FAIL_CLOSE_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/stored-start-leftover/benchmark-fields-interior-delete",
    family: "stored-start-leftover",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutations: [INTERIOR_DELETE],
    absenceGold: true,
  },
  {
    id: "decoy",
    name: "go-tools/stored-start-leftover/benchmark-fields-prefix-shrink",
    family: "stored-start-leftover",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutations: [PREFIX_SHRINK, PLANT_ORIGINAL],
    absenceGold: false,
    pinPrefixGold: true,
  },
  {
    id: "codex",
    name: "go-tools/stored-start-leftover/benchmark-fields-displaced-lookalike",
    family: "stored-start-leftover",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutations: [
      { expected: `${FIELDS}\n`, replacement: "" },
      DISPLACED_LOOKALIKE,
    ],
    absenceGold: true,
  },
];

export function storedStartLeftoverFailCloseLabManifestDraft() {
  return {
    packId: STORED_START_LEFTOVER_FAIL_CLOSE_LAB_PACK_ID,
    benchmarkVersion: STORED_START_LEFTOVER_FAIL_CLOSE_LAB_PACK_ID,
    label: "stored-start-leftover-fail-close-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["stored-start-leftover"],
    seeds: { traceSelection: STORED_START_LEFTOVER_FAIL_CLOSE_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: STORED_START_LEFTOVER_FAIL_CLOSE_LAB_CELLS.length,
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
    manifestPath: STORED_START_LEFTOVER_FAIL_CLOSE_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/stored-start-leftover-fail-close-dev-v0.1",
    reportsDir: `bench/packs/${STORED_START_LEFTOVER_FAIL_CLOSE_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${STORED_START_LEFTOVER_FAIL_CLOSE_LAB_PACK_ID}/provenance`,
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

function prefixShrinkBytes(mutated, startLine) {
  const lines = mutated.split("\n");
  const start = startLine - 1;
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
  if (cell.absenceGold) return null;
  if (!cell.pinPrefixGold) return oracleGoldBytes(mutated, cell, initialContent);

  const prefix = prefixShrinkBytes(mutated, cell.startLine);
  if (prefix !== PREFIX_FIELDS) {
    throw new Error(`${cell.id} did not retain prefix shrink at stored start`);
  }
  const oracle = await oracleGoldBytes(mutated, cell, initialContent);
  if (prefix === oracle) {
    throw new Error(`${cell.id} prefix shrink gold collapsed to line-number oracle`);
  }
  return prefix;
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

async function buildCellTrace(cell, sourceText, goCommit) {
  const initialContent = extractRegion(sourceText, cell.startLine, cell.endLine);
  if (initialContent !== FIELDS) {
    throw new Error(`${cell.id} does not match locked Benchmark.fields bytes`);
  }
  const firstSha = sha256(await oracleGoldBytes(sourceText, cell, initialContent));
  const mutated = applyMutations(sourceText, cell.mutations);
  const finalBytes = cell.absenceGold ? null : await secondCaptureBytes(mutated, cell, initialContent);
  const finalSha = finalBytes === null ? null : sha256(finalBytes);

  if (cell.id === "door" && !mutated.includes(LEFTOVER_FIELDS)) {
    throw new Error(`${cell.id} did not retain Name+Ord at stored start`);
  }
  if (cell.id === "door" && mutated.includes(FIELDS)) {
    throw new Error(`${cell.id} still includes full original fields block`);
  }
  if (cell.id === "decoy") {
    if (prefixShrinkBytes(mutated, cell.startLine) !== PREFIX_FIELDS) {
      throw new Error(`${cell.id} did not retain prefix shrink at stored start`);
    }
    if (!mutated.includes(FIELDS)) {
      throw new Error(`${cell.id} missing planted exact copy for prefix-shrink decoy`);
    }
  }
  if (cell.id === "codex" && mutated.includes(FIELDS)) {
    throw new Error(`${cell.id} restored deleted unit bytes`);
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
      firstCaptureEvent(cell, firstSha),
      ...cell.mutations.map((mutation) => ({
        type: "replace-exact",
        path: PARSE_PATH,
        expected: mutation.expected,
        replacement: mutation.replacement,
      })),
      finalCaptureEvent(cell, finalSha),
    ],
  };
}

export async function buildStoredStartLeftoverFailCloseLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `stored-start-leftover fail-close lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`,
    );
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");

  const traces = [];
  for (const cell of STORED_START_LEFTOVER_FAIL_CLOSE_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: STORED_START_LEFTOVER_FAIL_CLOSE_LAB_CELLS };
}

export async function generateStoredStartLeftoverFailCloseLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildStoredStartLeftoverFailCloseLabTraces({ goParse, goCommit });
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
  const lookalike = LEFTOVER_FIELDS;
  return units.some((unit) => unit.content.includes(lookalike) || unit.content.includes(FIELDS));
}

async function pinPrefixGoldMap(goldBytesByKey, trackedReads, workspace, cell, event) {
  if (!cell?.pinPrefixGold) return goldBytesByKey;
  const read = trackedReads[0];
  const declaredSha = event.requiredUnits?.[0]?.sha256;
  const originalSha = sha256(read?.initialContent ?? "");
  const postMutationCapture = Boolean(declaredSha && declaredSha !== originalSha);
  if (!postMutationCapture) return goldBytesByKey;

  const current = String(await workspace.read(PARSE_PATH)).replaceAll("\r\n", "\n");
  const prefix = prefixShrinkBytes(current, cell.startLine);
  if (prefix !== PREFIX_FIELDS) {
    throw new Error(`${cell.id} prefix shrink gold drifted from stored start`);
  }
  const next = { ...goldBytesByKey };
  for (const readEntry of trackedReads) {
    next[readEntry.key] = prefix;
  }
  return next;
}

export async function runStoredStartLeftoverFailCloseTrace(trace, cell, { workspaceRoot } = {}) {
  const baseline = createBaseline("freshctx-region");
  const root = workspaceRoot ?? (await mkdtemp(join(tmpdir(), "freshctx-stored-start-leftover-")));
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
        const goldBytesByKey = await pinPrefixGoldMap(
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

export async function runStoredStartLeftoverFailCloseLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(
    STORED_START_LEFTOVER_FAIL_CLOSE_LAB_CELLS.map((cell) => [cell.name, cell]),
  );
  const names = (await readdir(join(root, pack.tracesDir)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const jsonlLines = [];
  for (const name of names) {
    const trace = JSON.parse(await readFile(join(root, pack.tracesDir, name), "utf8"));
    const cell = cellsByName.get(trace.name);
    const result = await runStoredStartLeftoverFailCloseTrace(trace, cell);
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
    summary: `Ran ${jsonlLines.length} stored-start-leftover fail-close lab cell(s).`,
    recordsWritten: jsonlLines.length,
    resultSetHash,
  };
}
