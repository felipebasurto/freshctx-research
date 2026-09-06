#!/usr/bin/env node
// Colored one-shot FreshCtx snapshot for the `/freshctx` slash command.
// Injected via !`node .opencode/scripts/freshctx-status.mjs` so the terminal
// shows green/red/yellow directly. Never fails: prints gray on error, exits 0.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[34m";
const DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

const root = process.cwd();
const envRaw = (process.env.FRESHCTX_ENABLED ?? "").trim().toLowerCase();
const envOff = ["0", "false", "off", "no", "disabled"].includes(envRaw);
const stateExists = existsSync(path.join(root, ".freshctx"));

let doctor = null;
try {
  const cmd = process.env.FRESHCTX_COMMAND || "freshctx";
  const res = spawnSync(cmd, ["doctor"], { encoding: "utf8", timeout: 8000 });
  if (res.status === 0) doctor = JSON.parse(res.stdout || "{}");
} catch { /* gray fallback below */ }

// Bridge stats written by the plugin on every observe/prepare/apply
// (.opencode/freshctx-stats.json). Missing = bridge hasn't acted yet.
let bridge = null;
try {
  bridge = JSON.parse(readFileSync(path.join(root, ".opencode", "freshctx-stats.json"), "utf8"));
} catch { /* first run */ }

function ago(iso) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const dot = (ok) => (ok ? `${G}●${RESET}` : `${R}●${RESET}`);
console.log(`${BOLD}FreshCtx${RESET} ${DIM}(${root})${RESET}`);
console.log(`  ${dot(!envOff)} toggle   ${!envOff ? `${G}ON${RESET}` : `${R}OFF${RESET}`} ${DIM}(FRESHCTX_ENABLED=${process.env.FRESHCTX_ENABLED ?? "unset"}; /freshctx on|off)${RESET}`);
console.log(`  ${dot(stateExists)} state    ${stateExists ? `${G}.freshctx/ present${RESET}` : `${Y}no .freshctx/ (run freshctx init)${RESET}`}`);
if (doctor) {
  const langs = (doctor.languages ?? []).join(",");
  console.log(`  ${G}●${RESET} sidecar  ${G}doctor ok${RESET} ${DIM}[${langs}]${RESET}`);
} else {
  console.log(`  ${R}●${RESET} sidecar  ${R}doctor unreachable${RESET} ${DIM}(is freshctx on PATH? FRESHCTX_COMMAND=${process.env.FRESHCTX_COMMAND ?? "freshctx"})${RESET}`);
}
if (bridge) {
  const applied = (bridge.applies ?? 0) > 0;
  console.log(
    `  ${applied ? `${G}●${RESET}` : `${Y}●${RESET}`} context  ` +
    `${applied ? `${G}updated ${ago(bridge.lastAppliedAt)}${RESET}` : `${Y}not applied yet${RESET}`} ` +
    `${DIM}(observes=${bridge.observes ?? 0} prepares=${bridge.prepares ?? 0} applies=${bridge.applies ?? 0} discards=${bridge.discards ?? 0} stale=${bridge.stale ?? 0}${bridge.lastBytes ? ` last=${bridge.lastBytes}B` : ""})${RESET}`,
  );
  console.log(
    `${DIM}  last: observe ${ago(bridge.lastObserveAt)} · prepare ${ago(bridge.lastPrepareAt)} · applied ${ago(bridge.lastAppliedAt)}${RESET}`,
  );
  const hist = (bridge.history ?? []).slice(-3).reverse();
  for (const h of hist) {
    const color = h.kind === "applied" ? G : h.kind === "stale" || h.kind === "discard" ? Y : DIM;
    console.log(`${DIM}  · ${ago(h.at)} ${color}${h.kind}${RESET}${DIM} ${String(h.detail ?? "").slice(0, 110)}${RESET}`);
  }
} else {
  console.log(`  ${Y}●${RESET} context  ${Y}no activity yet${RESET} ${DIM}(read a file, then send a message)${RESET}`);
}
console.log(`${DIM}Tip: toasts in TUI are ${G}green=applied${RESET}${DIM}, ${Y}yellow=skipped/stale/off${RESET}${DIM}, ${R}red=error${RESET}. Full state: ask agent to call freshctx_status.${RESET}`);
