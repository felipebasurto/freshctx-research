import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_BUDGET_CHARS } from "../adapters/request-prune.mjs";
import { FreshCtxEngine } from "../src/engine.mjs";

const CLI_PATH = "src/viajante/cli.py";
const PAD = "x".repeat(39_000);

test("PCR 0080: first-read 39k file is omitted at the 32k default cap", () => {
  const engine = new FreshCtxEngine({ turn: 0 });
  const oldBody = `# MARKER_CLI=CL0\n${PAD}\n`;
  engine.trackRead({ path: CLI_PATH, content: oldBody, scope: "file" });
  const projection = engine.project({ budgetChars: DEFAULT_BUDGET_CHARS });

  assert.equal(DEFAULT_BUDGET_CHARS, 32_768);
  assert.equal(oldBody.length > DEFAULT_BUDGET_CHARS, true);
  assert.equal(projection.selected.length, 0);
  assert.equal(projection.omitted[0].reason, "budget");
  assert.doesNotMatch(projection.text, /CL0/u);
});

test("PCR 0080: refresh that finds new bytes injects them even over the cap", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0080-"));
  try {
    const oldBody = `# MARKER_CLI=CL0\n${PAD}\n`;
    const newBody = `# MARKER_CLI=CL1\n${PAD}\n`;
    const filePath = join(workspace, "cli.py");
    await writeFile(filePath, oldBody, "utf8");

    const engine = new FreshCtxEngine({ turn: 0 });
    engine.trackRead({ path: "cli.py", content: oldBody, scope: "file" });
    const turn0 = engine.project({ budgetChars: DEFAULT_BUDGET_CHARS });
    assert.equal(turn0.selected.length, 0);
    assert.doesNotMatch(turn0.text, /CL0/u);

    await writeFile(filePath, newBody, "utf8");
    engine.turn = 1;
    await engine.refresh(async () => newBody);
    const turn1 = engine.project({ budgetChars: DEFAULT_BUDGET_CHARS });

    assert.equal(turn1.selected.length, 1);
    assert.match(turn1.text, /CL1/u);
    assert.doesNotMatch(turn1.text, /CL0/u);
    assert.doesNotMatch(turn1.text, /unchanged="true"/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
