#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function parseEvaluateOutput(text) {
  const lines = String(text).split("\n");
  const verdictIndex = lines.findIndex((line) => line.startsWith("EVALUATE_VERDICT="));
  if (verdictIndex === -1) throw new Error("no EVALUATE_VERDICT line in evaluate output");
  const json = lines.slice(verdictIndex + 1).join("\n");
  // The JSON record ends at the first line that is exactly "}".
  const end = json.indexOf("\n}\n");
  const record = JSON.parse(end === -1 ? json : json.slice(0, end + 2));
  const bytes = record?.comparison?.payloadBytes;
  const recall = record?.comparison?.oracleRetention;
  if (!bytes || !recall) throw new Error("evaluate record lacks comparison.payloadBytes/oracleRetention");
  return {
    candidate: bytes.candidate,
    baseline: bytes.baseline,
    hits: recall.hits,
    required: recall.requiredCount,
  };
}

export function parseReadmeRecordedEvaluation(readme) {
  const candidate = /\| Isolated Semantic Engine \| (\d+) payload bytes \|/u.exec(readme);
  const baseline = /\| Whole-file baseline \(`corvus-file`\) \| (\d+) payload bytes \|/u.exec(readme);
  const recall = /Required recall was \*\*(\d+)\/(\d+)\*\*/u.exec(readme);
  if (!candidate || !baseline || !recall) {
    throw new Error("README.md Recorded evaluation table not found in the expected shape");
  }
  return {
    candidate: Number(candidate[1]),
    baseline: Number(baseline[1]),
    hits: Number(recall[1]),
    required: Number(recall[2]),
  };
}

export function compareRecordedEvaluation(measured, recorded) {
  const mismatches = [];
  for (const key of ["candidate", "baseline", "hits", "required"]) {
    if (measured[key] !== recorded[key]) {
      mismatches.push(`${key}: README says ${recorded[key]}, evaluate printed ${measured[key]}`);
    }
  }
  return mismatches;
}

function parseArgs(argv) {
  const flags = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    flags[eq === -1 ? arg.slice(2) : arg.slice(2, eq)] = eq === -1 ? true : arg.slice(eq + 1);
  }
  return flags;
}

// Same CLI-detection idiom as autoresearch/evaluate.mjs:119-120.
const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const flags = parseArgs(process.argv);
  if (typeof flags.input !== "string") {
    process.stderr.write("usage: check-recorded-evaluation --input=<file with npm run evaluate stdout>\n");
    process.exit(2);
  }
  const measured = parseEvaluateOutput(await readFile(flags.input, "utf8"));
  const recorded = parseReadmeRecordedEvaluation(await readFile(join(ROOT, "README.md"), "utf8"));
  const mismatches = compareRecordedEvaluation(measured, recorded);
  if (mismatches.length > 0) {
    process.stderr.write(`recorded-evaluation: README.md is stale\n  ${mismatches.join("\n  ")}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `recorded-evaluation: README matches evaluate (${measured.candidate} / ${measured.baseline} / ${measured.hits}/${measured.required})\n`,
  );
}
