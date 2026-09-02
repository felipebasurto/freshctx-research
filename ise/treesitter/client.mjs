import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ISOLATED_SEMANTIC_ENGINE = join(dirname(fileURLToPath(import.meta.url)), "parse.mjs");

export const DEFAULT_ISOLATED_SEMANTIC_ENGINE_TIMEOUT_MS = 10_000;
export const DEFAULT_ISOLATED_SEMANTIC_ENGINE_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export function createIsolatedSemanticEngineRunner({
  command = process.execPath,
  args = [ISOLATED_SEMANTIC_ENGINE],
  spawnImpl = spawn,
  timeoutMs = DEFAULT_ISOLATED_SEMANTIC_ENGINE_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_ISOLATED_SEMANTIC_ENGINE_MAX_OUTPUT_BYTES,
} = {}) {
  return async function semanticEngineRunner({ path, bytes }) {
    return await new Promise((resolve, reject) => {
      const child = spawnImpl(command, args, { stdio: ["pipe", "pipe", "pipe"] });
      if (!child) {
        reject(new Error("isolated-semantic-engine-missing"));
        return;
      }
      let settled = false;
      let stdoutBytes = 0;
      const stdout = [];
      const stderr = [];
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const abort = (message) => {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
        settle(reject, new Error(message));
      };
      const timer = setTimeout(() => abort("isolated-semantic-engine-timeout"), timeoutMs);

      child.stdout?.on("data", (chunk) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxOutputBytes) {
          abort("isolated-semantic-engine-output-too-large");
          return;
        }
        stdout.push(chunk);
      });
      child.stderr?.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => settle(reject, error));
      child.stdin?.on("error", (error) => settle(reject, error));
      child.on("close", (code) => {
        if (code !== 0) {
          settle(reject, new Error(stderr.join("") || "isolated-semantic-engine-error"));
          return;
        }
        try {
          settle(resolve, JSON.parse(Buffer.concat(stdout).toString("utf8")));
        } catch (error) {
          settle(reject, error);
        }
      });
      child.stdin.write(JSON.stringify({ path, bytes: String(bytes ?? "") }));
      child.stdin.end();
    });
  };
}

export function missingIsolatedSemanticEngineRunner() {
  return async function missing() {
    throw new Error("isolated-semantic-engine-missing");
  };
}
