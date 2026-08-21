import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { goldBytesForRead } from "./oracle.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";

export const INSERT_BEFORE_TIE_LAB_PACK_ID = "insert-before-tie-dev-v0.1";
export const INSERT_BEFORE_TIE_LAB_MANIFEST_PATH =
  "bench/splits/insert-before-tie-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const UTIL_PATH = "go/buildutil/util.go";
const MARKER_ALPHA = "// lab-tie unique marker alpha-e30e";
const MARKER_BETA = "// lab-tie unique marker beta-e30e";
const JOIN_PATH_COMMENT = "// components are joined using JoinPath; dir must be absolute.";
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};

const COMPETING_PAIR = [
  "\tif !IsAbsPath(ctxt, file) {",
  "\t\t// lab-tie competing interior a",
  "\t\t// lab-tie competing interior b",
  "\t\t// lab-tie competing interior c",
  "\t\t// lab-tie competing interior d",
  "\t\t// lab-tie competing interior e",
  "\t}",
].join("\n");

const INSERT_COMPETING_PAIR = {
  expected: JOIN_PATH_COMMENT,
  replacement: `${COMPETING_PAIR}\n${JOIN_PATH_COMMENT}`,
};

const INTERIOR_JOINPATH = {
  expected: "\t\tfile = JoinPath(ctxt, dir, file)",
  replacement: "\t\tfile = JoinPath(ctxt, dir, file) // lab-tie-interior-e30e",
};

const TRAILING_DECOY = {
  expected: "func sameFile(x, y string) bool {",
  replacement:
    "func labTieDecoy() {\n\t// unrelated decoy closer follows\n\t}\n\nfunc sameFile(x, y string) bool {",
};

export const INSERT_BEFORE_TIE_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/insert-before/parse-file-body-tie",
    family: "insert-before",
    startLine: 32,
    endLine: 38,
    selector: "ParseFile.body",
    task: "review ParseFile body",
    mutations: [INSERT_COMPETING_PAIR, INTERIOR_JOINPATH],
  },
  {
    id: "decoy",
    name: "go-tools/insert-before/parse-file-body-tie-trailing-decoy",
    family: "insert-before",
    startLine: 32,
    endLine: 38,
    selector: "ParseFile.body",
    task: "review ParseFile body",
    mutations: [INSERT_COMPETING_PAIR, INTERIOR_JOINPATH, TRAILING_DECOY],
  },
  {
    id: "codex",
    name: "go-tools/insert-before/parse-file-renamed-header-tie",
    family: "insert-before",
    startLine: 31,
    endLine: 44,
    selector: "ParseFile.fn",
    task: "review ParseFile function",
    mutations: [
      {
        expected: "func ParseFile(",
        replacement: `${MARKER_ALPHA}\n${MARKER_BETA}\nfunc ParseFile(`,
      },
      {
        expected: "func ParseFile(",
        replacement: "func ParseFileSnapshot(",
      },
    ],
  },
];

export function insertBeforeTieLabManifestDraft() {
  return {
    packId: INSERT_BEFORE_TIE_LAB_PACK_ID,
    benchmarkVersion: INSERT_BEFORE_TIE_LAB_PACK_ID,
    label: "insert-before-tie-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["insert-before"],
    seeds: { traceSelection: INSERT_BEFORE_TIE_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: INSERT_BEFORE_TIE_LAB_CELLS.length,
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
    manifestPath: INSERT_BEFORE_TIE_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/insert-before-tie-dev-v0.1",
    reportsDir: `bench/packs/${INSERT_BEFORE_TIE_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${INSERT_BEFORE_TIE_LAB_PACK_ID}/provenance`,
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

async function oracleGoldSha(content, cell, initialContent) {
  const gold = await goldBytesForRead(contentWorkspace(content), {
    path: UTIL_PATH,
    scope: "region",
    startLine: cell.startLine,
    endLine: cell.endLine,
    selector: cell.selector,
    initialContent,
  });
  return sha256(gold);
}

function captureEvent(cell, digest) {
  return {
    type: "capture-request",
    task: cell.task,
    budgetChars: BUDGET_CHARS,
    requiredUnits: [
      {
        path: UTIL_PATH,
        selector: cell.selector,
        sha256: digest,
      },
    ],
  };
}

async function buildCellTrace(cell, sourceText, goCommit) {
  const initialContent = extractRegion(sourceText, cell.startLine, cell.endLine);
  const firstSha = await oracleGoldSha(sourceText, cell, initialContent);
  const mutated = applyMutations(sourceText, cell.mutations);
  const secondSha = await oracleGoldSha(mutated, cell, initialContent);

  return {
    schemaVersion: 1,
    name: cell.name,
    source: {
      ...GO_TOOLS_SOURCE,
      commit: goCommit,
    },
    initialFiles: {
      [UTIL_PATH]: sourceText,
    },
    events: [
      {
        type: "read",
        path: UTIL_PATH,
        scope: "region",
        startLine: cell.startLine,
        endLine: cell.endLine,
        selector: cell.selector,
      },
      captureEvent(cell, firstSha),
      ...cell.mutations.map((mutation) => ({
        type: "replace-exact",
        path: UTIL_PATH,
        expected: mutation.expected,
        replacement: mutation.replacement,
      })),
      captureEvent(cell, secondSha),
    ],
  };
}

export async function buildInsertBeforeTieLabTraces({ goUtil, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(`insert-before-tie lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`);
  }
  const sourceText = String(goUtil).replaceAll("\r\n", "\n");
  if (sourceText.includes(MARKER_ALPHA) || sourceText.includes(MARKER_BETA)) {
    throw new Error("insert-before-tie lab markers already present in util.go");
  }

  const traces = [];
  for (const cell of INSERT_BEFORE_TIE_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }
  return { traces, cells: INSERT_BEFORE_TIE_LAB_CELLS };
}

export async function generateInsertBeforeTieLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goUtil = await readFile(join(root, "bench/repos/go-tools", UTIL_PATH), "utf8");
  const { traces } = await buildInsertBeforeTieLabTraces({ goUtil, goCommit });
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

export async function runInsertBeforeTieLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(INSERT_BEFORE_TIE_LAB_CELLS.map((cell) => [cell.name, cell]));
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
    summary: `Ran ${jsonlLines.length} insert-before-tie lab cell(s).`,
    recordsWritten: jsonlLines.length,
  };
}
