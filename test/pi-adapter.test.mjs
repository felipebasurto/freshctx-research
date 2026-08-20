import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  captureProviderRequest,
  createPiAdapter,
  messageText,
  safeWorkspaceFile,
  toProviderPayload,
} from "../adapters/pi/replay.mjs";
import { finalPiCapture, runPiTrace } from "../bench/pi-trace-runner.mjs";
import { createCaptureProvider } from "../capture/provider.mjs";

test("Pi replay refuses paths outside the workspace root", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-root-"));
  await writeFile(join(workspace, "inside.ts"), "export const ok = 1;\n");
  const outside = await mkdtemp(join(tmpdir(), "freshctx-pi-outside-"));
  await writeFile(join(outside, "outside.ts"), "export const bad = 1;\n");
  await assert.rejects(
    () => safeWorkspaceFile(workspace, join(outside, "outside.ts")),
    /outside the active workspace/u,
  );
});

test("Pi adapter is request-only: persisted session stays unchanged", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pi-request-only-"));
  const stale = "export const value = 'stale';\n";
  const current = "export const value = 'current';\n";
  await writeFile(join(workspace, "source.ts"), current);

  const persisted = [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "read", arguments: JSON.stringify({ path: "source.ts" }) },
        },
      ],
    },
    { role: "tool", toolCallId: "call-1", content: stale },
    { role: "user", content: "refresh source.ts" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    budgetChars: 8_000,
  });

  assert.match(JSON.stringify(capture.persistedMessages), /stale/u);
  assert.doesNotMatch(JSON.stringify(capture.persistedMessages), /current/u);
  assert.equal(capture.persistedMessages.length, 3);
  assert.ok(capture.requestMessages.length > capture.persistedMessages.length);
  assert.doesNotMatch(capture.payloadText, /stale/u);
  assert.match(capture.payloadText, /export const value = 'current'/u);
  assert.equal(capture.payloadText.split("export const value = 'current'").length - 1, 1);
});

test("Pi adapter fails open when refresh cannot run", async () => {
  const adapter = createPiAdapter({ budgetChars: 8_000 });
  const original = [{ role: "user", content: "task only" }];
  const result = await adapter.onContext({ messages: original }, { cwd: "/tmp/missing-root" });
  assert.equal(result, undefined);
});

test("fake capture provider records Pi payload without a model", async () => {
  const provider = createCaptureProvider({ expectedRequests: 1 });
  await new Promise((resolvePromise) => provider.server.listen(0, "127.0.0.1", resolvePromise));
  const { port } = provider.server.address();
  const payload = toProviderPayload([{ role: "user", content: "hello" }]);

  const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.choices[0].message.content, "FRESHCTX_CAPTURE_OK");
  assert.equal(provider.captures.length, 1);
  assert.equal(provider.captures[0].request.model, "freshctx-capture");
  await new Promise((resolvePromise) => provider.server.close(resolvePromise));
});

test("Pi trace runner passes freshness gates on express interior-edit smoke trace", async () => {
  const trace = JSON.parse(
    await readFile(new URL("../bench/traces/smoke/express-interior-edit.json", import.meta.url), "utf8"),
  );
  const result = await runPiTrace(trace);
  const capture = finalPiCapture(result);
  assert.ok(capture);
  assert.equal(capture.metrics.staleBytes, 0);
  assert.equal(capture.metrics.duplicateUnits, 0);
  assert.equal(capture.metrics.requiredRecall, 1);
  assert.ok(capture.adapterApplied);
  assert.notEqual(messageText(capture.persistedMessages), capture.payloadText);
});

test("Pi smoke pack runs all traces and compares against core board", async () => {
  const { runPiSmokePack } = await import("../bench/pi-smoke.mjs");
  const summary = await runPiSmokePack({ strictGates: true });
  assert.equal(summary.traces, 10);
  assert.equal(summary.adapter, "pi");
  assert.equal(summary.supported, true);
  assert.equal(summary.failures.length, 0);
});
