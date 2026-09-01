/** Shared constants for the Pi-only TypeScript measure pack. */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packDir = dirname(fileURLToPath(import.meta.url));

export const PACK_ROOT = new URL(".", import.meta.url);

/** Pi alone, FreshCtx without semanticEngine, FreshCtx with semanticEngine (same prompts). */
export const ARMS = ["nothing", "freshctx-no-ts", "freshctx-ts"];

export const TARGET_FILE = "src/settlement.ts";
export const TARGET_SYMBOL = "settleDailyLedger";
export const SIBLING_SYMBOL = "settleWeeklyLedger";
export const HOST_READ_SCOPE = "symbol";
export const FRESHCTX_CWD_ENV = "FRESHCTX_CWD";
export const HERMES_TRIAL_WORKSPACE_ENV = "HERMES_TRIAL_WORKSPACE";
export const PI_TRIAL_WORKSPACE_ENV = "PI_TRIAL_WORKSPACE";

export const MARKER_V0 = "ST0";
export const MARKER_V1 = "ST1";
export const SIBLING_MARKER = "SW0";
export const LOOKALIKE_MARKER = "CT0";
export const LOOKALIKE_SYMBOL = "computeDailyLedgerTotal";

export const TARGET_FN = "settleDailyLedger";

export const PROMPT_T2 = `No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_SETTLE dentro de ${TARGET_FN} en ${TARGET_FILE}?
Responde una sola línea: SETTLE=...`;

export const PROMPT_T1 = `Lee el símbolo ${TARGET_SYMBOL} en ${TARGET_FILE} con scope=symbol y selector ${TARGET_SYMBOL}.

No edites. No crees archivos. Responde solo:

SETTLE=...`;

/** Host read tool args the harness expects Pi/Hermes to pass through to FreshCtx. */
export function resolveHostReadWorkspace(env = process.env) {
  const candidates = [
    env[FRESHCTX_CWD_ENV],
    env[HERMES_TRIAL_WORKSPACE_ENV],
    env[PI_TRIAL_WORKSPACE_ENV],
  ].filter((dir) => typeof dir === "string" && dir.length > 0);
  for (const dir of candidates) {
    if (existsSync(join(dir, TARGET_FILE))) return dir;
  }
  return null;
}

export function hostReadToolArgs({ workspace, env = process.env } = {}) {
  const root = workspace ?? resolveHostReadWorkspace(env);
  return {
    path: root ? join(root, TARGET_FILE) : TARGET_FILE,
    scope: "symbol",
    selector: TARGET_SYMBOL,
  };
}

/** Hermes dest-root search of the missing settlement fixture. Not a t1 match. */
export const DEST_ROOT_SEARCH_TOOLS = new Set(["search_files"]);

/** Multi-turn `.work/<host>/<arm>/` or two-turn `.work/<arm>/` settlement fixture. */
const WORK_FIXTURE_SETTLEMENT = /\/\.work\/(?:(?:pi|hermes)\/)?(?:nothing|freshctx-no-ts|freshctx-ts)\/src\/settlement\.ts$/u;

export function isWorkFixtureSettlementPath(path) {
  return typeof path === "string" && WORK_FIXTURE_SETTLEMENT.test(path);
}

export function searchPathFromArgs(args = {}) {
  return args.path ?? args.directory ?? args.target_directory ?? args.root ?? args.file ?? null;
}

export function isDestRootSettlementPath(path, { workspace, destRoot } = {}) {
  if (typeof path !== "string" || path.length === 0) return false;
  if (isWorkFixtureSettlementPath(path)) return false;
  const fixture = workspace ? join(workspace, TARGET_FILE) : null;
  if (fixture && path === fixture) return false;
  if (workspace && path === TARGET_FILE) return true;
  if (destRoot && path === join(destRoot, TARGET_FILE)) return true;
  return Boolean(workspace && path.endsWith(`/${TARGET_FILE}`) && path !== fixture);
}

export function isDestRootSettlementSearch(tool, { workspace, destRoot } = {}) {
  if (!tool || !DEST_ROOT_SEARCH_TOOLS.has(tool.toolName)) return false;
  const args = tool.args ?? tool.input ?? {};
  return isDestRootSettlementPath(searchPathFromArgs(args), { workspace, destRoot });
}

export const CELLS = [
  { id: "t1-read", turn: 1, mutate: null, prompt: PROMPT_T1 },
  { id: "t2-settle", turn: 2, mutate: "flip-settle", prompt: PROMPT_T2 },
];

export function promptForCell(cell) {
  return cell.prompt;
}

export function resolveRepoRoot() {
  let dir = packDir;
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, "adapters/pi/extension.ts"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("could not resolve FreshCtx repo root from docs/lab/pi-trial-ts");
}

export function freshCtxExtensionPath(repoRoot = resolveRepoRoot()) {
  return join(repoRoot, "adapters/pi/extension.ts");
}

export function freshCtxExtensionForArm(arm, repoRoot = resolveRepoRoot()) {
  if (arm === "nothing") return null;
  return freshCtxExtensionPath(repoRoot);
}

/** IsolatedSemanticEngine off in harness code for `freshctx-no-ts` only; host still passes scope=symbol. */
export function freshCtxEnvForArm(arm) {
  if (arm === "freshctx-no-ts") return { FRESHCTX_ISOLATED_SEMANTIC_ENGINE: "off" };
  return {};
}

export function validateArm(arm) {
  if (!ARMS.includes(arm)) {
    throw new Error(`arm must be one of ${ARMS.join("|")}, got ${String(arm)}`);
  }
}
