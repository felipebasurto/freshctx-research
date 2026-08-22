import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { hashDirectoryJsonSet, hashJsonlSet } from "./holdout-hashes.mjs";
import { goldBytesForRead } from "./oracle.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";

export const DELETE_UNIT_FAIL_CLOSE_LAB_PACK_ID = "delete-unit-fail-close-dev-v0.1";
export const DELETE_UNIT_FAIL_CLOSE_LAB_MANIFEST_PATH =
  "bench/splits/delete-unit-fail-close-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};

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
const SHRUNK_FIELDS = `${BODY_FIRST}\n${BODY_LAST}`;

const DELETE_FIELDS = {
  expected: `${FIELDS}\n`,
  replacement: "",
};

const LOOKALIKE_DECOY = {
  expected: "// ParseLine extracts a Benchmark from a single line of testing.B",
  replacement: `${BODY_FIRST}\n${BODY_LAST}\n\n// ParseLine extracts a Benchmark from a single line of testing.B`,
};

const IN_PLACE_SHRINK = {
  expected: `${FIELDS}\n`,
  replacement: `${SHRUNK_FIELDS}\n`,
};

export const DELETE_UNIT_FAIL_CLOSE_LAB_CELLS = [
  {
    id: "decoy",
    name: "go-tools/delete-unit-fail-close/benchmark-fields-lookalike-decoy",
    family: "delete-unit",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutations: [DELETE_FIELDS, LOOKALIKE_DECOY],
    absenceGold: true,
  },
  {
    id: "shrink",
    name: "go-tools/delete-unit-fail-close/benchmark-fields-in-place-shrink",
    family: "delete-unit",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutations: [IN_PLACE_SHRINK],
    absenceGold: false,
  },
];

export function deleteUnitFailCloseLabManifestDraft() {
  return {
    packId: DELETE_UNIT_FAIL_CLOSE_LAB_PACK_ID,
    benchmarkVersion: DELETE_UNIT_FAIL_CLOSE_LAB_PACK_ID,
    label: "delete-unit-fail-close-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["delete-unit"],
    seeds: { traceSelection: DELETE_UNIT_FAIL_CLOSE_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: DELETE_UNIT_FAIL_CLOSE_LAB_CELLS.length,
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
    manifestPath: DELETE_UNIT_FAIL_CLOSE_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/delete-unit-fail-close-dev-v0.1",
    reportsDir: `bench/packs/${DELETE_UNIT_FAIL_CLOSE_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${DELETE_UNIT_FAIL_CLOSE_LAB_PACK_ID}/provenance`,
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
  const finalSha = cell.absenceGold
    ? null
    : sha256(await oracleGoldBytes(mutated, cell, initialContent));

  if (cell.absenceGold && mutated.includes(FIELDS)) {
    throw new Error(`${cell.id} restored deleted unit bytes`);
  }
  if (!cell.absenceGold && !mutated.includes(SHRUNK_FIELDS)) {
    throw new Error(`${cell.id} did not retain shrunk Name+Ord at original location`);
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

export async function buildDeleteUnitFailCloseLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(`delete-unit fail-close lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`);
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");

  const traces = [];
  for (const cell of DELETE_UNIT_FAIL_CLOSE_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: DELETE_UNIT_FAIL_CLOSE_LAB_CELLS };
}

export async function generateDeleteUnitFailCloseLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildDeleteUnitFailCloseLabTraces({ goParse, goCommit });
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
  return units.some((unit) => unit.content.includes(lookalike) || unit.content.includes(FIELDS));
}

export async function runDeleteUnitFailCloseLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(DELETE_UNIT_FAIL_CLOSE_LAB_CELLS.map((cell) => [cell.name, cell]));
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
  const resultsRel = join(pack.reportsDir, "results.jsonl");
  await writeFile(
    join(root, resultsRel),
    jsonlLines.length ? `${jsonlLines.join("\n")}\n` : "",
  );
  const resultSetHash = await hashJsonlSet(root, resultsRel.replace(/\\/g, "/"));
  return {
    records: jsonlLines.length,
    summary: `Ran ${jsonlLines.length} delete-unit fail-close lab cell(s).`,
    recordsWritten: jsonlLines.length,
    resultSetHash,
  };
}
