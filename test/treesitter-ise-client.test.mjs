import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createIsolatedSemanticEngineRunner } from "../ise/treesitter/client.mjs";

function fakeChild({ exitCode = 0, stdout = "", stdinError = null, hang = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    setImmediate(() => child.emit("close", null, "SIGKILL"));
    return true;
  };
  if (stdinError) {
    child.stdin.write = () => { setImmediate(() => child.stdin.emit("error", stdinError)); return false; };
    child.stdin.end = () => {};
  }
  setImmediate(() => {
    if (hang) return;
    if (stdout) child.stdout.end(stdout); else child.stdout.end();
    child.stderr.end();
    if (!stdinError) child.emit("close", exitCode);
  });
  return child;
}

test("stdin error (EPIPE) rejects instead of crashing the host", async () => {
  const runner = createIsolatedSemanticEngineRunner({ spawnImpl: () => fakeChild({ stdinError: Object.assign(new Error("write EPIPE"), { code: "EPIPE" }) }) });
  await assert.rejects(runner({ path: "a.py", bytes: "def a():\n  pass\n" }), /EPIPE|isolated-semantic-engine-error/);
});

test("non-zero exit rejects with stderr text or the generic error", async () => {
  const runner = createIsolatedSemanticEngineRunner({ spawnImpl: () => fakeChild({ exitCode: 3 }) });
  await assert.rejects(runner({ path: "a.py", bytes: "" }), /isolated-semantic-engine-error/);
});

test("non-JSON stdout rejects", async () => {
  const runner = createIsolatedSemanticEngineRunner({ spawnImpl: () => fakeChild({ stdout: "not json" }) });
  await assert.rejects(runner({ path: "a.py", bytes: "" }));
});

test("a hung child is killed after timeoutMs and rejects with a timeout error", async () => {
  let spawned;
  const runner = createIsolatedSemanticEngineRunner({
    timeoutMs: 50,
    spawnImpl: () => { spawned = fakeChild({ hang: true }); return spawned; },
  });
  await assert.rejects(runner({ path: "a.py", bytes: "" }), /isolated-semantic-engine-timeout/);
  assert.equal(spawned.killed, true);
});

test("stdout above maxOutputBytes rejects and kills the child", async () => {
  let spawned;
  const runner = createIsolatedSemanticEngineRunner({
    maxOutputBytes: 16,
    spawnImpl: () => { spawned = fakeChild({ stdout: JSON.stringify({ units: "x".repeat(64) }) }); return spawned; },
  });
  await assert.rejects(runner({ path: "a.py", bytes: "" }), /isolated-semantic-engine-output-too-large/);
  assert.equal(spawned.killed, true);
});

test("well-formed JSON on exit 0 resolves", async () => {
  const runner = createIsolatedSemanticEngineRunner({ spawnImpl: () => fakeChild({ stdout: JSON.stringify({ units: [], error: null }) }) });
  assert.deepEqual(await runner({ path: "a.py", bytes: "" }), { units: [], error: null });
});
