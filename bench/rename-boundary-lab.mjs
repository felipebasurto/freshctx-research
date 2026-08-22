import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { hashDirectoryJsonSet, hashJsonlSet } from "./holdout-hashes.mjs";
import { goldBytesForRead } from "./oracle.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";

export const RENAME_BOUNDARY_LAB_PACK_ID = "rename-boundary-dev-v0.1";
export const RENAME_BOUNDARY_LAB_MANIFEST_PATH = "bench/splits/rename-boundary-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const MARKER_ALPHA = "// lab-rename-boundary unique marker alpha-71a1";
const MARKER_BETA = "// lab-rename-boundary unique marker beta-71a1";
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};

const ORIGINAL_FIRST = "func ParseLine(line string) (*Benchmark, error) {";
const RENAMED_FIRST = "func ParseLineRenamed(line string) (*Benchmark, error) {";
const SET_COMMENT = "// Set is a collection of benchmarks from one";
const UNIT_START = 41;
const UNIT_END = 62;

const RENAME_FIRST = {
  expected: ORIGINAL_FIRST,
  replacement: RENAMED_FIRST,
};

export const RENAME_BOUNDARY_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/rename-boundary/parse-line",
    family: "rename-boundary",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "ParseLine.fn",
    task: "review ParseLine function",
    mutationIds: ["rename-first"],
    pinRenamedGold: true,
  },
  {
    id: "decoy",
    name: "go-tools/rename-boundary/parse-line-renamed-lookalike",
    family: "rename-boundary",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "ParseLine.fn",
    task: "review ParseLine function",
    mutationIds: ["rename-first", "insert-lookalike"],
    pinRenamedGold: true,
  },
  {
    id: "codex",
    name: "go-tools/rename-boundary/parse-line-double-rename",
    family: "rename-boundary",
    startLine: UNIT_START,
    endLine: UNIT_END,
    selector: "ParseLine.fn",
    task: "review ParseLine function",
    mutationIds: ["insert-markers", "rename-first"],
    pinRenamedGold: false,
  },
];

function cellMutations(cell, sourceText) {
  const renamedUnit = extractRegion(sourceText, UNIT_START, UNIT_END).replace(
    ORIGINAL_FIRST,
    RENAMED_FIRST,
  );
  const byId = {
    "rename-first": RENAME_FIRST,
    "insert-markers": {
      expected: ORIGINAL_FIRST,
      replacement: `${MARKER_ALPHA}\n${MARKER_BETA}\n${ORIGINAL_FIRST}`,
    },
    "insert-lookalike": {
      expected: SET_COMMENT,
      replacement: `${renamedUnit}\n${SET_COMMENT}`,
    },
  };
  return cell.mutationIds.map((id) => {
    const mutation = byId[id];
    if (!mutation) throw new Error(`unknown mutation ${id}`);
    return mutation;
  });
}

export function renameBoundaryLabManifestDraft() {
  return {
    packId: RENAME_BOUNDARY_LAB_PACK_ID,
    benchmarkVersion: RENAME_BOUNDARY_LAB_PACK_ID,
    label: "rename-boundary-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["rename-boundary"],
    seeds: { traceSelection: RENAME_BOUNDARY_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: RENAME_BOUNDARY_LAB_CELLS.length,
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
    manifestPath: RENAME_BOUNDARY_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/rename-boundary-dev-v0.1",
    reportsDir: `bench/packs/${RENAME_BOUNDARY_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${RENAME_BOUNDARY_LAB_PACK_ID}/provenance`,
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

function renamedFirstCount(content) {
  return content.split("\n").filter((line) => line === RENAMED_FIRST).length;
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
  if (mutated.includes(ORIGINAL_FIRST)) {
    throw new Error("old first still present after rename");
  }

  if (!cell.pinRenamedGold) {
    return oracleGoldBytes(mutated, cell, initialContent);
  }

  // The original first is gone, so unique-first oracle is not the gold source.
  const renamed = extractRegion(mutated, cell.startLine, cell.endLine);
  if (renamed === initialContent) {
    throw new Error("renamed gold equals original bytes");
  }
  if (cell.id === "decoy") {
    if (renamedFirstCount(mutated) < 2) {
      throw new Error("decoy mutated file missing second renamed first line");
    }
    const door = RENAME_BOUNDARY_LAB_CELLS.find((entry) => entry.id === "door");
    const doorGold = extractRegion(
      applyMutations(sourceText, cellMutations(door, sourceText)),
      door.startLine,
      door.endLine,
    );
    if (renamed !== doorGold) {
      throw new Error("decoy gold diverged from door renamed unit");
    }
  }
  return renamed;
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

export async function buildRenameBoundaryLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(`rename-boundary lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`);
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");
  if (sourceText.includes(MARKER_ALPHA) || sourceText.includes(MARKER_BETA)) {
    throw new Error("rename-boundary lab markers already present in parse.go");
  }

  const traces = [];
  for (const cell of RENAME_BOUNDARY_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: RENAME_BOUNDARY_LAB_CELLS };
}

export async function generateRenameBoundaryLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildRenameBoundaryLabTraces({ goParse, goCommit });
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

export async function runRenameBoundaryLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(RENAME_BOUNDARY_LAB_CELLS.map((cell) => [cell.name, cell]));
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
    summary: `Ran ${jsonlLines.length} rename-boundary lab cell(s).`,
    recordsWritten: jsonlLines.length,
    resultSetHash,
  };
}
