import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const STATE_FILENAME = "state.json";
import {
  ATTESTATION_MANIFEST_MISMATCH,
  ATTESTATION_NOT_PRODUCTION,
  attestationBindingHash,
  hashDirectoryJsonSet,
  hashFileBytes,
  hashJsonlSet,
  hashReportMarkdown,
  isProductionAttestation,
  validateAttestationBinding,
  validateAttestationShape,
  validateProductionAttestation,
} from "./holdout-hashes.mjs";
import {
  computeManifestHash,
  findManifestFreezeCommit,
  gitRevParse,
  readManifest,
  requireGit,
  resolvePackPaths,
} from "./holdout-protocol.mjs";
import { inferEarnedClassification, readAttestation, readPackState } from "./holdout-state.mjs";
import { sha256 } from "../src/hash.mjs";
import { HOLDOUT_V01, HOLDOUT_V02 } from "./holdout-identity.mjs";

export class VerifyError extends Error {
  constructor(message) {
    super(message);
    this.name = "VerifyError";
  }
}

const PROVENANCE_GENERATE = "generate.json";
const PROVENANCE_RUN = "run.json";

async function loadCorpusSplit(root) {
  return JSON.parse(await readFile(join(root, HOLDOUT_V01.splitManifest), "utf8"));
}

export async function verifyHoldoutV01(root) {
  const errors = [];
  const split = await loadCorpusSplit(root);

  const topStatus = split.status ?? split.splits?.holdout?.status;
  const holdoutSplit = split.splits?.holdout ?? {};
  if (topStatus !== "unsealed-regression-development-pack" && holdoutSplit.role !== undefined) {
    if (holdoutSplit.protocolExempt === true) {
      errors.push("holdout v0.1 must not use generic protocolExempt; use hard-coded unsealed-regression identity");
    }
  }
  if (split.status === "sealed" || holdoutSplit.classification === "sealed") {
    errors.push("holdout v0.1 cannot be relabeled sealed");
  }

  const statePath = `bench/packs/${HOLDOUT_V01.packId}/${STATE_FILENAME}`;
  let state = null;
  try {
    state = JSON.parse(await readFile(join(root, statePath), "utf8"));
  } catch {
    // state optional for v0.1 baseline
  }

  if (state?.classification && state.classification !== "unsealed-regression") {
    errors.push(`holdout v0.1 state claims ${state.classification}; must be unsealed-regression`);
  }

  const traceSetHash = await hashDirectoryJsonSet(root, HOLDOUT_V01.tracesDir);
  const resultSetHash = await hashJsonlSet(root, HOLDOUT_V01.resultsJsonl);
  let reportHash = null;
  try {
    const reportContent = await readFile(join(root, HOLDOUT_V01.reportMarkdown), "utf8");
    reportHash = hashReportMarkdown(reportContent);
    if (reportContent.includes("classification: `sealed`")) {
      errors.push("holdout v0.1 report claims sealed classification");
    }
  } catch {
    // report may be absent in some test repos
  }

  if (state?.traceSetHash && traceSetHash && state.traceSetHash !== traceSetHash) {
    errors.push("holdout v0.1 trace-set hash mismatch (tampered traces)");
  }
  if (state?.resultSetHash && resultSetHash && state.resultSetHash !== resultSetHash) {
    errors.push("holdout v0.1 result-set hash mismatch (tampered results)");
  }
  if (state?.reportHash && reportHash && state.reportHash !== reportHash) {
    errors.push("holdout v0.1 report hash mismatch (tampered report markdown)");
  }

  return {
    packId: HOLDOUT_V01.packId,
    classification: "unsealed-regression",
    valid: errors.length === 0,
    errors,
    traceSetHash,
    resultSetHash,
    reportHash,
  };
}

async function loadAttestation(root, pack, attestationPath) {
  if (attestationPath) {
    const full = isAbsolute(attestationPath) ? attestationPath : join(root, attestationPath);
    return JSON.parse(await readFile(full, "utf8"));
  }
  return readAttestation(root, pack);
}

export async function verifyProtocolPack(root, manifestPath, { attestationPath } = {}) {
  requireGit();
  const errors = [];
  const manifest = await readManifest(root, manifestPath);
  const pack = { ...resolvePackPaths(root, { ...manifest, manifestPath }), manifestPath };

  let freezeCommitSha;
  try {
    freezeCommitSha = findManifestFreezeCommit(root, manifestPath, manifest.manifestSha256);
  } catch (error) {
    errors.push(error.message);
    freezeCommitSha = null;
  }

  const computedManifestHash = computeManifestHash(manifest);
  if (manifest.manifestSha256 !== computedManifestHash) {
    errors.push("manifest hash mismatch (tampered after freeze)");
  }

  const state = await readPackState(root, pack);
  const attestation = await loadAttestation(root, pack, attestationPath);
  const attestationError = attestation ? validateAttestationShape(attestation) : null;
  if (attestationError) errors.push(attestationError);

  if (attestation) {
    const bindingError = validateAttestationBinding(attestation);
    if (bindingError) errors.push(bindingError);
  }

  const productionAttestation = attestation && isProductionAttestation(attestation);
  if (attestation && !productionAttestation) {
    const prodErr = validateProductionAttestation(attestation);
    if (prodErr) errors.push(`non-production attestation: ${prodErr}`);
    else errors.push(ATTESTATION_NOT_PRODUCTION);
  }

  if (attestation) {
    if (attestation.manifestSha256 !== manifest.manifestSha256) {
      errors.push(ATTESTATION_MANIFEST_MISMATCH);
    }
    if (freezeCommitSha && attestation.freezeCommitSha !== freezeCommitSha) {
      errors.push("attestation freezeCommitSha mismatch");
    }
    if (attestation.reposLockSha256 !== manifest.reposLockSha256) {
      errors.push("attestation reposLockSha256 mismatch");
    }
  }

  const traceSetHash = await hashDirectoryJsonSet(root, pack.tracesDir);
  const resultsPath = join(pack.reportsDir, "results.jsonl").replace(/\\/g, "/");
  const claimed = state?.classification ?? manifest.classification ?? "locally-frozen";
  const resultSetHash = await verifySealedResultSet(root, pack, state, claimed, errors);
  const computedResultSetHash =
    resultSetHash ?? (claimed === "sealed" ? null : await hashJsonlSet(root, resultsPath));
  const reportPath = join(pack.reportsDir, "report.md").replace(/\\/g, "/");
  let reportHash = null;
  try {
    const reportContent = await readFile(join(root, reportPath), "utf8");
    reportHash = hashReportMarkdown(reportContent);
  } catch {
    // absent until report phase
  }

  const generatePath = join(pack.provenanceDir, PROVENANCE_GENERATE).replace(/\\/g, "/");
  const runPath = join(pack.provenanceDir, PROVENANCE_RUN).replace(/\\/g, "/");
  const hasGenerate = await hashFileBytes(root, generatePath);
  const hasRun = await hashFileBytes(root, runPath);

  if (state?.traceSetHash && traceSetHash && state.traceSetHash !== traceSetHash) {
    errors.push("trace-set hash mismatch (tampered traces)");
  }
  if (claimed !== "sealed") {
    if (state?.resultSetHash && computedResultSetHash && state.resultSetHash !== computedResultSetHash) {
      errors.push("result-set hash mismatch (tampered results)");
    }
  }
  if (state?.reportHash && reportHash && state.reportHash !== reportHash) {
    errors.push("report hash mismatch (tampered report markdown)");
  }

  const earned = inferEarnedClassification({
    isV01: false,
    hasRemoteAttestation: Boolean(productionAttestation),
    hasReport: Boolean(reportHash),
    hasRunProvenance: Boolean(hasRun),
    hasGenerateProvenance: Boolean(hasGenerate),
    hasCommittedFreeze: Boolean(freezeCommitSha),
    claimedClassification: claimed,
  });

  if ((claimed === "sealed" || claimed === "remotely-attested") && attestation && !productionAttestation) {
    errors.push(`${claimed} classification requires production GHA attestation (not stub/local-run)`);
  }
  if (claimed === "sealed" && !attestation) {
    errors.push("sealed classification requires remote attestation");
  }
  if (claimed === "sealed" && earned !== "sealed") {
    errors.push(`claimed classification sealed not earned (missing pipeline artifacts)`);
  }
  if (claimed === "remotely-attested" && !attestation) {
    errors.push("remotely-attested classification requires attestation artifact");
  }
  if (earned && claimed !== earned && claimed !== "candidate" && claimed !== "locally-frozen") {
    if (classificationOutranks(claimed, earned)) {
      errors.push(`claimed classification ${claimed} not supported; earned ${earned ?? "none"}`);
    }
  }

  if (state?.manifestSha256 && state.manifestSha256 !== manifest.manifestSha256) {
    errors.push("state manifestSha256 inconsistent with manifest");
  }

  return {
    packId: pack.packId,
    classification: claimed,
    earnedClassification: earned,
    valid: errors.length === 0,
    errors,
    manifestSha256: manifest.manifestSha256,
    freezeCommitSha,
    traceSetHash,
    resultSetHash: computedResultSetHash ?? resultSetHash,
    reportHash,
    remoteAttestation: attestation
      ? { workflowRunId: attestation.workflowRunId, workflowRunUrl: attestation.workflowRunUrl }
      : null,
  };
}

function classificationOutranks(claimed, earned) {
  const order = ["unsealed-regression", "candidate", "locally-frozen", "remotely-attested", "sealed"];
  return order.indexOf(claimed) > order.indexOf(earned ?? "");
}

async function readResultsJsonl(root, relPath) {
  try {
    return await readFile(join(root, relPath), "utf8");
  } catch {
    return null;
  }
}

/** Fail closed for sealed packs: result-set hash and raw results must be present and consistent. */
export async function verifySealedResultSet(root, pack, state, claimed, errors) {
  if (claimed !== "sealed") return null;

  const resultsPath = join(pack.reportsDir, "results.jsonl").replace(/\\/g, "/");
  const rawContent = await readResultsJsonl(root, resultsPath);
  if (rawContent === null) {
    errors.push("sealed classification requires committed results.jsonl");
    return null;
  }

  const lines = rawContent.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    errors.push("sealed classification requires non-empty results.jsonl");
  }

  if (!state?.resultSetHash) {
    errors.push("sealed classification requires state.resultSetHash");
  }

  const computed = await hashJsonlSet(root, resultsPath);
  if (!computed) {
    errors.push("sealed classification results.jsonl not hashable");
    return null;
  }

  if (state?.resultSetHash && state.resultSetHash !== computed) {
    errors.push("result-set hash mismatch (tampered results)");
  }

  return computed;
}

export async function verifyPack(root, { manifestPath, packId, attestationPath } = {}) {
  if (packId === HOLDOUT_V01.packId || packId === HOLDOUT_V01.benchmarkVersion) {
    return verifyHoldoutV01(root);
  }
  if (packId === HOLDOUT_V02.packId || packId === HOLDOUT_V02.benchmarkVersion) {
    return verifyProtocolPack(root, manifestPath ?? HOLDOUT_V02.splitManifest, { attestationPath });
  }
  if (!manifestPath) {
    throw new VerifyError("--manifest or --pack required");
  }
  return verifyProtocolPack(root, manifestPath, { attestationPath });
}

export { attestationBindingHash, validateAttestationShape };
