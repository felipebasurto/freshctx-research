export const HOLDOUT_V03_GENERATOR_PATH = "bench/generate-apex-pack.mjs";

export function holdoutV03ManifestDraft() {
  return {
    packId: "holdout-v0.3-apex",
    benchmarkVersion: "holdout-v0.3-apex",
    label: "public-repo-holdout-v0.3-apex",
    repositoryIds: ["flask", "express", "go-tools", "ripgrep"],
    mutationFamilies: ["interior-edit"],
    seeds: { traceSelection: "holdout-v0.3-apex-bind" },
    samplingRules: { method: "sha256(commit + selector + scenario)", unitsPerFamily: 1 },
    metrics: ["payload-bytes", "required-current-recall", "peak-rss", "latency-p95"],
    gates: { requiredRecallMin: 1, staleBytesMax: 0, duplicateUnitsMax: 0 },
    exclusions: [],
    reposLockPath: "bench/repos.lock.json",
    notATuningSet: true,
    bindExisting: true,
    generatorPath: HOLDOUT_V03_GENERATOR_PATH,
    goldSource: "independent-symbols",
  };
}

export async function bindHoldoutV03Traces() {
  throw new Error("holdout-v0.3-apex is bind-existing only; refuse to regenerate traces");
}
