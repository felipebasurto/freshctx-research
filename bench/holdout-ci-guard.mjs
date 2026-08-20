import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { HOLDOUT_V01, PROTOCOL_COMMAND_HINT } from "./holdout-identity.mjs";

export async function readJson(root, path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

export async function scanProtocolExempt(root, baseRef = "main") {
  const errors = [];
  const diff = spawnSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], { encoding: "utf8", cwd: root });
  if (diff.status !== 0) {
    return errors;
  }

  const changed = diff.stdout.trim().split("\n").filter(Boolean);
  for (const file of changed) {
    if (file.endsWith(".json") && file.includes("bench/splits/")) {
      try {
        const manifest = await readJson(root, file);
        if (manifest.protocolExempt === true && manifest.packId !== HOLDOUT_V01.packId) {
          errors.push(`${file}: protocolExempt forbidden on new pack ${manifest.packId ?? "unknown"}`);
        }
      } catch {
        // ignore
      }
    }
  }

  try {
    const splitsDir = join(root, "bench/splits");
    const names = await readdir(splitsDir);
    for (const name of names.filter((n) => n.endsWith(".json"))) {
      const rel = `bench/splits/${name}`;
      const manifest = await readJson(root, rel);
      if (manifest.protocolExempt === true && manifest.packId !== HOLDOUT_V01.packId) {
        errors.push(`${rel}: protocolExempt forbidden`);
      }
    }
  } catch {
    // splits dir may not exist
  }

  return errors;
}

export async function scanMixedIntroduction(root, baseRef = "main") {
  const errors = [];
  const diff = spawnSync("git", ["diff", "--name-status", `${baseRef}...HEAD`], { encoding: "utf8", cwd: root });
  if (diff.status !== 0) return errors;

  const added = new Set();
  for (const line of diff.stdout.trim().split("\n").filter(Boolean)) {
    const [status, ...rest] = line.split("\t");
    const file = rest.join("\t");
    if (status.startsWith("A")) added.add(file);
  }

  const newPacks = new Set();
  for (const file of added) {
    const match = file.match(/^bench\/packs\/([^/]+)\//);
    if (match) newPacks.add(match[1]);
  }

  for (const packId of newPacks) {
    if (packId === HOLDOUT_V01.packId) continue;
    const hasManifest = [...added].some(
      (f) => f === `bench/splits/${packId}.json` || (f.startsWith("bench/splits/") && f.endsWith(".json")),
    );
    const hasTraces = [...added].some((f) => f.startsWith(`bench/packs/${packId}/traces/`));
    const hasReport = [...added].some((f) => f.startsWith(`bench/packs/${packId}/reports/`));
    const hasAttestation = [...added].some((f) => f.includes("freeze-attestation.json"));

    if (hasManifest && hasTraces && hasReport && !hasAttestation) {
      errors.push(
        `pack ${packId}: manifest+traces+report introduced together without prior freeze attestation. ${PROTOCOL_COMMAND_HINT}`,
      );
    }
  }

  return errors;
}

export async function scanLegacySealedReports(root, baseRef = "main") {
  const errors = [];
  const diff = spawnSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], { encoding: "utf8", cwd: root });
  if (diff.status !== 0) return errors;

  for (const file of diff.stdout.trim().split("\n").filter(Boolean)) {
    if (
      file.startsWith("bench/traces/") &&
      !file.startsWith(HOLDOUT_V01.tracesDir) &&
      !file.startsWith("bench/traces/smoke")
    ) {
      errors.push(`${file}: new traces outside protocol namespace require holdout:generate`);
    }
  }

  return errors;
}

export async function runHoldoutCiGuard(root, { baseRef = "main" } = {}) {
  const errors = [
    ...(await scanProtocolExempt(root, baseRef)),
    ...(await scanMixedIntroduction(root, baseRef)),
    ...(await scanLegacySealedReports(root, baseRef)),
  ];
  return { baseRef, valid: errors.length === 0, errors };
}
