import { generateSamplerTraces } from "./unit-sampler.mjs";

export function samplerCanaryManifestDraft(packId = "sampler-canary") {
  return {
    packId,
    benchmarkVersion: `${packId}-v1`,
    label: "sampler-canary",
    repositoryIds: ["synthetic"],
    mutationFamilies: ["interior-edit"],
    seeds: { traceSelection: "canary-seed-001" },
    samplingRules: { method: "sha256(commit + selector + scenario)", unitsPerFamily: 1 },
    metrics: ["exact-current-precision", "required-current-recall"],
    gates: { requiredRecallMin: 1, staleBytesMax: 0, duplicateUnitsMax: 0 },
    exclusions: [],
    reposLockPath: "bench/repos.lock.json",
  };
}

export async function generateSamplerCanaryTraces(args) {
  return generateSamplerTraces(args);
}
