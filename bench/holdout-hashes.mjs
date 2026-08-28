import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { sha256 } from "../src/hash.mjs";

export async function hashDirectoryJsonSet(root, dir, { excludePrefix = "candidates" } = {}) {
  const full = join(root, dir);
  let names;
  try {
    names = (await readdir(full)).filter(
      (n) => n.endsWith(".json") && !(excludePrefix && n.startsWith(excludePrefix)),
    );
  } catch {
    return null;
  }
  names.sort();
  const parts = [];
  for (const name of names) {
    const content = await readFile(join(full, name), "utf8");
    parts.push(`${name}:${sha256(content)}`);
  }
  return sha256(parts.join("\n"));
}

export async function hashFileBytes(root, relPath) {
  try {
    const content = await readFile(join(root, relPath));
    return sha256(content);
  } catch {
    return null;
  }
}

export async function hashJsonlSet(root, relPath) {
  try {
    const content = await readFile(join(root, relPath), "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const parts = lines.map((line, i) => `${i}:${sha256(line)}`);
    return sha256(parts.join("\n"));
  } catch {
    return null;
  }
}

export function hashReportMarkdown(content) {
  return sha256(content);
}

export const ATTESTATION_BINDING_MISMATCH = "ATTESTATION_BINDING_MISMATCH";
export const ATTESTATION_MANIFEST_MISMATCH = "ATTESTATION_MANIFEST_MISMATCH";
export const ATTESTATION_NOT_PRODUCTION = "ATTESTATION_NOT_PRODUCTION";

export function attestationBindingHash(attestation) {
  const clone = { ...attestation };
  delete clone.bindingSha256;
  return createHash("sha256").update(`${JSON.stringify(clone, null, 2)}\n`).digest("hex");
}

export function withBindingHash(attestation) {
  const clone = { ...attestation };
  delete clone.bindingSha256;
  return { ...clone, bindingSha256: attestationBindingHash(clone) };
}

export function validateAttestationBinding(attestation) {
  if (!attestation || typeof attestation.bindingSha256 !== "string" || attestation.bindingSha256.length !== 64) {
    return ATTESTATION_BINDING_MISMATCH;
  }
  if (attestation.bindingSha256 !== attestationBindingHash(attestation)) {
    return ATTESTATION_BINDING_MISMATCH;
  }
  return null;
}

/** Canonical attestation object shape required for production sealed classification. */
export function validateAttestationShape(attestation) {
  const required = [
    "schemaVersion",
    "packId",
    "freezeCommitSha",
    "manifestSha256",
    "reposLockSha256",
    "repositoryLocks",
    "workflowRunId",
    "workflowRunUrl",
    "attestedAt",
  ];
  for (const key of required) {
    if (attestation[key] === undefined || attestation[key] === null || attestation[key] === "") {
      return `attestation missing required field: ${key}`;
    }
  }
  if (!/^[0-9a-f]{40}$/.test(attestation.freezeCommitSha)) {
    return "attestation freezeCommitSha invalid";
  }
  if (!/^[0-9a-f]{64}$/.test(attestation.manifestSha256)) {
    return "attestation manifestSha256 invalid";
  }
  return null;
}

/** True only for attestations from a real GitHub Actions freeze-attest run (not stub/local). */
export function isProductionAttestation(attestation) {
  if (!attestation || attestation.stub === true) return false;
  if (validateAttestationShape(attestation)) return false;
  const runId = String(attestation.workflowRunId);
  if (runId === "local-run" || !/^\d+$/.test(runId)) return false;
  const url = String(attestation.workflowRunUrl);
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+/.test(url)) return false;
  return true;
}

export function validateProductionAttestation(attestation) {
  const shape = validateAttestationShape(attestation);
  if (shape) return `${ATTESTATION_NOT_PRODUCTION} ${shape}`;
  if (attestation.stub === true) {
    return `${ATTESTATION_NOT_PRODUCTION} attestation is stub; not valid for sealed/remotely-attested`;
  }
  const runId = String(attestation.workflowRunId);
  if (runId === "local-run" || !/^\d+$/.test(runId)) {
    return `${ATTESTATION_NOT_PRODUCTION} attestation workflowRunId is not a production GHA run id`;
  }
  const url = String(attestation.workflowRunUrl);
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+/.test(url)) {
    return `${ATTESTATION_NOT_PRODUCTION} attestation workflowRunUrl is not a production GHA actions run URL`;
  }
  return null;
}

export function isGithubActionsPipeline() {
  return process.env.GITHUB_ACTIONS === "true";
}
