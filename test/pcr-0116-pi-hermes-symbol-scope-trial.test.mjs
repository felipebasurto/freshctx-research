import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  captureProviderRequest as capturePiProviderRequest,
  createPiAdapter,
  messageText,
  readScopeFromInput,
} from "../adapters/pi/replay.mjs";
import {
  buildReadToolCall as buildHermesReadToolCall,
  captureProviderRequest as captureHermesProviderRequest,
  createHermesAdapter,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import { loadState, readScopeFromHermesArgs } from "../adapters/hermes/bridge.mjs";
import { missingSidecarRunner } from "../sidecar/treesitter/client.mjs";
import {
  exportFunctionBlock,
  flipTargetInteriorMarker,
} from "../docs/lab/pi-trial-ts/live.mjs";
import {
  HOST_READ_SCOPE,
  MARKER_V0,
  MARKER_V1,
  SIBLING_MARKER,
  SIBLING_SYMBOL,
  TARGET_FILE,
  TARGET_SYMBOL,
  hostReadToolArgs,
} from "../docs/lab/pi-trial-ts/pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../docs/lab/pi-trial-ts/fixture/src/settlement.ts");

async function loadFixturePair() {
  const source = await readFile(fixturePath, "utf8");
  const observedSymbol = exportFunctionBlock(source, TARGET_SYMBOL);
  const flippedFile = flipTargetInteriorMarker(source, {
    v0: MARKER_V0,
    v1: MARKER_V1,
    symbol: TARGET_SYMBOL,
  });
  return { source, observedSymbol, flippedFile };
}

async function writeFixtureWorkspace(root, fileContent) {
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, TARGET_FILE), fileContent);
}

function symbolReadMessages({ toolCallId, observed }) {
  const args = hostReadToolArgs();
  return [
    buildReadToolCall({ toolCallId, ...args }),
    buildToolResultMessage({ toolCallId, content: observed }),
    {
      role: "user",
      content: `No uses herramientas. ¿Cuál es MARKER_SETTLE en ${TARGET_SYMBOL}?`,
    },
  ];
}

function fileReadMessages({ toolCallId, observed }) {
  return [
    buildReadToolCall({ toolCallId, path: TARGET_FILE }),
    buildToolResultMessage({ toolCallId, content: observed }),
    {
      role: "user",
      content: `No uses herramientas. ¿Cuál es MARKER_SETTLE en ${TARGET_SYMBOL}?`,
    },
  ];
}

function requestUtf8Bytes(payload) {
  return Buffer.byteLength(JSON.stringify(payload));
}

test("PCR 0116 hostReadToolArgs targets settleDailyLedger with scope=symbol", () => {
  assert.deepEqual(hostReadToolArgs(), {
    path: TARGET_FILE,
    scope: "symbol",
    selector: TARGET_SYMBOL,
  });
  assert.equal(HOST_READ_SCOPE, "symbol");
});

test("PCR 0116 read scope parsers accept settleDailyLedger symbol metadata", () => {
  const args = hostReadToolArgs();
  assert.deepEqual(readScopeFromInput(args, 120), {
    scope: "symbol",
    selector: TARGET_SYMBOL,
  });
  assert.deepEqual(readScopeFromHermesArgs(args, 120), {
    scope: "symbol",
    selector: TARGET_SYMBOL,
  });
});

test("PCR 0116 Pi replay tracks symbol-scope host read of settleDailyLedger", async () => {
  const { observedSymbol, flippedFile } = await loadFixturePair();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0116-pi-track-"));
  await writeFixtureWorkspace(workspace, flippedFile);

  const adapter = createPiAdapter({ budgetChars: 80_000 });
  const ctx = { cwd: workspace };
  const callId = "call-settle-daily";
  const input = hostReadToolArgs();

  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: callId,
      input,
      content: [{ type: "text", text: observedSymbol }],
      isError: false,
    },
    ctx,
  );

  assert.deepEqual(adapter.callMeta.get(callId), {
    path: TARGET_FILE,
    scope: "symbol",
    selector: TARGET_SYMBOL,
  });
  const unit = adapter.engine.registry.list()[0];
  assert.equal(unit.scope, "symbol");
  assert.equal(unit.selector, TARGET_SYMBOL);
});

test("PCR 0116 Pi Tree-sitter symbol refresh omits settleWeeklyLedger after flip", async () => {
  const { source, observedSymbol, flippedFile } = await loadFixturePair();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0116-pi-ts-"));
  await writeFixtureWorkspace(workspace, flippedFile);

  const capture = await capturePiProviderRequest({
    cwd: workspace,
    budgetChars: 80_000,
    persistedMessages: symbolReadMessages({ toolCallId: "call-ts", observed: observedSymbol }),
  });

  const payloadText = JSON.stringify(capture.payload);
  assert.ok(capture.adapterApplied);
  assert.match(capture.projectionText, /"ST1"/u);
  assert.doesNotMatch(capture.projectionText, /"SW0"/u);
  assert.doesNotMatch(capture.projectionText, new RegExp(`export function ${SIBLING_SYMBOL}`, "u"));
  assert.match(capture.projectionText, /resolution="sidecar"/u);
  assert.equal(payloadText.includes(SIBLING_MARKER), false);
  assert.equal(payloadText.includes(MARKER_V1), true);

  const fileCapture = await capturePiProviderRequest({
    cwd: workspace,
    budgetChars: 80_000,
    persistedMessages: fileReadMessages({ toolCallId: "call-file", observed: source }),
  });
  const filePayloadText = JSON.stringify(fileCapture.payload);
  assert.equal(filePayloadText.includes(SIBLING_MARKER), true);
  assert.ok(
    requestUtf8Bytes(capture.payload) < requestUtf8Bytes(fileCapture.payload),
    "Tree-sitter symbol-scope turn-2 request_bytes should drop vs file-scope read on the same arm",
  );
});

test("PCR 0116 Pi sidecar-off symbol read fails closed and drops vs Tree-sitter arm", async () => {
  const { observedSymbol, flippedFile } = await loadFixturePair();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0116-pi-no-ts-"));
  await writeFixtureWorkspace(workspace, flippedFile);

  const adapter = createPiAdapter({ budgetChars: 80_000, sidecarRunner: missingSidecarRunner() });
  const ctx = { cwd: workspace };
  const callId = "call-no-ts";
  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: callId,
      input: hostReadToolArgs(),
      content: [{ type: "text", text: observedSymbol }],
      isError: false,
    },
    ctx,
  );
  const messages = symbolReadMessages({ toolCallId: callId, observed: observedSymbol });
  const result = await adapter.onContext({ messages, budgetChars: 80_000 }, ctx);
  const unit = adapter.engine.registry.list()[0];
  assert.equal(unit.scope, "symbol");
  assert.equal(unit.selector, TARGET_SYMBOL);
  assert.equal(unit.resolutionMethod, "sidecar-error");
  assert.doesNotMatch(messageText(result?.messages ?? messages), /"ST1"/u);

  const treeSitterCapture = await capturePiProviderRequest({
    cwd: workspace,
    budgetChars: 80_000,
    persistedMessages: symbolReadMessages({ toolCallId: "call-ts", observed: observedSymbol }),
  });
  assert.ok(
    requestUtf8Bytes(result?.messages ?? messages) < requestUtf8Bytes(treeSitterCapture.payload),
    "sidecar-off arm turn-2 request_bytes should stay below Tree-sitter arm injection size",
  );
});

test("PCR 0116 Hermes replay tracks symbol-scope host read of settleDailyLedger", async () => {
  const { source, observedSymbol } = await loadFixturePair();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0116-hermes-track-"));
  await writeFixtureWorkspace(workspace, source);
  const stateFile = await createHermesStateFile("freshctx-pcr-0116-hermes-track-state-");
  const adapter = createHermesAdapter({ stateFile, budgetChars: 80_000 });
  const ctx = { cwd: workspace };
  const callId = "call-hermes-settle";

  const persisted = [
    buildHermesReadToolCall({ toolCallId: callId, ...hostReadToolArgs() }),
    buildToolResultMessage({ toolCallId: callId, content: observedSymbol }),
    { role: "user", content: "refresh settleDailyLedger" },
  ];

  await adapter.onTurnComplete(structuredClone(persisted), ctx);
  const state = await loadState(stateFile);
  assert.deepEqual(state.calls[callId], {
    path: TARGET_FILE,
    scope: "symbol",
    selector: TARGET_SYMBOL,
  });
  assert.equal(state.tracked[callId]?.scope, "symbol");
  assert.equal(state.tracked[callId]?.selector, TARGET_SYMBOL);

  const selectResult = await adapter.onSelectContext(structuredClone(persisted), ctx, {
    budgetChars: 80_000,
  });
  assert.ok(selectResult?.applied);
  assert.match(selectResult.projectionText ?? "", /"ST0"/u);
  assert.doesNotMatch(selectResult.projectionText ?? "", /"SW0"/u);
  assert.match(selectResult.projectionText ?? "", /resolution="sidecar"/u);
});

test("PCR 0116 Hermes Tree-sitter symbol refresh omits settleWeeklyLedger after flip", async () => {
  const { source, observedSymbol, flippedFile } = await loadFixturePair();
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0116-hermes-ts-"));
  await writeFixtureWorkspace(workspace, flippedFile);
  const stateFile = await createHermesStateFile("freshctx-pcr-0116-hermes-ts-state-");

  const symbolCapture = await captureHermesProviderRequest({
    cwd: workspace,
    stateFile,
    budgetChars: 80_000,
    persistedMessages: [
      buildHermesReadToolCall({ toolCallId: "call-h-ts", ...hostReadToolArgs() }),
      buildToolResultMessage({ toolCallId: "call-h-ts", content: observedSymbol }),
      { role: "user", content: "quote marker" },
    ],
  });

  const symbolPayloadText = JSON.stringify(symbolCapture.payload);
  assert.match(symbolCapture.projectionText, /"ST1"/u);
  assert.doesNotMatch(symbolCapture.projectionText, /"SW0"/u);
  assert.match(symbolCapture.projectionText, /resolution="sidecar"/u);
  assert.equal(symbolPayloadText.includes(SIBLING_MARKER), false);

  const fileStateFile = await createHermesStateFile("freshctx-pcr-0116-hermes-file-state-");
  const fileCapture = await captureHermesProviderRequest({
    cwd: workspace,
    stateFile: fileStateFile,
    budgetChars: 80_000,
    persistedMessages: [
      buildHermesReadToolCall({ toolCallId: "call-h-file", path: TARGET_FILE }),
      buildToolResultMessage({ toolCallId: "call-h-file", content: source }),
      { role: "user", content: "quote marker" },
    ],
  });
  assert.equal(JSON.stringify(fileCapture.payload).includes(SIBLING_MARKER), true);
  assert.ok(
    requestUtf8Bytes(symbolCapture.payload) < requestUtf8Bytes(fileCapture.payload),
    "Hermes Tree-sitter symbol-scope request_bytes should drop vs file-scope read",
  );
});
