import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const BUDGET_PRESSURE_LAB_PACK_ID = "budget-pressure-dev-v0.1";
export const BUDGET_PRESSURE_LAB_MANIFEST_PATH = "bench/splits/budget-pressure-dev-v0.1.json";
export const BUDGET_PRESSURE_TRACES_DIR = "bench/traces/lab/budget-pressure-dev-v0.1";

export const BUDGET_CHARS = 4000;
export const FILLER_COUNT = 4;
export const FILLER_LINES = 120;

const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const NEOVIM_LOCKED_COMMIT = "2dd6e9d6a2482069cfe9d12a09f761c5713f246b";

/** Holdout-derived cells; gold/oracle unchanged, budgetChars reduced, filler reads added. */
export const BUDGET_PRESSURE_LAB_CELLS = Object.freeze([
  {
    id: "go-append",
    holdoutTrace: "go-tools-append.json",
    name: "go-tools/append/budget-pressure-parse-file-sig",
    family: "append",
    repo: "go-tools",
  },
  {
    id: "go-interior",
    holdoutTrace: "go-tools-interior-edit.json",
    name: "go-tools/interior-edit/budget-pressure-parse-file-body",
    family: "interior-edit",
    repo: "go-tools",
  },
  {
    id: "go-delete",
    holdoutTrace: "go-tools-delete.json",
    name: "go-tools/delete/budget-pressure-holdout-temp",
    family: "delete",
    repo: "go-tools",
  },
  {
    id: "nv-append",
    holdoutTrace: "neovim-append.json",
    name: "neovim/append/budget-pressure-compute-hash-header",
    family: "append",
    repo: "neovim",
  },
  {
    id: "nv-interior",
    holdoutTrace: "neovim-interior-edit.json",
    name: "neovim/interior-edit/budget-pressure-read-trust-fn",
    family: "interior-edit",
    repo: "neovim",
  },
  {
    id: "nv-delete",
    holdoutTrace: "neovim-delete.json",
    name: "neovim/delete/budget-pressure-temp-module",
    family: "delete",
    repo: "neovim",
  },
]);

function fillerPath(index) {
  return `lab/filler/filler-${String(index).padStart(3, "0")}.dat`;
}

export function fillerBytes(index, lines = FILLER_LINES) {
  const prefix = `# freshctx-budget-pressure-filler-${index} `;
  return Array.from({ length: lines }, (_, line) => `${prefix}${line}\n`).join("");
}

function fillerReadEvents() {
  const events = [];
  for (let index = 1; index <= FILLER_COUNT; index += 1) {
    events.push({
      type: "read",
      path: fillerPath(index),
      scope: "file",
    });
  }
  return events;
}

function fillerInitialFiles() {
  const files = {};
  for (let index = 1; index <= FILLER_COUNT; index += 1) {
    files[fillerPath(index)] = fillerBytes(index);
  }
  return files;
}

function withBudgetPressureEvents(events) {
  return events.map((event) => {
    if (event.type !== "capture-request") return event;
    return {
      ...event,
      budgetChars: BUDGET_CHARS,
    };
  });
}

export function buildBudgetPressureTrace(baseTrace, cell) {
  const expectedCommit = cell.repo === "go-tools" ? GO_TOOLS_LOCKED_COMMIT : NEOVIM_LOCKED_COMMIT;
  if (baseTrace.source?.commit !== expectedCommit) {
    throw new Error(`${cell.id}: expected locked ${cell.repo} commit ${expectedCommit}`);
  }

  const baseEvents = baseTrace.events.filter((event) => event.type !== "capture-request" || true);
  const goldEvents = baseEvents.filter((event) => event.type === "read" || event.type === "capture-request"
    || event.type === "replace-exact" || event.type === "delete-file");

  return {
    schemaVersion: 1,
    name: cell.name,
    source: { ...baseTrace.source },
    initialFiles: {
      ...baseTrace.initialFiles,
      ...fillerInitialFiles(),
    },
    events: [
      ...fillerReadEvents(),
      ...withBudgetPressureEvents(goldEvents),
    ],
  };
}

export function budgetPressureLabManifestDraft() {
  return {
    packId: BUDGET_PRESSURE_LAB_PACK_ID,
    benchmarkVersion: BUDGET_PRESSURE_LAB_PACK_ID,
    label: "budget-pressure-dev",
    repositoryIds: ["go-tools", "neovim"],
    mutationFamilies: ["append", "interior-edit", "delete"],
    seeds: { traceSelection: BUDGET_PRESSURE_LAB_PACK_ID },
    samplingRules: {
      method: "enumerated-cells",
      unitsPerFamily: 2,
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
      staleBytesMax: Number.POSITIVE_INFINITY,
      duplicateUnitsMax: Number.POSITIVE_INFINITY,
    },
    exclusions: [],
    reposLockPath: "bench/repos.lock.json",
    manifestPath: BUDGET_PRESSURE_LAB_MANIFEST_PATH,
    tracePackDir: BUDGET_PRESSURE_TRACES_DIR,
    reportsDir: `bench/packs/${BUDGET_PRESSURE_LAB_PACK_ID}/reports`,
    provenanceDir: `bench/packs/${BUDGET_PRESSURE_LAB_PACK_ID}/provenance`,
    status: "candidate",
    resultSetHash: null,
  };
}

export function isBudgetPressureTrace(trace) {
  return String(trace?.name ?? "").includes("budget-pressure")
    || String(trace?.name ?? "").includes("/budget-pressure-");
}

export async function listBudgetPressureTraces(root) {
  const tracesDir = join(root, BUDGET_PRESSURE_TRACES_DIR);
  const names = (await readdir(tracesDir)).filter((name) => name.endsWith(".json")).sort();
  const traces = [];
  for (const name of names) {
    traces.push(JSON.parse(await readFile(join(tracesDir, name), "utf8")));
  }
  return traces;
}

export async function generateBudgetPressureLabTraces({ root, holdoutDir }) {
  const tracesOut = join(root, BUDGET_PRESSURE_TRACES_DIR);
  await mkdir(tracesOut, { recursive: true });

  const traces = [];
  for (const cell of BUDGET_PRESSURE_LAB_CELLS) {
    const baseTrace = JSON.parse(
      await readFile(join(holdoutDir, cell.holdoutTrace), "utf8"),
    );
    const trace = buildBudgetPressureTrace(baseTrace, cell);
    const fileName = `${trace.name.replaceAll("/", "-")}.json`;
    await writeFile(join(tracesOut, fileName), `${JSON.stringify(trace, null, 2)}\n`);
    traces.push(trace);
  }
  return { tracesWritten: traces.length, traces };
}
