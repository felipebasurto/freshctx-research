import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertT1HostReadTools,
  readRecordedHostReadTools,
  t1HostReadToolsValid,
  t1ToolsForAssert,
} from "./auto-rpc-host-read.mjs";
import {
  HermesRpc,
  assistantTextFromEvents,
  runCliQuery,
  stdoutMatchesCurrent,
  toolsFromHermesEvents,
} from "./hermes-queries.mjs";
import { launchHermes } from "./launch-hermes.mjs";
import {
  ARMS,
  CELLS,
  MARKER_V1,
  MODEL,
  promptForCell,
  resolveRepoRoot,
} from "./pack.mjs";
import { createDumpProxy } from "./proxy.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const LIVE = join(here, "live.mjs");
const WORK = join(here, ".work");
const CAPTURE = join(WORK, "capture");
const repoRoot = resolveRepoRoot();

function live(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [LIVE, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`live.mjs ${args.join(" ")} failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function listScans(dir) {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith(".scan.json")).sort();
  } catch {
    return [];
  }
}

function normalizeResolution(raw, arm) {
  if (arm === "nothing") return "none";
  const value = String(raw ?? "none");
  if (value.includes("isolated-semantic-engine")) return "isolated-semantic-engine";
  if (value.includes("file") || value.includes("whole")) return "file";
  return value === "none" || value.length === 0 ? "none" : value;
}

async function runArm(arm) {
  const dumpDir = join(CAPTURE, arm, "requests");
  await mkdir(dumpDir, { recursive: true });
  await live(["reset", arm]);
  const cwd = join(WORK, arm);
  const hermesHome = join(cwd, "hermes-home");
  const dumpOnly = !process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY;
  const proxy = createDumpProxy({ dumpDir, dumpOnly });
  const bound = await proxy.listen();
  process.stdout.write(`start arm=${arm} cwd=${cwd} model=${MODEL} proxy=${bound.baseUrl}\n`);
  const launched = await launchHermes({
    arm,
    cwd,
    hermesHome,
    proxyBaseUrl: bound.baseUrl,
    dumpDir,
    logPath: join(CAPTURE, arm, "hermes.stderr.log"),
  });
  const cells = [];
  try {
    const rpc = launched.protocol === "cli" ? null : new HermesRpc({ proc: launched.proc, protocol: launched.protocol });
    for (const cell of CELLS) {
      if (cell.mutate) await live(["mutate", arm, cell.mutate]);
      const disk = JSON.parse(await live(["status", arm]));
      const dumpsBefore = await listScans(dumpDir);
      const recordedBefore = await readRecordedHostReadTools(dumpDir);
      const prompt = promptForCell(cell);
      let events = [];
      let reply = "";
      if (rpc) {
        events = await rpc.prompt(prompt, cell.id === "t1-read" ? 15 * 60 * 1000 : 6 * 60 * 1000);
        reply = assistantTextFromEvents(events);
      } else {
        const query = await runCliQuery({
          cwd,
          env: launched.env,
          message: prompt,
          continueSession: cell.turn > 1,
          logPath: join(CAPTURE, arm, `${cell.id}.cli.stderr.log`),
          hermesHome,
        });
        reply = query.reply;
      }
      const dumpsAfter = await listScans(dumpDir);
      const newDumps = dumpsAfter.filter((name) => !dumpsBefore.includes(name));
      const requests = [];
      for (const name of newDumps) {
        const scan = JSON.parse(await readFile(join(dumpDir, name), "utf8"));
        requests.push({ file: name, ...scan });
      }
      const lastRequest = requests.at(-1) ?? null;
      const recordedAfter = await readRecordedHostReadTools(dumpDir);
      const recordedTools = recordedAfter.slice(recordedBefore.length);
      const tools = t1ToolsForAssert({
        eventTools: toolsFromHermesEvents(events),
        recordedTools,
      });
      if (cell.id === "t1-read") {
        assertT1HostReadTools(tools, { arm, workspace: cwd });
      }
      const row = {
        id: cell.id,
        turn: cell.turn,
        mutate: cell.mutate,
        disk: disk.markers,
        tools,
        hostReadArgsMatched: cell.id === "t1-read" ? t1HostReadToolsValid(tools, { workspace: cwd }) : null,
        reply,
        stdoutMatchesCurrent: stdoutMatchesCurrent(reply),
        requests,
        requestBytes: requests.map((item) => item.utf8Bytes),
        promptTokens: requests.map((item) => item.promptTokens),
        t2ExactNewBytes: lastRequest?.t2ExactNewBytes ?? false,
        siblingBytesInRequest: lastRequest?.siblingBytesInRequest ?? false,
        resolution: normalizeResolution(lastRequest?.resolution, arm),
      };
      cells.push(row);
      await writeFile(join(CAPTURE, arm, `${cell.id}.json`), `${JSON.stringify(row, null, 2)}\n`);
      process.stdout.write(
        `${arm} ${cell.id} reply=${JSON.stringify(reply.slice(0, 80))} tools=${row.tools.length} requestBytes=${row.requestBytes.join(",")} resolution=${row.resolution}\n`,
      );
    }
  } finally {
    await launched.stop();
    await proxy.close();
  }
  return cells;
}

async function main() {
  if (process.env.FRESHCTX_BUDGET_CHARS) {
    throw new Error("FRESHCTX_BUDGET_CHARS is set; unset it and rerun so the code default is used");
  }
  const only = process.argv[2];
  if (only && !ARMS.includes(only)) {
    throw new Error(`usage: auto-rpc.mjs [${ARMS.join("|")}]`);
  }
  await mkdir(CAPTURE, { recursive: true });
  const started = new Date().toISOString();
  const arms = only ? [only] : ARMS;
  const captured = {};
  for (const arm of arms) {
    await rm(join(CAPTURE, arm), { recursive: true, force: true });
    captured[arm] = await runArm(arm);
  }
  const summary = {
    label: "live-host",
    notAPaperResult: true,
    question:
      "Does FreshCtx beat Hermes-alone on TypeScript after a symbol-scope read of settleDailyLedger and interior flip?",
    repoRoot,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(),
    started,
    ended: new Date().toISOString(),
    model: MODEL,
    expectedCurrentMarker: MARKER_V1,
    budgetEnv: process.env.FRESHCTX_BUDGET_CHARS ?? null,
    arms: Object.fromEntries(ARMS.map((arm) => [arm, captured[arm] ?? []])),
  };
  await writeFile(join(CAPTURE, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`wrote ${join(CAPTURE, "summary.json")}\n`);
  process.stdout.write("Run node docs/lab/hermes-trial-ts/print-columns.mjs to print the measure table.\n");
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}
