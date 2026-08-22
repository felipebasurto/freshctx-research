#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  budgetPressureLabManifestDraft,
  generateBudgetPressureLabTraces,
} from "../bench/budget-pressure-lab.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const holdoutDir = join(ROOT, "bench", "traces", "holdout");

const { traces } = await generateBudgetPressureLabTraces({ root: ROOT, holdoutDir });

const draft = budgetPressureLabManifestDraft();
const manifestBody = {
  schemaVersion: 2,
  protocolVersion: 1,
  ...draft,
  frozenAt: new Date().toISOString(),
  implementationCommitSha: "pending",
  reposLockSha256: "4a9322215bba289c56be444c5547fffb077f53424ff9573d046869e013870067",
  repositoryLocks: {
    "go-tools": "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49",
    neovim: "2dd6e9d6a2482069cfe9d12a09f761c5713f246b",
  },
  classification: "candidate",
};
manifestBody.manifestSha256 = createHash("sha256")
  .update(JSON.stringify(manifestBody))
  .digest("hex");

await mkdir(join(ROOT, "bench", "splits"), { recursive: true });
await writeFile(
  join(ROOT, "bench/splits/budget-pressure-dev-v0.1.json"),
  `${JSON.stringify(manifestBody, null, 2)}\n`,
);

console.log(JSON.stringify({ tracesWritten: traces.length, names: traces.map((trace) => trace.name) }, null, 2));
