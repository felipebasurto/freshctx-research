import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  handleForceHostReadToolCall,
} from "../docs/lab/hermes-trial-ts/force-host-read.mjs";
import {
  readToolMatchesHostArgs,
  t1HostReadToolsInvalidReason,
  t1HostReadToolsValid,
} from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  TARGET_FILE,
  TARGET_SYMBOL,
  hostReadToolArgs,
  isDestRootSettlementPath,
  isDestRootSettlementSearch,
} from "../docs/lab/pi-trial-ts/pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const destRoot = join(here, "..");
const fixtureSource = join(here, "../docs/lab/pi-trial-ts/fixture/src/settlement.ts");

const WORKSPACE_KEYS = ["FRESHCTX_CWD", "HERMES_TRIAL_WORKSPACE", "PI_TRIAL_WORKSPACE"];

function snapshotWorkspaceEnv() {
  return Object.fromEntries(WORKSPACE_KEYS.map((key) => [key, process.env[key]]));
}

function restoreWorkspaceEnv(prior) {
  for (const key of WORKSPACE_KEYS) {
    if (prior[key] === undefined) delete process.env[key];
    else process.env[key] = prior[key];
  }
}

test("dest-root src/settlement.ts is still missing; engine .mjs only", () => {
  assert.equal(existsSync(join(destRoot, TARGET_FILE)), false);
  assert.equal(existsSync(join(destRoot, "src/engine.mjs")), true);
});

test("relative and abs dest-root settlement paths are dest-root when workspace is .work", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-pcr-0145-paths-"));
  try {
    const dest = join(tempRoot, "dest");
    const work = join(dest, ".work", "freshctx-ts");
    await mkdir(join(dest, "src"), { recursive: true });
    await writeFile(join(dest, "src/engine.mjs"), "export const engine = true;\n");
    await mkdir(join(work, "src"), { recursive: true });
    await writeFile(join(work, TARGET_FILE), await readFile(fixtureSource, "utf8"));

    assert.equal(isDestRootSettlementPath(TARGET_FILE, { workspace: work, destRoot: dest }), true);
    assert.equal(isDestRootSettlementPath(join(dest, TARGET_FILE), { workspace: work, destRoot: dest }), true);
    assert.equal(isDestRootSettlementPath(join(work, TARGET_FILE), { workspace: work, destRoot: dest }), false);
    assert.equal(
      isDestRootSettlementSearch(
        { toolName: "search_files", args: { path: TARGET_FILE } },
        { workspace: work, destRoot: dest },
      ),
      true,
    );
    assert.equal(
      isDestRootSettlementSearch(
        { toolName: "search_files", args: { path: join(dest, TARGET_FILE) } },
        { workspace: work, destRoot: dest },
      ),
      true,
    );
    assert.equal(
      isDestRootSettlementSearch(
        { toolName: "search_files", args: { path: join(work, TARGET_FILE) } },
        { workspace: work, destRoot: dest },
      ),
      false,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("dest-root search_files is not a t1 match and does not miss when fixture read hits .work", async () => {
  const prior = snapshotWorkspaceEnv();
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-pcr-0145-dest-"));
  try {
    const dest = join(tempRoot, "dest");
    const work = join(dest, ".work", "freshctx-ts");
    await mkdir(join(dest, "src"), { recursive: true });
    await writeFile(join(dest, "src/engine.mjs"), "export const engine = true;\n");
    await mkdir(join(work, "src"), { recursive: true });
    await writeFile(join(work, TARGET_FILE), await readFile(fixtureSource, "utf8"));

    const fixtureRead = {
      toolName: "read_file",
      args: hostReadToolArgs({ workspace: work }),
    };
    assert.equal(readToolMatchesHostArgs(fixtureRead, { workspace: work }), true);

    const relativeDestSearch = { toolName: "search_files", args: { path: TARGET_FILE } };
    const absDestSearch = { toolName: "search_files", args: { path: join(dest, TARGET_FILE) } };

    assert.equal(
      t1HostReadToolsValid([relativeDestSearch], { workspace: work, destRoot: dest }),
      false,
      "dest-root search_files alone must not pass as the t1 match",
    );
    assert.match(
      t1HostReadToolsInvalidReason([absDestSearch], { workspace: work, destRoot: dest }),
      /dest-root search_files/u,
    );

    assert.equal(
      t1HostReadToolsValid([absDestSearch, fixtureRead], { workspace: work, destRoot: dest }),
      true,
      "nothing-arm abs dest-root search must not count as a t1 miss when .work read hits",
    );
    assert.equal(
      t1HostReadToolsValid([relativeDestSearch, fixtureRead], { workspace: work, destRoot: dest }),
      true,
      "freshctx relative dest-root search must not count as a t1 miss when .work read hits",
    );
    assert.equal(
      t1HostReadToolsInvalidReason(
        [
          { toolName: "search_files", args: { path: join(dest, TARGET_FILE) } },
          fixtureRead,
        ],
        { workspace: work, destRoot: dest },
      ),
      null,
    );
  } finally {
    restoreWorkspaceEnv(prior);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("force-host-read fail-closes dest-root settlement search_files", async () => {
  const prior = snapshotWorkspaceEnv();
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-pcr-0145-block-"));
  try {
    const dest = join(tempRoot, "dest");
    const work = join(dest, ".work", "freshctx-ts");
    await mkdir(join(dest, "src"), { recursive: true });
    await writeFile(join(dest, "src/engine.mjs"), "export const engine = true;\n");
    await mkdir(join(work, "src"), { recursive: true });
    await writeFile(join(work, TARGET_FILE), await readFile(fixtureSource, "utf8"));

    process.env.HERMES_TRIAL_WORKSPACE = work;
    process.env.FRESHCTX_CWD = work;
    const state = { hostReadSatisfied: false };

    const blockedRelative = handleForceHostReadToolCall(
      { toolName: "search_files", args: { path: TARGET_FILE } },
      state,
    );
    assert.equal(blockedRelative?.block, true);

    const blockedAbs = handleForceHostReadToolCall(
      { toolName: "search_files", args: { path: join(dest, TARGET_FILE) } },
      state,
    );
    assert.equal(blockedAbs?.block, true);

    const fixtureSearch = handleForceHostReadToolCall(
      { toolName: "search_files", args: { path: join(work, TARGET_FILE) } },
      state,
    );
    assert.equal(fixtureSearch, null);

    const read = handleForceHostReadToolCall(
      { toolName: "read_file", args: { path: join(dest, TARGET_FILE) } },
      state,
    );
    assert.equal(read, null);
    assert.equal(state.hostReadSatisfied, true);
    assert.equal(existsSync(join(work, TARGET_FILE)), true);
    assert.deepEqual(hostReadToolArgs({ workspace: work }), {
      path: join(work, TARGET_FILE),
      scope: "symbol",
      selector: TARGET_SYMBOL,
    });
  } finally {
    restoreWorkspaceEnv(prior);
    await rm(tempRoot, { recursive: true, force: true });
  }
});
