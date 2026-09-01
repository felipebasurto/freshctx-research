import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ISOLATED_SEMANTIC_ENGINE = join(dirname(fileURLToPath(import.meta.url)), "parse.mjs");

export function createIsolatedSemanticEngineRunner({ command = process.execPath, args = [ISOLATED_SEMANTIC_ENGINE], spawnImpl = spawn } = {}) {
  return async function semanticEngineRunner({ path, bytes }) {
    return await new Promise((resolve, reject) => {
      const child = spawnImpl(command, args, { stdio: ["pipe", "pipe", "pipe"] });
      if (!child) {
        reject(new Error("isolated-semantic-engine-missing"));
        return;
      }
      const stdout = [];
      const stderr = [];
      child.stdout?.on("data", (chunk) => stdout.push(chunk));
      child.stderr?.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.join("") || "isolated-semantic-engine-error"));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));
        } catch (error) {
          reject(error);
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
