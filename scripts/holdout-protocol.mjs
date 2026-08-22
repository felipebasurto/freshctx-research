#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateInsertBeforeLabTraces,
  runInsertBeforeLab,
} from "../bench/insert-before-lab.mjs";
import {
  generateInsertBeforeInteriorLabTraces,
  insertBeforeInteriorLabManifestDraft,
  runInsertBeforeInteriorLab,
} from "../bench/insert-before-interior-lab.mjs";
import {
  generateInsertBeforeTieLabTraces,
  insertBeforeTieLabManifestDraft,
  runInsertBeforeTieLab,
} from "../bench/insert-before-tie-lab.mjs";
import {
  generateInsertBeforeUniqueLastLabTraces,
  insertBeforeUniqueLastLabManifestDraft,
  runInsertBeforeUniqueLastLab,
} from "../bench/insert-before-unique-last-lab.mjs";
import {
  generateGrowInsideLabTraces,
  growInsideLabManifestDraft,
  runGrowInsideLab,
} from "../bench/grow-inside-lab.mjs";
import {
  generateDeleteUnitFailCloseLabTraces,
  deleteUnitFailCloseLabManifestDraft,
  runDeleteUnitFailCloseLab,
} from "../bench/delete-unit-fail-close-lab.mjs";
import {
  generateDeleteUnitLabTraces,
  deleteUnitLabManifestDraft,
  runDeleteUnitLab,
} from "../bench/delete-unit-lab.mjs";
import {
  generateRenameBoundaryLabTraces,
  renameBoundaryLabManifestDraft,
  runRenameBoundaryLab,
} from "../bench/rename-boundary-lab.mjs";
import {
  duplicateBoundaryLabManifestDraft,
  generateDuplicateBoundaryLabTraces,
  runDuplicateBoundaryLab,
} from "../bench/duplicate-boundary-lab.mjs";
import {
  generateMoveInFileLabTraces,
  moveInFileLabManifestDraft,
  runMoveInFileLab,
} from "../bench/move-in-file-lab.mjs";
import {
  generateParseBrokenLabTraces,
  parseBrokenLabManifestDraft,
  runParseBrokenLab,
} from "../bench/parse-broken-lab.mjs";
import {
  generateMoveLookalikeLabTraces,
  moveLookalikeLabManifestDraft,
  runMoveLookalikeLab,
} from "../bench/move-lookalike-lab.mjs";
import {
  ProtocolError,
  defaultReportFormatter,
  freezePack,
  generatePack,
  readManifest,
  reportPack,
  resolvePackPaths,
  runPack,
  syntheticFixtureRun,
  syntheticFixtureTrace,
} from "../bench/holdout-protocol.mjs";
import { readPackState } from "../bench/holdout-state.mjs";

const TRACE_GENERATORS = {
  "insert-before-lab": generateInsertBeforeLabTraces,
  "insert-before-interior-lab": generateInsertBeforeInteriorLabTraces,
  "insert-before-tie-lab": generateInsertBeforeTieLabTraces,
  "insert-before-unique-last-lab": generateInsertBeforeUniqueLastLabTraces,
  "grow-inside-lab": generateGrowInsideLabTraces,
  "delete-unit-lab": generateDeleteUnitLabTraces,
  "delete-unit-fail-close-lab": generateDeleteUnitFailCloseLabTraces,
  "rename-boundary-lab": generateRenameBoundaryLabTraces,
  "move-in-file-lab": generateMoveInFileLabTraces,
  "duplicate-boundary-lab": generateDuplicateBoundaryLabTraces,
  "parse-broken-lab": generateParseBrokenLabTraces,
  "move-lookalike-lab": generateMoveLookalikeLabTraces,
};

const TRACE_RUNNERS = {
  "insert-before-lab": runInsertBeforeLab,
  "insert-before-interior-lab": runInsertBeforeInteriorLab,
  "insert-before-tie-lab": runInsertBeforeTieLab,
  "insert-before-unique-last-lab": runInsertBeforeUniqueLastLab,
  "grow-inside-lab": runGrowInsideLab,
  "delete-unit-lab": runDeleteUnitLab,
  "delete-unit-fail-close-lab": runDeleteUnitFailCloseLab,
  "rename-boundary-lab": runRenameBoundaryLab,
  "move-in-file-lab": runMoveInFileLab,
  "duplicate-boundary-lab": runDuplicateBoundaryLab,
  "parse-broken-lab": runParseBrokenLab,
  "move-lookalike-lab": runMoveLookalikeLab,
};

const MANIFEST_DRAFTS = {
  "insert-before-interior-lab": insertBeforeInteriorLabManifestDraft,
  "insert-before-tie-lab": insertBeforeTieLabManifestDraft,
  "insert-before-unique-last-lab": insertBeforeUniqueLastLabManifestDraft,
  "grow-inside-lab": growInsideLabManifestDraft,
  "delete-unit-lab": deleteUnitLabManifestDraft,
  "delete-unit-fail-close-lab": deleteUnitFailCloseLabManifestDraft,
  "rename-boundary-lab": renameBoundaryLabManifestDraft,
  "move-in-file-lab": moveInFileLabManifestDraft,
  "duplicate-boundary-lab": duplicateBoundaryLabManifestDraft,
  "parse-broken-lab": parseBrokenLabManifestDraft,
  "move-lookalike-lab": moveLookalikeLabManifestDraft,
};

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
  holdout-protocol.mjs freeze --manifest=<path> [--pack=<id>] [--generator=insert-before-interior-lab|insert-before-tie-lab|insert-before-unique-last-lab|grow-inside-lab|delete-unit-lab|delete-unit-fail-close-lab|rename-boundary-lab|move-in-file-lab|duplicate-boundary-lab|parse-broken-lab|move-lookalike-lab]
  holdout-protocol.mjs generate --manifest=<path> [--generator=insert-before-lab|insert-before-interior-lab|insert-before-tie-lab|insert-before-unique-last-lab|grow-inside-lab|delete-unit-lab|delete-unit-fail-close-lab|rename-boundary-lab|move-in-file-lab|duplicate-boundary-lab|parse-broken-lab|move-lookalike-lab]
  holdout-protocol.mjs run --manifest=<path> [--runner=insert-before-lab|insert-before-interior-lab|insert-before-tie-lab|insert-before-unique-last-lab|grow-inside-lab|delete-unit-lab|delete-unit-fail-close-lab|rename-boundary-lab|move-in-file-lab|duplicate-boundary-lab|parse-broken-lab|move-lookalike-lab]
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
      const draftFactory = MANIFEST_DRAFTS[flags.generator];
      const draft = draftFactory ? draftFactory() : await loadManifestDraft(manifestPath, flags);
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
      const generator = TRACE_GENERATORS[flags.generator] ?? syntheticFixtureTrace;
      const result = await generatePack(ROOT, manifestPath, generator);
      process.stdout.write(`${JSON.stringify({ phase: "generate", ...result.provenance }, null, 2)}\n`);
      return;
    }

    if (phase === "run") {
      const runner = TRACE_RUNNERS[flags.runner] ?? syntheticFixtureRun;
      const result = await runPack(ROOT, manifestPath, runner);
      process.stdout.write(`${JSON.stringify({ phase: "run", ...result.provenance }, null, 2)}\n`);
      return;
    }

    if (phase === "report") {
      const manifest = await readManifest(ROOT, manifestPath);
      const pack = resolvePackPaths(ROOT, manifest);
      const state = await readPackState(ROOT, pack);
      const formatter = (args) => {
        if (manifest.packId !== "grow-inside-dev-v0.1") {
          return defaultReportFormatter(args);
        }
        return defaultReportFormatter({
          ...args,
          generateProvenance: {
            ...args.generateProvenance,
            traceSetHash: state?.traceSetHash,
          },
          runProvenance: {
            ...args.runProvenance,
            resultSetHash: state?.resultSetHash,
          },
        });
      };
      const result = await reportPack(ROOT, manifestPath, formatter);
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
