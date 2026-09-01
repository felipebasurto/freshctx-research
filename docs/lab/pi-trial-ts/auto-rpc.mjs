import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertT1HostReadTools,
  envWithForceHostRead,
  piArgsForArm,
  t1HostReadToolsValid,
  toolsFromExecutionStartEvents,
} from "./auto-rpc-host-read.mjs";
import {
  ARMS,
  CELLS,
  MARKER_V1,
  freshCtxEnvForArm,
  freshCtxExtensionForArm,
  promptForCell,
  resolveRepoRoot,
} from "./pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolveRepoRoot();
const LIVE = join(here, "live.mjs");
const DUMP_EXT = join(here, "dump-request.ts");
const WORK = join(here, ".work");
const CAPTURE = join(WORK, "capture");

const PI = process.env.PI_BIN ?? "pi";
const MODEL = "deepseek-v4-flash";

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

class PiRpc {
  constructor({ cwd, args, env, logPath }) {
    this.buf = "";
    this.n = 0;
    this.pending = new Map();
    this.events = [];
    this.settled = [];
    this.stderr = "";
    this.logPath = logPath;
    const merged = { ...process.env, ...env, PATH: `${dirname(PI)}:${process.env.PATH ?? ""}` };
    delete merged.FRESHCTX_BUDGET_CHARS;
    this.proc = spawn(PI, args, {
      cwd,
      env: merged,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString();
    });
    this.exit = new Promise((resolve) => {
      this.proc.on("close", (code, signal) => {
        const error = new Error(`pi exited ${code} ${signal ?? ""}`.trim());
        for (const waiter of this.pending.values()) waiter.reject(error);
        this.pending.clear();
        resolve({ code, signal });
      });
    });
    this.proc.on("error", (error) => {
      for (const waiter of this.pending.values()) waiter.reject(error);
      this.pending.clear();
    });
  }

  onStdout(chunk) {
    this.buf += chunk.toString("utf8");
    while (true) {
      const idx = this.buf.indexOf("\n");
      if (idx < 0) break;
      const line = this.buf.slice(0, idx).replace(/\r$/u, "");
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      if (!line.startsWith("{")) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (error) {
        throw new Error(`bad rpc json: ${error.message}: ${line.slice(0, 200)}`);
      }
      if (msg.type === "response") {
        const waiter = this.pending.get(msg.id);
        if (waiter) {
          this.pending.delete(msg.id);
          waiter.resolve(msg);
        }
        continue;
      }
      this.events.push(msg);
      if (msg.type === "agent_settled") {
        const waiters = this.settled.splice(0);
        for (const waiter of waiters) waiter.resolve();
      }
    }
  }

  send(body, timeoutMs = 30_000) {
    const id = body.id ?? `req-${++this.n}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`rpc timeout ${id} after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve(msg) {
          clearTimeout(timer);
          resolve(msg);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.proc.stdin.write(`${JSON.stringify({ ...body, id })}\n`);
    });
  }

  async prompt(message, timeoutMs) {
    const from = this.events.length;
    const settled = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms waiting for agent_settled`)), timeoutMs);
      this.settled.push({
        resolve() {
          clearTimeout(timer);
          resolve();
        },
      });
    });
    const accepted = await this.send({ type: "prompt", message });
    if (!accepted.success) {
      throw new Error(`prompt rejected: ${JSON.stringify(accepted)}`);
    }
    await settled;
    return this.events.slice(from);
  }

  async stop() {
    try {
      this.proc.stdin.end();
    } catch {
      // already closed
    }
    this.proc.kill("SIGTERM");
    const result = await Promise.race([
      this.exit,
      new Promise((resolve) => {
        setTimeout(() => {
          this.proc.kill("SIGKILL");
          resolve({ code: null, signal: "SIGKILL" });
        }, 3000);
      }),
    ]);
    if (this.logPath) await writeFile(this.logPath, this.stderr);
    return result;
  }
}


function stdoutMatchesCurrent(reply) {
  const line = String(reply ?? "");
  return /\bSETTLE=ST1\b/u.test(line) || /\bSETTLE\s*=\s*ST1\b/u.test(line);
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
  const extension = freshCtxExtensionForArm(arm, repoRoot);
  const args = piArgsForArm({
    dumpExt: DUMP_EXT,
    freshCtxExtension: extension,
    forceHostRead: true,
  });
  const env = envWithForceHostRead({ ...freshCtxEnvForArm(arm), PI_TRIAL_DUMP_DIR: dumpDir });
  process.stdout.write(`start arm=${arm} cwd=${cwd} model=${MODEL}\n`);
  const client = new PiRpc({
    cwd,
    args,
    env,
    logPath: join(CAPTURE, arm, "pi.stderr.log"),
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
  const cells = [];
  try {
    const state = await client.send({ type: "get_state" });
    if (!state.success) throw new Error(`get_state failed: ${JSON.stringify(state)}`);
    await client.send({ type: "set_auto_compaction", enabled: false });
    await client.send({ type: "set_auto_retry", enabled: true });
    for (const cell of CELLS) {
      if (cell.mutate) await live(["mutate", arm, cell.mutate]);
      const disk = JSON.parse(await live(["status", arm]));
      const dumpsBefore = await listScans(dumpDir);
      const prompt = promptForCell(cell);
      const events = await client.prompt(prompt, cell.id === "t1-read" ? 15 * 60 * 1000 : 6 * 60 * 1000);
      const replyMsg = await client.send({ type: "get_last_assistant_text" });
      const reply = replyMsg.data?.text ?? "";
      const dumpsAfter = await listScans(dumpDir);
      const newDumps = dumpsAfter.filter((name) => !dumpsBefore.includes(name));
      const requests = [];
      for (const name of newDumps) {
        const scan = JSON.parse(await readFile(join(dumpDir, name), "utf8"));
        requests.push({ file: name, ...scan });
      }
      const lastRequest = requests.at(-1) ?? null;
      const tools = toolsFromExecutionStartEvents(events);
      if (cell.id === "t1-read") {
        assertT1HostReadTools(tools, { arm });
      }
      const row = {
        id: cell.id,
        turn: cell.turn,
        mutate: cell.mutate,
        disk: disk.markers,
        tools,
        hostReadArgsMatched: cell.id === "t1-read" ? t1HostReadToolsValid(tools) : null,
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
    await client.stop();
  }
  return cells;
}

async function loadCells(arm) {
  const cells = [];
  for (const cell of CELLS) {
    const path = join(CAPTURE, arm, `${cell.id}.json`);
    try {
      cells.push(JSON.parse(await readFile(path, "utf8")));
    } catch {
      // arm not captured yet
    }
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
      "Does FreshCtx beat Pi-alone on TypeScript after a symbol-scope read of settleDailyLedger and interior flip?",
    repoRoot,
    freshCtxExtension: freshCtxExtensionForArm("freshctx-ts", repoRoot),
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
  process.stdout.write("Run node docs/lab/pi-trial-ts/print-columns.mjs to print the measure table.\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
