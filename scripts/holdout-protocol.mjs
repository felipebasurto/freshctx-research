#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateInsertBeforeLabTraces,
  runInsertBeforeLab,
} from "../bench/insert-before-lab.mjs";
import {
  ProtocolError,
  defaultReportFormatter,
  freezePack,
  generatePack,
  reportPack,
  runPack,
  syntheticFixtureRun,
  syntheticFixtureTrace,
} from "../bench/holdout-protocol.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      flags[key] = value ?? true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function usage() {
  process.stderr.write(`Usage:
  holdout-protocol.mjs freeze --manifest=<path> [--pack=<id>]
  holdout-protocol.mjs generate --manifest=<path> [--generator=insert-before-lab]
  holdout-protocol.mjs run --manifest=<path> [--runner=insert-before-lab]
  holdout-protocol.mjs report --manifest=<path>

Phases are ordered: freeze → commit manifest → generate → run → report.
`);
}

async function loadManifestDraft(manifestPath, flags) {
  const packId = flags.pack ?? flags.manifest?.replace(/^bench\/splits\//, "").replace(/\.json$/, "") ?? "holdout-pack";
  return {
    packId,
    benchmarkVersion: flags.benchmarkVersion ?? `${packId}-v1`,
    label: flags.label ?? "public-repo-holdout",
    repositoryIds: flags.repos ? flags.repos.split(",") : [],
    mutationFamilies: flags.families ? flags.families.split(",") : ["interior-edit"],
    seeds: { traceSelection: flags.seed ?? "protocol-default-seed" },
    samplingRules: {
      method: "sha256(commit + selector + scenario)",
      unitsPerFamily: Number(flags.unitsPerFamily ?? 1),
    },
    metrics: [
      "exact-current-precision",
      "required-current-recall",
      "stale-unit-rate",
      "duplicate-units",
      "projection-bytes",
    ],
    gates: {
      requiredRecallMin: 1,
      staleBytesMax: 0,
      duplicateUnitsMax: 0,
    },
    exclusions: [],
  };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv);
  const phase = positional[0];
  const manifestPath = flags.manifest;
  if (!phase || !manifestPath) {
    usage();
    process.exitCode = 1;
    return;
  }

  try {
    if (phase === "freeze") {
      const draft = await loadManifestDraft(manifestPath, flags);
      const result = await freezePack(ROOT, manifestPath, draft);
      process.stdout.write(
        `${JSON.stringify(
          {
            phase: "freeze",
            manifestPath: result.manifestPath,
            manifestSha256: result.manifestSha256,
            frozenAt: result.frozenAt,
            implementationCommitSha: result.implementationCommitSha,
            reposLockSha256: result.reposLockSha256,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    if (phase === "generate") {
      const generator = flags.generator === "insert-before-lab"
        ? generateInsertBeforeLabTraces
        : syntheticFixtureTrace;
      const result = await generatePack(ROOT, manifestPath, generator);
      process.stdout.write(`${JSON.stringify({ phase: "generate", ...result.provenance }, null, 2)}\n`);
      return;
    }

    if (phase === "run") {
      const runner = flags.runner === "insert-before-lab" ? runInsertBeforeLab : syntheticFixtureRun;
      const result = await runPack(ROOT, manifestPath, runner);
      process.stdout.write(`${JSON.stringify({ phase: "run", ...result.provenance }, null, 2)}\n`);
      return;
    }

    if (phase === "report") {
      const result = await reportPack(ROOT, manifestPath, defaultReportFormatter);
      process.stdout.write(
        `${JSON.stringify(
          {
            phase: "report",
            reportPath: result.reportPath,
            freezeCommitSha: result.runProvenance.freezeCommitSha,
            manifestSha256: result.manifest.manifestSha256,
            implementationCommitSha: result.runProvenance.implementationCommitSha,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    usage();
    process.exitCode = 1;
  } catch (error) {
    if (error instanceof ProtocolError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

await main();
