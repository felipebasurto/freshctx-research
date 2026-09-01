/** Write fixture sessions as dump-shaped *.scan.json trees for CI. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { COST_COMPARE_ARMS, HOSTS, validateArm, validateHost } from "./pack.mjs";

export function scanFromFixtureTurn(turn, index) {
  validateArm(turn.arm);
  if (turn.host) validateHost(turn.host);
  return {
    n: turn.turn ?? index + 1,
    cellId: turn.cellId ?? `t${turn.turn ?? index + 1}`,
    utf8Bytes: turn.requestBytes ?? turn.utf8Bytes ?? null,
    promptTokens: turn.promptTokens ?? null,
    completionTokens: turn.completionTokens ?? null,
    usageFrom: turn.usageFrom ?? (turn.promptTokens == null ? "none" : "provider-response"),
    dumpOnly: turn.dumpOnly === true,
    host: turn.host ?? null,
    arm: turn.arm,
    model: turn.model,
    source: turn.source ?? "fixture",
  };
}

export async function materializeFixtureDumps(fixture, destRoot, { hosts = HOSTS, arms = COST_COMPARE_ARMS } = {}) {
  const written = [];
  for (const host of hosts) {
    for (const arm of arms) {
      const turns = fixture?.hosts?.[host]?.arms?.[arm]?.turns;
      if (!Array.isArray(turns) || turns.length === 0) continue;
      const dir = join(destRoot, host, arm);
      await mkdir(dir, { recursive: true });
      for (const [index, turn] of turns.entries()) {
        const scan = scanFromFixtureTurn(turn, index);
        const id = String(scan.n).padStart(3, "0");
        const path = join(dir, `${id}.scan.json`);
        await writeFile(path, `${JSON.stringify(scan, null, 2)}\n`);
        written.push(path);
      }
    }
  }
  return written;
}
