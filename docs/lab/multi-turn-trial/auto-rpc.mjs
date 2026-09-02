import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertT1HostReadTools,
  t1HostReadToolsValid,
  toolsFromExecutionStartEvents,
} from "../pi-trial-ts/auto-rpc-host-read.mjs";
import {
  assertT1HostReadTools as assertHermesT1HostReadTools,
  readDumpFunctionCallTools,
  readRecordedHostReadTools,
  t1HostReadToolsValid as hermesT1HostReadToolsValid,
  t1ToolsForAssert,
} from "../hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  HermesRpc,
  assistantTextFromEvents,
  runCliQuery,
  toolsFromHermesEvents,
} from "../hermes-trial-ts/hermes-queries.mjs";
import { createDumpProxy } from "../hermes-trial-ts/proxy.mjs";
import {
  ARMS,
  CELLS,
  HOSTS,
  MODEL,
  parseHostArg,
  promptForCell,
  resolveRepoRoot,
  validateArm,
} from "./pack.mjs";
import {
  hermesHomeForArm,
  hermesLaunchSpec,
  piLaunchSpec,
} from "./launch.mjs";
import {
  normalizeResolution,
  scanProviderPayloadForCell,
  stdoutMatchesMarker,
} from "./scan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const LIVE = join(here, "live.mjs");
const WORK = join(here, ".work");
const CAPTURE = join(WORK, "capture");
const repoRoot = resolveRepoRoot();
const PI = process.env.PI_BIN ?? "pi";

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
    return (await readdir(dir)).filter((name) => name.endsWith(".json") && !name.endsWith(".scan.json")).sort();
  } catch {
    return [];
  }
}

function hasProviderKey() {
  return Boolean(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY);
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
    delete merged.DEEPSEEK_API_KEY;
    delete merged.OPENAI_API_KEY;
    if (process.env.DEEPSEEK_API_KEY) merged.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (process.env.OPENAI_API_KEY) merged.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
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

async function overlayRequests(dumpDir, dumpsBefore, dumpsAfter, cell) {
  const newDumps = dumpsAfter.filter((name) => !dumpsBefore.includes(name));
  const requests = [];
  for (const name of newDumps) {
    const text = await readFile(join(dumpDir, name), "utf8");
    requests.push({ file: name, ...scanProviderPayloadForCell(text, cell) });
  }
  return requests;
}

function cellRow({ cell, disk, tools, reply, requests, arm, hostReadArgsMatched }) {
  const lastRequest = requests.at(-1) ?? null;
  return {
    id: cell.id,
    turn: cell.turn,
    mutate: cell.mutate,
    expectedMarker: cell.expectedMarker,
    disk,
    tools,
    hostReadArgsMatched,
    reply,
    stdoutMatchesCurrent: stdoutMatchesMarker(reply, cell.expectedMarker),
    requests,
    requestBytes: requests.map((item) => item.utf8Bytes),
    promptTokens: requests.map((item) => item.promptTokens),
    exactCurrentBytes: lastRequest?.exactCurrentBytes ?? false,
    stalePriorBytes: lastRequest?.stalePriorBytes ?? false,
    siblingBytesInRequest: lastRequest?.siblingBytesInRequest ?? false,
    resolution: normalizeResolution(lastRequest?.resolution, arm),
  };
}

async function runPiArm(arm) {
  validateArm(arm);
  const dumpDir = join(CAPTURE, "pi", arm, "requests");
  await mkdir(dumpDir, { recursive: true });
  await live(["reset", "pi", arm]);
  const cwd = join(WORK, "pi", arm);
  const spec = piLaunchSpec(arm, { dumpDir, workspace: cwd });
  process.stdout.write(`start host=pi arm=${arm} cwd=${cwd} model=${MODEL}\n`);
  const client = new PiRpc({
    cwd,
    args: spec.args,
    env: spec.env,
    logPath: join(CAPTURE, "pi", arm, "pi.stderr.log"),
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
  const cells = [];
  try {
    const state = await client.send({ type: "get_state" });
    if (!state.success) throw new Error(`get_state failed: ${JSON.stringify(state)}`);
    await client.send({ type: "set_auto_compaction", enabled: false });
    await client.send({ type: "set_auto_retry", enabled: true });
    for (const cell of CELLS) {
      if (cell.mutate) await live(["mutate", "pi", arm, cell.mutate]);
      const disk = JSON.parse(await live(["status", "pi", arm]));
      const dumpsBefore = await listScans(dumpDir);
      const events = await client.prompt(
        promptForCell(cell),
        cell.id === "t1-read" ? 15 * 60 * 1000 : 6 * 60 * 1000,
      );
      const replyMsg = await client.send({ type: "get_last_assistant_text" });
      const reply = replyMsg.data?.text ?? "";
      const dumpsAfter = await listScans(dumpDir);
      const requests = await overlayRequests(dumpDir, dumpsBefore, dumpsAfter, cell);
      const tools = toolsFromExecutionStartEvents(events);
      if (cell.id === "t1-read") {
        assertT1HostReadTools(tools, { arm, workspace: cwd });
      }
      const row = cellRow({
        cell,
        disk: disk.markers,
        tools,
        reply,
        requests,
        arm,
        hostReadArgsMatched: cell.id === "t1-read" ? t1HostReadToolsValid(tools, { workspace: cwd }) : null,
      });
      cells.push(row);
      await writeFile(join(CAPTURE, "pi", arm, `${cell.id}.json`), `${JSON.stringify(row, null, 2)}\n`);
      process.stdout.write(
        `pi ${arm} ${cell.id} tools=${row.tools.length} requestBytes=${row.requestBytes.join(",")} resolution=${row.resolution}\n`,
      );
    }
  } finally {
    await client.stop();
  }
  return cells;
}

async function runHermesArm(arm) {
  validateArm(arm);
  const dumpDir = join(CAPTURE, "hermes", arm, "requests");
  await mkdir(dumpDir, { recursive: true });
  await live(["reset", "hermes", arm]);
  const cwd = join(WORK, "hermes", arm);
  const hermesHome = hermesHomeForArm(cwd);
  const dumpOnly = !hasProviderKey();
  const proxy = createDumpProxy({ dumpDir, dumpOnly });
  const bound = await proxy.listen();
  process.stdout.write(`start host=hermes arm=${arm} cwd=${cwd} model=${MODEL} proxy=${bound.baseUrl}\n`);
  const spec = hermesLaunchSpec(arm, {
    proxyBaseUrl: bound.baseUrl,
    dumpDir,
    hermesHome,
    workspace: cwd,
  });
  const launched = await spec.launch({
    cwd,
    hermesHome,
    proxyBaseUrl: bound.baseUrl,
    dumpDir,
    logPath: join(CAPTURE, "hermes", arm, "hermes.stderr.log"),
  });
  const cells = [];
  try {
    const rpc = launched.protocol === "cli" ? null : new HermesRpc({ proc: launched.proc, protocol: launched.protocol });
    for (const cell of CELLS) {
      if (cell.mutate) await live(["mutate", "hermes", arm, cell.mutate]);
      const disk = JSON.parse(await live(["status", "hermes", arm]));
      const dumpsBefore = await listScans(dumpDir);
      const recordedBefore = await readRecordedHostReadTools(dumpDir);
      const prompt = promptForCell(cell);
      let events = [];
      let reply = "";
      let cliTools = [];
      if (rpc) {
        events = await rpc.prompt(prompt, cell.id === "t1-read" ? 15 * 60 * 1000 : 6 * 60 * 1000);
        reply = assistantTextFromEvents(events);
      } else {
        const query = await runCliQuery({
          cwd,
          env: launched.env,
          message: prompt,
          continueSession: cell.turn > 1,
          logPath: join(CAPTURE, "hermes", arm, `${cell.id}.cli.stderr.log`),
          hermesHome,
        });
        reply = query.reply;
        cliTools = query.tools ?? [];
      }
      const dumpsAfter = await listScans(dumpDir);
      const requests = await overlayRequests(dumpDir, dumpsBefore, dumpsAfter, cell);
      const recordedAfter = await readRecordedHostReadTools(dumpDir);
      const recordedTools = recordedAfter.slice(recordedBefore.length);
      const newDumps = dumpsAfter.filter((name) => !dumpsBefore.includes(name));
      const dumpTools = await readDumpFunctionCallTools(dumpDir, newDumps);
      const tools = t1ToolsForAssert({
        eventTools: toolsFromHermesEvents(events),
        recordedTools,
        cliTools,
        dumpTools,
      });
      if (cell.id === "t1-read") {
        assertHermesT1HostReadTools(tools, { arm, workspace: cwd });
      }
      const row = cellRow({
        cell,
        disk: disk.markers,
        tools,
        reply,
        requests,
        arm,
        hostReadArgsMatched: cell.id === "t1-read" ? hermesT1HostReadToolsValid(tools, { workspace: cwd }) : null,
      });
      cells.push(row);
      await writeFile(join(CAPTURE, "hermes", arm, `${cell.id}.json`), `${JSON.stringify(row, null, 2)}\n`);
      process.stdout.write(
        `hermes ${arm} ${cell.id} tools=${row.tools.length} requestBytes=${row.requestBytes.join(",")} resolution=${row.resolution}\n`,
      );
    }
  } finally {
    await launched.stop();
    await proxy.close();
  }
  return cells;
}

export function parseAutoRpcArgs(argv) {
  let host = "both";
  let arm = null;
  for (const arg of argv) {
    if (arg.startsWith("--host=")) {
      host = arg.slice("--host=".length);
      continue;
    }
    if (arg.startsWith("--arm=")) {
      arm = arg.slice("--arm=".length);
      continue;
    }
    if (HOSTS.includes(arg) || arg === "both") {
      host = arg;
      continue;
    }
    if (ARMS.includes(arg)) {
      arm = arg;
      continue;
    }
    throw new Error(`usage: auto-rpc.mjs [--host=pi|hermes|both] [--arm=${ARMS.join("|")}]`);
  }
  const hosts = parseHostArg(host);
  if (arm) validateArm(arm);
  return { hosts, arm };
}

async function runHostArm(host, arm) {
  if (host === "pi") return runPiArm(arm);
  if (host === "hermes") return runHermesArm(arm);
  const _exhaustive = host;
  throw new Error(`unhandled host ${String(_exhaustive)}`);
}

async function main(argv = process.argv.slice(2)) {
  if (process.env.FRESHCTX_BUDGET_CHARS) {
    throw new Error("FRESHCTX_BUDGET_CHARS is set; unset it and rerun so the code default is used");
  }
  const { hosts, arm } = parseAutoRpcArgs(argv);
  await mkdir(CAPTURE, { recursive: true });
  const started = new Date().toISOString();
  const arms = arm ? [arm] : ARMS;
  const captured = {};
  for (const host of hosts) {
    captured[host] = {};
    for (const nextArm of arms) {
      await rm(join(CAPTURE, host, nextArm), { recursive: true, force: true });
      captured[host][nextArm] = await runHostArm(host, nextArm);
    }
  }
  const summary = {
    label: "live-host",
    notAPaperResult: true,
    question:
      "Does FreshCtx keep the current settleDailyLedger marker across later mutate/flip turns after the 2-turn packs?",
    repoRoot,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(),
    started,
    ended: new Date().toISOString(),
    model: MODEL,
    hosts,
    arms: Object.fromEntries(HOSTS.map((nextHost) => [nextHost, captured[nextHost] ?? {}])),
    dumpOnly: !hasProviderKey(),
  };
  await writeFile(join(CAPTURE, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`wrote ${join(CAPTURE, "summary.json")}\n`);
  process.stdout.write("Run node docs/lab/multi-turn-trial/print-columns.mjs to print the measure table.\n");
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}

export { cellRow, overlayRequests };
