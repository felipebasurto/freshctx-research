import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

const PI = requiredEnv("FRESHCTX_PI_BIN");
const LIVE = join(here, "live.mjs");
const SOURCE = requiredEnv("FRESHCTX_TRIAL_SOURCE");
const FRESHCTX = requiredEnv("FRESHCTX_TRIAL_EXTENSION");
const DUMP_EXT = join(here, "dump-request.ts");
const WORK = join(here, ".work");
const CAPTURE = join(WORK, "capture");

const PROMPT_READ = `Lee estos archivos enteros, sin offset:
- README.md
- src/viajante/cli.py
- src/viajante/models.py
- src/viajante/flights.py
- notes/freshctx-todo.md

No edites. No crees archivos. Responde solo:

README=...
CLI=...
MODELS=...
FLIGHTS=...
TODO=...`;

const PROMPT_CLI = `No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_CLI?
Responde una línea: CLI=...`;

const PROMPT_README = `No uses herramientas. No leas. No edites.
README=...
FLIGHTS=...`;

const PROMPT_TODO = `No uses herramientas. No leas. No edites.
¿Existe notes/freshctx-todo.md?
Si no existe, responde exactamente: TODO=gone
Si crees que existe, cita MARKER_TODO.`;

const PROMPT_INVENTORY = `No uses herramientas. No edites.
README=
CLI=
MODELS=
TODO=
FLIGHTS=`;

const CELLS = [
  { id: "1-read", mutate: null, prompt: PROMPT_READ, timeoutMs: 15 * 60 * 1000 },
  { id: "2-cli", mutate: "flip-cli", prompt: PROMPT_CLI, timeoutMs: 6 * 60 * 1000 },
  { id: "3-readme", mutate: "flip-readme", prompt: PROMPT_README, timeoutMs: 6 * 60 * 1000 },
  { id: "4-todo", mutate: "delete-todo", prompt: PROMPT_TODO, timeoutMs: 6 * 60 * 1000 },
  { id: "5-inventory", mutate: null, prompt: PROMPT_INVENTORY, timeoutMs: 6 * 60 * 1000 },
];

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

function toolsFromEvents(events) {
  return events
    .filter((event) => event.type === "tool_execution_start")
    .map((event) => ({
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: event.args ?? null,
    }));
}

function markerHits(text) {
  const hay = String(text ?? "");
  const names = ["RD0", "RD1", "RD2", "CL0", "CL1", "CL2", "MD0", "MD1", "FL0", "FL1", "TD0", "TD1"];
  return {
    markers: names.filter((mark) => hay.includes(mark)),
    gone: hay.includes("TODO=gone") || /\bTODO=gone\b/u.test(hay),
    noAccessible: hay.toLowerCase().includes("no accessible content"),
    invented: names.filter((mark) => /2$/u.test(mark) && hay.includes(mark)),
  };
}

async function runArm(arm) {
  const dumpDir = join(CAPTURE, arm, "requests");
  await mkdir(dumpDir, { recursive: true });
  await live(["reset", arm, "--source", SOURCE]);
  const cwd = join(WORK, arm);
  const args = [
    "--mode",
    "rpc",
    "--no-session",
    "--no-context-files",
        "--no-extensions",
    "--provider",
    "deepseek",
    "--model",
    "deepseek-v4-pro",
    "--thinking",
    "high",
  ];
  if (arm === "with") args.push("-e", FRESHCTX);
  args.push("-e", DUMP_EXT);
  const env = { PI_TRIAL_DUMP_DIR: dumpDir };
  process.stdout.write(`start arm=${arm} cwd=${cwd}\n`);
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
      const events = await client.prompt(cell.prompt, cell.timeoutMs);
      const replyMsg = await client.send({ type: "get_last_assistant_text" });
      const reply = replyMsg.data?.text ?? "";
      const dumpsAfter = await listScans(dumpDir);
      const newDumps = dumpsAfter.filter((name) => !dumpsBefore.includes(name));
      const requests = [];
      for (const name of newDumps) {
        const scan = JSON.parse(await readFile(join(dumpDir, name), "utf8"));
        requests.push({ file: name, ...scan });
      }
      const row = {
        id: cell.id,
        mutate: cell.mutate,
        disk: disk.markers,
        tools: toolsFromEvents(events),
        reply,
        replyScan: markerHits(reply),
        requests,
        requestBytes: requests.map((item) => item.utf8Bytes),
      };
      cells.push(row);
      await writeFile(join(CAPTURE, arm, `${cell.id}.json`), `${JSON.stringify(row, null, 2)}\n`);
      process.stdout.write(`${arm} ${cell.id} replyBytes=${Buffer.byteLength(reply)} tools=${row.tools.length} requests=${requests.length} requestBytes=${row.requestBytes.join(",")}\n`);
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
  if (only && only !== "without" && only !== "with") {
    throw new Error("usage: auto-rpc.mjs [without|with]");
  }
  await mkdir(CAPTURE, { recursive: true });
  const started = new Date().toISOString();
  const arms = only ? [only] : ["without", "with"];
  const captured = {};
  for (const arm of arms) {
    await rm(join(CAPTURE, arm), { recursive: true, force: true });
    captured[arm] = await runArm(arm);
  }
  const without = captured.without ?? (await loadCells("without"));
  const withArm = captured.with ?? (await loadCells("with"));
  const summary = {
    label: "live-host",
    notAPaperResult: true,
    commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: join(here, "../.."), encoding: "utf8" }).trim(),
    started,
    ended: new Date().toISOString(),
    model: "deepseek-v4-pro",
    budgetEnv: process.env.FRESHCTX_BUDGET_CHARS ?? null,
    arms: { without, with: withArm },
  };
  await writeFile(join(CAPTURE, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`wrote ${join(CAPTURE, "summary.json")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
