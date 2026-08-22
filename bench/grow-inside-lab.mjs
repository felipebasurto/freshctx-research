import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sha256, stableUnitId } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { createBaseline } from "./baselines.mjs";
import { analyzeCapture } from "./metrics.mjs";
import { buildGoldMap, goldBytesForRead, requiredUnitsFromCapture, unitKey } from "./oracle.mjs";
import { Workspace } from "./workspace.mjs";

export const GROW_INSIDE_LAB_PACK_ID = "grow-inside-dev-v0.1";
export const GROW_INSIDE_LAB_MANIFEST_PATH = "bench/splits/grow-inside-dev-v0.1.json";

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const PARSE_PATH = "benchmark/parse/parse.go";
const INSERT_ALPHA = "\t// lab-grow-inside unique block alpha-ed22";
const INSERT_BETA = "\t// lab-grow-inside unique block beta-ed22";
const INSERT_BLOCK = `${INSERT_ALPHA}\n${INSERT_BETA}`;
const BUDGET_CHARS = 12000;
const GO_TOOLS_SOURCE = {
  repository: "https://go.googlesource.com/tools",
  license: "BSD-3-Clause",
};

const BODY_FIRST = "\tName              string  // benchmark name";
const BODY_LAST = "\tOrd               int     // ordinal position within a benchmark run";
const BODY_N = "\tN                 int     // number of iterations";
const PARSE_LINE_GODOC = "// ParseLine extracts a Benchmark from a single line of testing.B";
const TYPE_HEADER = "type Benchmark struct {";

const INSERT_INSIDE = {
  expected: `${BODY_FIRST}\n${BODY_N}`,
  replacement: `${BODY_FIRST}\n${INSERT_BLOCK}\n${BODY_N}`,
};

const TRAILING_DECOY = {
  expected: PARSE_LINE_GODOC,
  replacement: `${BODY_LAST}\n\n${PARSE_LINE_GODOC}`,
};

const RENAME_HEADER = {
  expected: TYPE_HEADER,
  replacement: "type BenchmarkSnapshot struct {",
};

export const GROW_INSIDE_LAB_CELLS = [
  {
    id: "door",
    name: "go-tools/grow-inside/benchmark-fields",
    family: "grow-inside",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutations: [INSERT_INSIDE],
    pinGrownGold: true,
  },
  {
    id: "decoy",
    name: "go-tools/grow-inside/benchmark-fields-trailing-decoy",
    family: "grow-inside",
    startLine: 29,
    endLine: 36,
    selector: "Benchmark.fields",
    task: "review Benchmark fields",
    mutations: [INSERT_INSIDE, TRAILING_DECOY],
    pinGrownGold: true,
  },
  {
    id: "codex",
    name: "go-tools/grow-inside/benchmark-renamed-header",
    family: "grow-inside",
    startLine: 28,
    endLine: 37,
    selector: "Benchmark.type",
    task: "review Benchmark type",
    mutations: [INSERT_INSIDE, RENAME_HEADER],
    pinGrownGold: false,
  },
];

export function growInsideLabManifestDraft() {
  return {
    packId: GROW_INSIDE_LAB_PACK_ID,
    benchmarkVersion: GROW_INSIDE_LAB_PACK_ID,
    label: "grow-inside-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["grow-inside"],
    seeds: { traceSelection: GROW_INSIDE_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: GROW_INSIDE_LAB_CELLS.length,
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
    manifestPath: GROW_INSIDE_LAB_MANIFEST_PATH,
    tracePackDir: "bench/traces/lab/grow-inside-dev-v0.1",
    reportsDir: `bench/packs/${GROW_INSIDE_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${GROW_INSIDE_LAB_PACK_ID}/provenance`,
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

function grownUnitBytes(mutated, first, last) {
  const lines = mutated.split("\n");
  const start = lines.indexOf(first);
  if (start === -1) {
    throw new Error("grown first missing");
  }
  const end = lines.findIndex((line, index) => index > start && line === last);
  if (end === -1) {
    throw new Error("grown last missing");
  }
  return lines.slice(start, end + 1).join("\n");
}

function uniqueFirstCrop(content, first, lineCount) {
  const lines = content.split("\n");
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === first) matches.push(index);
  }
  if (matches.length !== 1) return null;
  return lines.slice(matches[0], matches[0] + lineCount).join("\n");
}

function prefixOfExpectedIsStable(previous, grown, expectedLineCount) {
  if (expectedLineCount <= 1) return false;
  const previousLines = previous.split("\n");
  const grownLines = grown.split("\n");
  const prefixLength = expectedLineCount - 1;
  return previousLines
    .slice(0, prefixLength)
    .every((line, index) => normalizedLine(line) === normalizedLine(grownLines[index] ?? ""));
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

export async function secondCaptureBytes(mutated, cell, initialContent) {
  const oracle = await oracleGoldBytes(mutated, cell, initialContent);
  if (!cell.pinGrownGold) return oracle;

  const grown = grownUnitBytes(mutated, BODY_FIRST, BODY_LAST);
  const lineCount = cell.endLine - cell.startLine + 1;
  const stale = extractRegion(mutated, cell.startLine, cell.endLine);
  const cropped = uniqueFirstCrop(mutated, BODY_FIRST, lineCount);
  const lastCopies = grown.split("\n").filter((line) => line === BODY_LAST).length;

  if (!grown.startsWith(BODY_FIRST) || !grown.endsWith(BODY_LAST)) {
    throw new Error("grown gold lost first or last");
  }
  if (!grown.includes(INSERT_BLOCK)) {
    throw new Error("grown gold missing interior insert");
  }
  if (prefixOfExpectedIsStable(initialContent, grown, lineCount)) {
    throw new Error("grow-inside insert left expected prefix stable");
  }
  if (grown === oracle) {
    throw new Error("grown gold collapsed to oracle");
  }
  if (cropped !== null && grown === cropped) {
    throw new Error("grown gold collapsed to unique-first crop");
  }
  if (grown === stale) {
    throw new Error("grown gold collapsed to stale original line numbers");
  }
  if (lastCopies !== 1) {
    throw new Error("grown gold stretched past the unit last");
  }
  return grown;
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

export async function buildGrowInsideLabTraces({ goParse, goCommit }) {
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(`grow-inside lab requires go-tools ${GO_TOOLS_LOCKED_COMMIT}`);
  }
  const sourceText = String(goParse).replaceAll("\r\n", "\n");
  if (sourceText.includes(INSERT_ALPHA) || sourceText.includes(INSERT_BETA)) {
    throw new Error("grow-inside lab markers already present in parse.go");
  }

  const traces = [];
  for (const cell of GROW_INSIDE_LAB_CELLS) {
    traces.push(await buildCellTrace(cell, sourceText, goCommit));
  }

  const byName = new Map(traces.map((trace) => [trace.name, trace]));
  const doorSha = byName.get("go-tools/grow-inside/benchmark-fields")
    .events.filter((event) => event.type === "capture-request").at(-1).requiredUnits[0].sha256;
  const decoySha = byName.get("go-tools/grow-inside/benchmark-fields-trailing-decoy")
    .events.filter((event) => event.type === "capture-request").at(-1).requiredUnits[0].sha256;
  if (doorSha !== decoySha) {
    throw new Error("door and decoy grown gold diverged");
  }

  return { traces, cells: GROW_INSIDE_LAB_CELLS };
}

export async function generateGrowInsideLabTraces({ root, pack }) {
  const lock = JSON.parse(await readFile(join(root, "bench/repos.lock.json"), "utf8"));
  const goCommit = lock.repositories?.["go-tools"]?.commit;
  if (goCommit !== GO_TOOLS_LOCKED_COMMIT) {
    throw new Error(
      `go-tools lock commit must be ${GO_TOOLS_LOCKED_COMMIT}, found ${goCommit ?? "missing"}`,
    );
  }
  const goParse = await readFile(join(root, "bench/repos/go-tools", PARSE_PATH), "utf8");
  const { traces } = await buildGrowInsideLabTraces({ goParse, goCommit });
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

async function pinGrownGoldMap(goldBytesByKey, trackedReads, workspace, cell) {
  if (!cell?.pinGrownGold) return goldBytesByKey;
  const current = String(await workspace.read(PARSE_PATH)).replaceAll("\r\n", "\n");
  if (!current.includes(INSERT_ALPHA)) return goldBytesByKey;
  const grown = grownUnitBytes(current, BODY_FIRST, BODY_LAST);
  const next = { ...goldBytesByKey };
  for (const read of trackedReads) {
    next[read.key] = grown;
  }
  return next;
}

export async function runGrowInsideTrace(trace, cell, { workspaceRoot } = {}) {
  const baseline = createBaseline("freshctx-region");
  const root = workspaceRoot ?? await mkdtemp(join(tmpdir(), "freshctx-grow-inside-"));
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
        const goldBytesByKey = await pinGrownGoldMap(
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

export async function runGrowInsideLab({ root, pack, implementationCommitSha }) {
  const cellsByName = new Map(GROW_INSIDE_LAB_CELLS.map((cell) => [cell.name, cell]));
  const names = (await readdir(join(root, pack.tracesDir)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const jsonlLines = [];
  for (const name of names) {
    const trace = JSON.parse(await readFile(join(root, pack.tracesDir, name), "utf8"));
    const cell = cellsByName.get(trace.name);
    const result = await runGrowInsideTrace(trace, cell);
    const capture = result.captures.at(-1);
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
    summary: `Ran ${jsonlLines.length} grow-inside lab cell(s).`,
    recordsWritten: jsonlLines.length,
  };
}
