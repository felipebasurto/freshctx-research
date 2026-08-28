#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { sampleUnits, sampleWorkspace, rankKey, classifyPath } from "./unit-sampler.mjs";

export { classifyPath, rankKey, sampleUnits, sampleWorkspace } from "./unit-sampler.mjs";

function parseArgs(argv) {
  const flags = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    flags[key] = value ?? true;
  }
  return flags;
}

export async function writeSample({ sample, outDir }) {
  await mkdir(outDir, { recursive: true });
  const { bodies: _bodies, ...record } = sample;
  const candidatesPath = join(outDir, "candidates.json");
  const rejectedPath = join(outDir, "candidates-rejected.json");
  await writeFile(candidatesPath, `${JSON.stringify({ ...record, rejected: undefined, selected: record.selected }, null, 2)}\n`);
  await writeFile(rejectedPath, `${JSON.stringify({ rejected: record.rejected }, null, 2)}\n`);
  return { candidatesPath, rejectedPath, selected: record.selected.length, rejected: record.rejected.length };
}

const isMain = process.argv[1] && process.argv[1].endsWith("sample-units.mjs");
if (isMain) {
  const flags = parseArgs(process.argv);
  const workspaceRoot = flags.workspace ?? flags.root;
  if (!workspaceRoot) {
    process.stderr.write("usage: node bench/sample-units.mjs --workspace=<dir> --commit=<sha> --scenario=<name> [--n=10] [--out=dir]\n");
    process.exitCode = 1;
  } else {
    const sample = await sampleWorkspace({
      workspaceRoot,
      commit: String(flags.commit ?? "0".repeat(40)),
      scenario: String(flags.scenario ?? "interior-edit"),
      repoId: String(flags.repo ?? "workspace"),
      n: Number(flags.n ?? 10),
    });
    const outDir = flags.out ? flags.out : join(dirname(workspaceRoot), "sample-out");
    const written = await writeSample({ sample, outDir });
    process.stdout.write(`${JSON.stringify({ ...written, commit: sample.commit, n: sample.n }, null, 2)}\n`);
  }
}
