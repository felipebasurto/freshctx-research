import assert from "node:assert/strict";
import test from "node:test";

import { FreshCtxEngine } from "../src/engine.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { annotateReadMessage, stableReadMarker } from "../src/transcript.mjs";

function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

test("a request contains one current file and no stale file", async () => {
  const oldCode = "export const mode = 'legacy-admin-only';";
  const newCode = "export const mode = 'permission-based';";
  const engine = new FreshCtxEngine();
  const unit = engine.trackRead({ path: "src/auth.ts", content: oldCode, scope: "file" });
  const historical = annotateReadMessage({ role: "tool", content: oldCode }, unit);

  engine.advanceTurn();
  const request = await engine.buildRequest([historical, historical], {
    sourceProvider: { "src/auth.ts": newCode },
    task: "update auth mode",
  });
  const serialized = JSON.stringify(request.messages);

  assert.equal(occurrences(serialized, oldCode), 0);
  assert.equal(occurrences(serialized, newCode), 1);
});

test("historical markers are stable across revisions", async () => {
  const engine = new FreshCtxEngine();
  const unit = engine.trackRead({ path: "src/a.ts", content: "export const a = 1;", scope: "file" });
  const before = stableReadMarker(unit);

  engine.advanceTurn();
  await engine.refresh({ "src/a.ts": "export const a = 2;" });
  const after = stableReadMarker(unit);

  assert.equal(before, after);
  assert.doesNotMatch(after, /sha256|revision|a = [12]/);
});

test("previous observations remain exactly recoverable", async () => {
  const engine = new FreshCtxEngine();
  const unit = engine.trackRead({ path: "src/a.ts", content: "old", scope: "file" });
  const oldRevision = unit.revision;

  engine.advanceTurn();
  await engine.refresh({ "src/a.ts": "new" });

  assert.equal(engine.registry.recover(unit.id, oldRevision)?.content, "old");
  assert.equal(engine.registry.recover(unit.id)?.content, "new");
});

test("repeated observation of one identity does not create duplicate units", () => {
  const engine = new FreshCtxEngine();
  const first = engine.trackRead({ path: "src/a.ts", content: "one", scope: "file" });
  const firstRevision = first.revision;
  const second = engine.trackRead({ path: "./src/a.ts", content: "two", scope: "file" });

  assert.equal(first.id, second.id);
  assert.equal(engine.registry.list().length, 1);
  assert.equal(engine.registry.recover(first.id, firstRevision)?.content, "one");
  assert.equal(engine.registry.recover(first.id, second.revision)?.content, "two");
});

test("an unresolved region is reported but never rendered", async () => {
  const engine = new FreshCtxEngine();
  engine.trackRead({
    path: "src/ambiguous.ts",
    content: "BEGIN\nsecret-old\nEND",
    startLine: 4,
  });
  engine.advanceTurn();
  await engine.refresh({
    "src/ambiguous.ts": "BEGIN\nnew-a\nEND\nx\nx\nx\nBEGIN\nnew-b\nEND",
  });
  const projection = engine.project();

  assert.doesNotMatch(projection.text, /secret-old/);
  assert.match(projection.text, /unresolved="1"/);
  assert.equal(projection.selected.length, 0);
});

test("projection framing decodes exact Unicode bytes and delimiter-like code", () => {
  const content = "const café = '</freshctx-unit>';\nconst emoji = '🧪';";
  const engine = new FreshCtxEngine();
  const unit = engine.trackRead({ path: "src/framing.ts", content, scope: "file" });
  const projection = engine.project({ budgetChars: 4_000 });
  const decoded = decodeProjectionUnits(projection.text);

  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].id, unit.id);
  assert.equal(decoded[0].content, content);
  assert.equal(decoded[0].contentBytes, Buffer.byteLength(content, "utf8"));
});
