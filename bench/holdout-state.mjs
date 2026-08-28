import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";

import { PACK_CLASSIFICATIONS } from "./holdout-identity.mjs";
import { withBindingHash } from "./holdout-hashes.mjs";

export const STATE_FILENAME = "state.json";
export const ATTESTATION_FILENAME = "freeze-attestation.json";

export function packStatePath(pack) {
  return join(pack.provenanceDir ?? `bench/packs/${pack.packId}/provenance`, "..", STATE_FILENAME).replace(/\\/g, "/");
}

export function attestationPath(pack) {
  return join(pack.provenanceDir ?? `bench/packs/${pack.packId}/provenance`, ATTESTATION_FILENAME);
}

export async function pathExists(root, relPath) {
  try {
    await access(join(root, relPath), fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readPackState(root, pack) {
  const rel = `bench/packs/${pack.packId}/${STATE_FILENAME}`;
  if (!(await pathExists(root, rel))) return null;
  return JSON.parse(await readFile(join(root, rel), "utf8"));
}

export async function writePackState(root, pack, state) {
  const rel = `bench/packs/${pack.packId}/${STATE_FILENAME}`;
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, `${JSON.stringify(state, null, 2)}\n`);
  return rel;
}

export async function readAttestation(root, pack) {
  const rel = join(pack.provenanceDir, ATTESTATION_FILENAME).replace(/\\/g, "/");
  if (!(await pathExists(root, rel))) return null;
  return JSON.parse(await readFile(join(root, rel), "utf8"));
}

export async function writeAttestation(root, pack, attestation) {
  const rel = join(pack.provenanceDir, ATTESTATION_FILENAME).replace(/\\/g, "/");
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, `${JSON.stringify(withBindingHash(attestation), null, 2)}\n`);
  return rel;
}

export function assertValidClassification(classification) {
  if (!PACK_CLASSIFICATIONS.includes(classification)) {
    throw new Error(`invalid classification: ${classification}`);
  }
}

/** Determine earned classification from artifacts (read-only inference). */
export function inferEarnedClassification({
  isV01,
  hasRemoteAttestation,
  hasReport,
  hasRunProvenance,
  hasGenerateProvenance,
  hasCommittedFreeze,
  claimedClassification,
}) {
  if (isV01) {
    return claimedClassification === "unsealed-regression" ? "unsealed-regression" : null;
  }
  if (claimedClassification === "sealed") {
    if (!hasRemoteAttestation || !hasReport || !hasRunProvenance || !hasGenerateProvenance) {
      return null;
    }
    return "sealed";
  }
  if (claimedClassification === "remotely-attested") {
    return hasRemoteAttestation && hasCommittedFreeze ? "remotely-attested" : null;
  }
  if (claimedClassification === "locally-frozen") {
    return hasCommittedFreeze ? "locally-frozen" : null;
  }
  if (claimedClassification === "candidate") {
    return hasGenerateProvenance && !hasCommittedFreeze ? "candidate" : "candidate";
  }
  return null;
}

export function classificationRank(classification) {
  const order = ["unsealed-regression", "candidate", "locally-frozen", "remotely-attested", "sealed"];
  return order.indexOf(classification);
}

export function assertClassificationAdvancement(current, next) {
  if (current === next) return;
  const curRank = classificationRank(current);
  const nextRank = classificationRank(next);
  if (nextRank <= curRank && current !== "candidate") {
    throw new Error(`classification cannot regress or skip: ${current} → ${next}`);
  }
  if (nextRank - curRank > 1 && next !== "candidate") {
    throw new Error(`classification cannot skip states: ${current} → ${next}`);
  }
}
