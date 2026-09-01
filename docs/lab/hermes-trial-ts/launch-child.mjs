import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

export function mergeChildEnv(extra = {}) {
  const merged = { ...process.env, ...extra };
  if (extra.PATH) merged.PATH = extra.PATH;
  return merged;
}

export function launchChild({ command, args = [], cwd, env, logPath }) {
  if (!command) throw new Error("launchChild requires command");
  const merged = mergeChildEnv(env);
  const proc = spawn(command, args, {
    cwd,
    env: merged,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  const exit = new Promise((resolve) => {
    proc.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  proc.on("error", (error) => {
    stderr += error instanceof Error ? error.message : String(error);
  });

  async function stop({ signal = "SIGTERM", waitMs = 3000 } = {}) {
    try {
      proc.stdin.end();
    } catch {
      // already closed
    }
    if (!proc.killed) proc.kill(signal);
    const result = await Promise.race([
      exit,
      new Promise((resolve) => {
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
          resolve({ code: null, signal: "SIGKILL", stdout, stderr });
        }, waitMs);
      }),
    ]);
    if (logPath) await writeFile(logPath, result.stderr);
    return result;
  }

  return { proc, exit, stop, getStdout: () => stdout, getStderr: () => stderr };
}
