import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const V01_TRACE = join(ROOT, "bench/traces/holdout/go-tools-interior-edit.json");

export async function loadInteriorEditDoorTrace() {
  return JSON.parse(await readFile(V01_TRACE, "utf8"));
}

export function interiorEditDevManifestDraft() {
  return {
    packId: "interior-edit-dev-v0.1",
    benchmarkVersion: "interior-edit-dev-v0.1",
    label: "interior-edit-dev",
    repositoryIds: ["go-tools"],
    mutationFamilies: ["interior-edit"],
    seeds: { traceSelection: "interior-edit-dev-v0.1" },
    samplingRules: { method: "copied-v01-parsefile-body-door", unitsPerFamily: 1 },
    metrics: ["exact-current-precision", "required-current-recall"],
    gates: { requiredRecallMin: 0, staleBytesMax: 0, duplicateUnitsMax: 0 },
    exclusions: [],
    reposLockPath: "bench/repos.lock.json",
    notATuningSet: true,
    copiesFailureClass: "go-tools/interior-edit/parse-file-body",
  };
}
