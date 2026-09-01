import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { safeWorkspaceFile } from "../adapters/hermes/bridge.mjs";
import { applyForceHostReadInput } from "../docs/lab/hermes-trial-ts/force-host-read.mjs";
import {
  envWithForceHostRead,
  readToolMatchesHostArgs,
  t1HostReadToolsInvalidReason,
} from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import { hermesEnvForArm } from "../docs/lab/hermes-trial-ts/launch-hermes.mjs";
import {
  TARGET_FILE,
  TARGET_SYMBOL,
  hostReadToolArgs,
  resolveHostReadWorkspace,
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

test("dest-root src/settlement.ts is missing; engine .mjs only", () => {
  assert.equal(existsSync(join(destRoot, TARGET_FILE)), false);
  assert.equal(existsSync(join(destRoot, "src/engine.mjs")), true);
});

test("hostReadToolArgs without workspace stays relative src/settlement.ts", () => {
  const prior = snapshotWorkspaceEnv();
  try {
    for (const key of WORKSPACE_KEYS) delete process.env[key];
    assert.deepEqual(hostReadToolArgs(), {
      path: TARGET_FILE,
      scope: "symbol",
      selector: TARGET_SYMBOL,
    });
    assert.equal(resolveHostReadWorkspace({}), null);
  } finally {
    restoreWorkspaceEnv(prior);
  }
});

test("force-host-read remaps dest-root abs src/settlement.ts to .work/<arm> fixture", async () => {
  const prior = snapshotWorkspaceEnv();
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-pcr-0143-dest-"));
  try {
    const dest = join(tempRoot, "dest");
    const work = join(dest, ".work", "freshctx-ts");
    await mkdir(join(dest, "src"), { recursive: true });
    await writeFile(join(dest, "src/engine.mjs"), "export const engine = true;\n");
    await mkdir(join(work, "src"), { recursive: true });
    await writeFile(join(work, TARGET_FILE), await readFile(fixtureSource, "utf8"));

    assert.equal(existsSync(join(dest, TARGET_FILE)), false);
    assert.equal(existsSync(join(work, TARGET_FILE)), true);
    assert.equal(resolveHostReadWorkspace({ FRESHCTX_CWD: dest }), null);
    assert.equal(resolveHostReadWorkspace({ HERMES_TRIAL_WORKSPACE: work }), work);

    const forced = hostReadToolArgs({ workspace: work });
    assert.equal(forced.path, join(work, TARGET_FILE));
    assert.equal(forced.scope, "symbol");
    assert.equal(forced.selector, TARGET_SYMBOL);

    process.env.HERMES_TRIAL_WORKSPACE = work;
    const input = { path: join(dest, TARGET_FILE), offset: 1, limit: 40 };
    applyForceHostReadInput(input);
    assert.equal(input.path, join(work, TARGET_FILE));
    assert.equal(existsSync(input.path), true);
    assert.equal(input.scope, "symbol");
    assert.equal(input.selector, TARGET_SYMBOL);
    assert.equal(input.offset, undefined);
    assert.equal(input.limit, undefined);

    assert.equal(
      readToolMatchesHostArgs(
        { toolName: "read_file", args: { path: join(dest, TARGET_FILE), scope: "symbol", selector: TARGET_SYMBOL } },
        { workspace: work },
      ),
      false,
    );
    assert.equal(
      readToolMatchesHostArgs(
        { toolName: "read_file", args: hostReadToolArgs({ workspace: work }) },
        { workspace: work },
      ),
      true,
    );
    assert.match(
      t1HostReadToolsInvalidReason(
        [{ toolName: "read_file", args: { path: join(dest, TARGET_FILE), scope: "symbol", selector: TARGET_SYMBOL } }],
        { workspace: work },
      ),
      /scope=symbol/u,
    );

    await assert.rejects(() => safeWorkspaceFile(dest, join(dest, TARGET_FILE)));
    const hit = await safeWorkspaceFile(dest, join(work, TARGET_FILE));
    assert.match(hit.content, /export function settleDailyLedger/u);
    assert.doesNotMatch(hit.content, /export const engine/u);
  } finally {
    restoreWorkspaceEnv(prior);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("Hermes launch env points FreshCtx and force-host-read at the work fixture", () => {
  const workspace = "/tmp/freshctx-pcr-0143-work/freshctx-ts";
  const env = hermesEnvForArm({
    arm: "freshctx-ts",
    proxyBaseUrl: "http://127.0.0.1:9/v1",
    dumpDir: "/tmp/freshctx-pcr-0143-dump",
    hermesHome: "/tmp/freshctx-pcr-0143-home",
    workspace,
  });
  assert.equal(env.FRESHCTX_CWD, workspace);
  assert.equal(env.HERMES_TRIAL_WORKSPACE, workspace);
  const wrapped = envWithForceHostRead({ OPENAI_MODEL: "deepseek-v4-flash" }, { workspace });
  assert.equal(wrapped.FRESHCTX_CWD, workspace);
  assert.equal(wrapped.HERMES_TRIAL_WORKSPACE, workspace);
});

test("Hermes engine payload cwd prefers FRESHCTX_CWD over dest-root getcwd", async () => {
  const python = await readFile(join(here, "../adapters/hermes/__init__.py"), "utf8");
  assert.match(python, /FRESHCTX_CWD/u);
  assert.match(python, /HERMES_TRIAL_WORKSPACE/u);
  assert.match(python, /def _workspace_cwd/u);
});
