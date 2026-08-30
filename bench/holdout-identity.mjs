/** Hard-coded v0.1 holdout identity — the only pack allowed through legacy entrypoints. */
export const HOLDOUT_V01 = Object.freeze({
  packId: "holdout-v0.1",
  benchmarkVersion: "holdout-v0.1",
  tracesDir: "bench/traces/holdout",
  reportsDir: "bench/reports",
  reportMarkdown: "bench/reports/holdout.md",
  resultsJsonl: "bench/reports/public-repo-holdout.jsonl",
  splitManifest: "bench/corpus-split.json",
  label: "public-repo-holdout",
  classification: "unsealed-regression",
});

/** Machine-readable pack classification states. Only the protocol may advance a pack. */
export const PACK_CLASSIFICATIONS = Object.freeze([
  "unsealed-regression",
  "candidate",
  "locally-frozen",
  "remotely-attested",
  "sealed",
]);

export const PROTOCOL_COMMAND_HINT =
  "Use npm run holdout:freeze → commit → holdout:generate → holdout:run → holdout:report → holdout:verify";

export const HOLDOUT_V02 = Object.freeze({
  packId: "holdout-v0.2",
  benchmarkVersion: "holdout-v0.2",
  splitManifest: "bench/splits/holdout-v0.2.json",
  label: "public-repo-holdout-v0.2",
});

export const HOLDOUT_V03 = Object.freeze({
  packId: "holdout-v0.3-apex",
  benchmarkVersion: "holdout-v0.3-apex",
  splitManifest: "bench/splits/holdout-v0.3-apex.json",
  label: "public-repo-holdout-v0.3-apex",
});

export function isHoldoutV01Pack(packIdOrVersion) {
  return packIdOrVersion === HOLDOUT_V01.packId || packIdOrVersion === HOLDOUT_V01.benchmarkVersion;
}

export function assertHoldoutV01LegacyEntrypoint(entrypoint, { packId } = {}) {
  if (packId && !isHoldoutV01Pack(packId)) {
    const err = new Error(
      `${entrypoint} accepts only hard-coded holdout v0.1 (${HOLDOUT_V01.packId}). ` +
        `Pack "${packId}" requires the protocol pipeline. ${PROTOCOL_COMMAND_HINT}`,
    );
    err.name = "LegacyHoldoutError";
    throw err;
  }
}
