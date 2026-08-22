import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const HOSTS_DIR = join(ROOT, "bench", "hosts");
export const HOSTS_LOCK_PATH = join(ROOT, "bench", "hosts.lock.json");
export const HERMES_BRIDGE_PATH = join(ROOT, "bench", "hermes-native-bridge.py");

export async function loadHostsLock() {
  return JSON.parse(await readFile(HOSTS_LOCK_PATH, "utf8"));
}
