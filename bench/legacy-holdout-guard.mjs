import { HOLDOUT_V01, PROTOCOL_COMMAND_HINT, assertHoldoutV01LegacyEntrypoint } from "./holdout-identity.mjs";

export { HOLDOUT_V01, PROTOCOL_COMMAND_HINT };

/**
 * Gate legacy holdout entrypoints. Only v0.1 unsealed-regression may pass.
 * @param {string} entrypoint - npm script or script path name
 * @param {{ packId?: string, tracesDir?: string, targetPack?: string }} [opts]
 */
export function guardLegacyHoldoutEntrypoint(entrypoint, opts = {}) {
  const { packId, tracesDir, targetPack } = opts;

  if (packId && !packId.match(/^holdout-v0\.1$/)) {
    assertHoldoutV01LegacyEntrypoint(entrypoint, { packId });
  }

  if (targetPack && targetPack !== HOLDOUT_V01.packId && targetPack !== HOLDOUT_V01.benchmarkVersion) {
    const err = new Error(
      `${entrypoint} cannot target pack "${targetPack}". ${PROTOCOL_COMMAND_HINT}`,
    );
    err.name = "LegacyHoldoutError";
    throw err;
  }

  if (tracesDir && tracesDir !== HOLDOUT_V01.tracesDir) {
    const err = new Error(
      `${entrypoint} writes only to ${HOLDOUT_V01.tracesDir}. ` +
        `Trace dir "${tracesDir}" requires holdout:generate. ${PROTOCOL_COMMAND_HINT}`,
    );
    err.name = "LegacyHoldoutError";
    throw err;
  }
}

export function formatLegacyV01ProvenanceHeaderSync(sha256, {
  implementationCommitSha,
  lockContent,
  repositoryLocks,
  traceSetHash,
  resultSetHash,
}) {
  const lockHash = lockContent ? sha256(lockContent) : "none";
  const lockLines = repositoryLocks
    ? Object.entries(repositoryLocks).map(([id, commit]) => `- ${id} lock SHA: \`${commit}\``)
    : [];
  return [
    "## Provenance",
    "",
    `- pack ID: \`${HOLDOUT_V01.packId}\``,
    `- classification: \`${HOLDOUT_V01.classification}\` (permanently unsealed; not preregistered)`,
    `- freeze commit: none — unsealed-regression`,
    `- manifest hash: none (predates protocol manifests)`,
    `- implementation commit: \`${implementationCommitSha}\``,
    `- repos.lock SHA-256: \`${lockHash}\``,
    ...lockLines,
    `- trace-set hash: \`${traceSetHash ?? "none"}\``,
    `- result-set hash: \`${resultSetHash ?? "none"}\``,
    `- remote attestation: none — unsealed-regression pack predates remote freeze workflow`,
    "",
  ].join("\n");
}
