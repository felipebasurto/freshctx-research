import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIDECAR = join(dirname(fileURLToPath(import.meta.url)), "parse.mjs");

export function createSidecarRunner({ command = process.execPath, args = [SIDECAR], spawnImpl = spawn } = {}) {
  return async function sidecarRunner({ path, bytes }) {
    return await new Promise((resolve, reject) => {
      const child = spawnImpl(command, args, { stdio: ["pipe", "pipe", "pipe"] });
      if (!child) {
        reject(new Error("sidecar-missing"));
        return;
      }
      const stdout = [];
      const stderr = [];
      child.stdout?.on("data", (chunk) => stdout.push(chunk));
      child.stderr?.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.join("") || "sidecar-error"));
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

export function missingSidecarRunner() {
  return async function missing() {
    throw new Error("sidecar-missing");
  };
}
