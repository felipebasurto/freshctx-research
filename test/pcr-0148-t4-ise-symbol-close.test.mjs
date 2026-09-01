import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildReadToolCall as buildHermesReadToolCall,
  buildToolResultMessage as buildHermesToolResultMessage,
  createHermesAdapter,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import {
  buildReadToolCall,
  buildToolResultMessage,
  createPiAdapter,
} from "../adapters/pi/replay.mjs";
import {
  resolveProjectionText,
  shouldCollapseCurrentProjection,
} from "../adapters/request-prune.mjs";
import { resolutionFromStringifiedPayload } from "../docs/lab/pi-trial-ts/resolution-from-stringified.mjs";
import { MARKER_V2, TARGET_SYMBOL } from "../docs/lab/multi-turn-trial/pack.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SYMBOL_PATH = "src/settlement.ts";
const CALL_ID = "call-settle-daily";

const BODIES = {
  ST0: `export function ${TARGET_SYMBOL}() {\n  const MARKER_SETTLE = "ST0";\n  return MARKER_SETTLE;\n}\n`,
  ST1: `export function ${TARGET_SYMBOL}() {\n  const MARKER_SETTLE = "ST1";\n  return MARKER_SETTLE;\n}\n`,
  ST2: `export function ${TARGET_SYMBOL}() {\n  const MARKER_SETTLE = "ST2";\n  return MARKER_SETTLE;\n}\n`,
};

function isolatedSemanticEngineRunner() {
  return async ({ bytes }) => {
    const lines = String(bytes ?? "").replaceAll("\r\n", "\n").split("\n");
    const endLine = lines.at(-1) === "" ? lines.length - 1 : lines.length;
    return {
      error: null,
      units: [
        {
          selector: TARGET_SYMBOL,
          qualifiedSelector: TARGET_SYMBOL,
          startLine: 1,
          endLine,
        },
      ],
    };
  };
}

function laterMessages(prior, assistant, user) {
  return [
    ...structuredClone(prior),
    { role: "assistant", content: assistant },
    { role: "user", content: user },
  ];
}

function piSymbolMessages(observed) {
  return [
    buildReadToolCall({
      toolCallId: CALL_ID,
      path: SYMBOL_PATH,
      scope: "symbol",
      selector: TARGET_SYMBOL,
    }),
    buildToolResultMessage({ toolCallId: CALL_ID, content: observed }),
    { role: "user", content: `quote MARKER_SETTLE in ${TARGET_SYMBOL}` },
  ];
}

function hermesSymbolMessages(observed) {
  return [
    buildHermesReadToolCall({
      toolCallId: CALL_ID,
      path: SYMBOL_PATH,
      scope: "symbol",
      selector: TARGET_SYMBOL,
    }),
    buildHermesToolResultMessage({ toolCallId: CALL_ID, content: observed }),
    { role: "user", content: `quote MARKER_SETTLE in ${TARGET_SYMBOL}` },
  ];
}

function assertClosedIsolatedSemanticEngine(label, projectionText, requestMessages) {
  assert.match(
    projectionText,
    /resolution="isolated-semantic-engine"/u,
    `${label} live tail must close Isolated Semantic Engine`,
  );
  assert.match(projectionText, new RegExp(`"${MARKER_V2}"`, "u"), `${label} must carry ST2`);
  assert.equal(
    resolutionFromStringifiedPayload(JSON.stringify({ messages: requestMessages })),
    "isolated-semantic-engine",
    `${label} dump scan must not print resolution=none`,
  );
}

test("PCR 0148: Isolated Semantic Engine symbol units do not collapse off the live tail", () => {
  const later = [
    { role: "user", content: "t1" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "t4 unchanged" },
  ];
  const fileProjection = {
    selected: [{ id: "fc_file", revision: "sha256:abc", path: "probe.ts", scope: "file" }],
    omitted: [],
    text: "<freshctx turn=\"4\"></freshctx>",
  };
  assert.equal(
    shouldCollapseCurrentProjection(later, fileProjection, 1),
    true,
    "file-scope unchanged collapse stays PCR 0103",
  );
  assert.equal(resolveProjectionText({ messages: later, projection: fileProjection, skipEligibleSelections: 1 }), "");

  const symbolProjection = {
    selected: [{
      id: "fc_symbol",
      revision: "sha256:abc",
      path: SYMBOL_PATH,
      scope: "symbol",
      selector: TARGET_SYMBOL,
      resolutionMethod: "isolated-semantic-engine",
    }],
    omitted: [],
    text: `<freshctx-unit resolution="isolated-semantic-engine">"${MARKER_V2}"</freshctx-unit>`,
  };
  assert.equal(
    shouldCollapseCurrentProjection(later, symbolProjection, 1),
    false,
    "symbol Isolated Semantic Engine must stay on the live tail",
  );
  assert.equal(
    resolveProjectionText({ messages: later, projection: symbolProjection, skipEligibleSelections: 1 }),
    symbolProjection.text,
  );
});

test("PCR 0148: Pi t4-unchanged still closes Isolated Semantic Engine after ST0→ST1→ST2", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0148-pi-"));
  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, SYMBOL_PATH), BODIES.ST0);

    const adapter = createPiAdapter({
      budgetChars: 80_000,
      semanticEngineRunner: isolatedSemanticEngineRunner(),
    });
    const ctx = { cwd: workspace };
    const t1Persisted = piSymbolMessages(BODIES.ST0);

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: CALL_ID,
        input: { path: SYMBOL_PATH, scope: "symbol", selector: TARGET_SYMBOL },
        content: BODIES.ST0,
        isError: false,
      },
      ctx,
    );
    const t1 = await adapter.onContext({ messages: structuredClone(t1Persisted) }, ctx);
    assert.ok(t1);
    assert.match(t1.projection.text, /resolution="isolated-semantic-engine"/u);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(t1.messages) } });

    await writeFile(join(workspace, SYMBOL_PATH), BODIES.ST1);
    await adapter.onTurnStart({ turnIndex: 2 });
    const t2Persisted = laterMessages(t1Persisted, "SETTLE=ST0", "quote MARKER_SETTLE again");
    const t2 = await adapter.onContext({ messages: structuredClone(t2Persisted) }, ctx);
    assert.ok(t2);
    assert.match(t2.projection.text, /"ST1"/u);
    assert.match(t2.projection.text, /resolution="isolated-semantic-engine"/u);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(t2.messages) } });

    await writeFile(join(workspace, SYMBOL_PATH), BODIES.ST2);
    await adapter.onTurnStart({ turnIndex: 3 });
    const t3Persisted = laterMessages(t2Persisted, "SETTLE=ST1", "quote MARKER_SETTLE after second flip");
    const t3 = await adapter.onContext({ messages: structuredClone(t3Persisted) }, ctx);
    assert.ok(t3);
    assert.match(t3.projection.text, /"ST2"/u);
    assert.match(t3.projection.text, /resolution="isolated-semantic-engine"/u);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(t3.messages) } });

    await adapter.onTurnStart({ turnIndex: 4 });
    const t4Persisted = laterMessages(t3Persisted, "SETTLE=ST2", "quote MARKER_SETTLE unchanged");
    const t4 = await adapter.onContext({ messages: structuredClone(t4Persisted) }, ctx);
    assert.ok(t4);
    assertClosedIsolatedSemanticEngine("Pi t4", t4.projection.text, t4.messages);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0148: Hermes t4-unchanged still closes Isolated Semantic Engine after ST0→ST1→ST2", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0148-hermes-"));
  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, SYMBOL_PATH), BODIES.ST0);

    const stateFile = await createHermesStateFile("freshctx-pcr-0148-hermes-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: 80_000,
      semanticEngineRunner: isolatedSemanticEngineRunner(),
    });
    const ctx = { cwd: workspace };
    const t1Persisted = hermesSymbolMessages(BODIES.ST0);

    await adapter.onTurnComplete(structuredClone(t1Persisted), ctx);
    const t1 = await adapter.onSelectContext(structuredClone(t1Persisted), ctx);
    assert.ok(t1);
    assert.match(t1.projectionText ?? "", /resolution="isolated-semantic-engine"/u);
    await adapter.onTurnComplete(
      [
        ...structuredClone(t1Persisted),
        { role: "assistant", content: "SETTLE=ST0" },
        { role: "user", content: t1.projectionText },
      ],
      ctx,
    );

    await writeFile(join(workspace, SYMBOL_PATH), BODIES.ST1);
    const t2Persisted = laterMessages(t1Persisted, "SETTLE=ST0", "quote MARKER_SETTLE again");
    await adapter.onTurnComplete(structuredClone(t2Persisted), ctx);
    const t2 = await adapter.onSelectContext(structuredClone(t2Persisted), ctx);
    assert.ok(t2);
    assert.match(t2.projectionText ?? "", /"ST1"/u);
    assert.match(t2.projectionText ?? "", /resolution="isolated-semantic-engine"/u);
    await adapter.onTurnComplete(
      [
        ...structuredClone(t2Persisted),
        { role: "assistant", content: "SETTLE=ST1" },
        { role: "user", content: t2.projectionText },
      ],
      ctx,
    );

    await writeFile(join(workspace, SYMBOL_PATH), BODIES.ST2);
    const t3Persisted = laterMessages(t2Persisted, "SETTLE=ST1", "quote MARKER_SETTLE after second flip");
    await adapter.onTurnComplete(structuredClone(t3Persisted), ctx);
    const t3 = await adapter.onSelectContext(structuredClone(t3Persisted), ctx);
    assert.ok(t3);
    assert.match(t3.projectionText ?? "", /"ST2"/u);
    assert.match(t3.projectionText ?? "", /resolution="isolated-semantic-engine"/u);
    await adapter.onTurnComplete(
      [
        ...structuredClone(t3Persisted),
        { role: "assistant", content: "SETTLE=ST2" },
        { role: "user", content: t3.projectionText },
      ],
      ctx,
    );

    const t4Persisted = laterMessages(t3Persisted, "SETTLE=ST2", "quote MARKER_SETTLE unchanged");
    await adapter.onTurnComplete(structuredClone(t4Persisted), ctx);
    const t4 = await adapter.onSelectContext(structuredClone(t4Persisted), ctx);
    assert.ok(t4);
    assertClosedIsolatedSemanticEngine("Hermes t4", t4.projectionText ?? "", t4.messages);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0148 door and lock blobs stay on hold", () => {
  const door = spawnSync("git", ["hash-object", "src/anchors.mjs"], { cwd: ROOT, encoding: "utf8" });
  const lock = spawnSync("git", ["hash-object", "bench/repos.lock.json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(door.status, 0, door.stderr);
  assert.equal(lock.status, 0, lock.stderr);
  assert.equal(door.stdout.trim(), "f8771c93894095348185ef3453a3c2498355b3c6");
  assert.equal(lock.stdout.trim(), "4a953591e4b175e9fd69f13d6012831b01116dce");
});
