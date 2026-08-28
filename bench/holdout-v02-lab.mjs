import { generateSamplerTraces } from "./unit-sampler.mjs";

export function holdoutV02ManifestDraft() {
  return {
    packId: "holdout-v0.2",
    benchmarkVersion: "holdout-v0.2",
    label: "public-repo-holdout-v0.2",
    repositoryIds: ["flask"],
    mutationFamilies: ["interior-edit"],
    seeds: { traceSelection: "holdout-v0.2-sampler" },
    samplingRules: { method: "sha256(commit + selector + scenario)", unitsPerFamily: 2 },
    metrics: ["exact-current-precision", "required-current-recall", "stale-unit-rate"],
    gates: { requiredRecallMin: 0, staleBytesMax: 0, duplicateUnitsMax: 0 },
    exclusions: [],
    reposLockPath: "bench/repos.lock.json",
    notATuningSet: true,
  };
}

export async function generateHoldoutV02Traces(args) {
  return generateSamplerTraces({
    ...args,
    files: args.files ?? {
      "src/alpha.py": "def alpha():\n    return 1\n",
      "src/beta.py": "def beta():\n    return 2\n",
      "vendor/skip.py": "def skip():\n    return 0\n",
      "notes.txt": "not source\n",
    },
  });
}
