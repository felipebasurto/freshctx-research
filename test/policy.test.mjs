import assert from "node:assert/strict";
import test from "node:test";

import { selectWorkingSet } from "../src/policy.mjs";
import { projectContext } from "../src/projector.mjs";

function unit(id, content, overrides = {}) {
  return {
    id,
    path: `src/${id}.ts`,
    content,
    state: "resolved",
    revision: `sha256:${id}`,
    startLine: 1,
    endLine: 1,
    lastUsedAt: 0,
    changedAt: -1,
    changeCount: 0,
    pinned: false,
    selector: null,
    resolutionMethod: "observed",
    ...overrides,
  };
}

test("selection is deterministic and pinned units take precedence", () => {
  const units = [
    unit("large", "x".repeat(8)),
    unit("pinned", "y".repeat(5), { pinned: true }),
    unit("small", "z".repeat(5)),
  ];
  const options = { turn: 3, budgetChars: 10, task: "unrelated" };
  const first = selectWorkingSet(units, options);
  const second = selectWorkingSet([...units].reverse(), options);

  assert.deepEqual(
    first.selected.map(({ unit: selected }) => selected.id),
    ["pinned", "small"],
  );
  assert.deepEqual(
    second.selected.map(({ unit: selected }) => selected.id),
    ["pinned", "small"],
  );
});

test("rendering puts stable units before change-prone units", () => {
  const volatile = unit("a-volatile", "volatile", { changeCount: 4, pinned: true });
  const stable = unit("z-stable", "stable", { changeCount: 0 });
  const projection = projectContext([volatile, stable], { budgetChars: 100 });

  assert.ok(projection.text.indexOf("z-stable") < projection.text.indexOf("a-volatile"));
});

test("rendering sorts omission records by stable unit identity", () => {
  const projection = projectContext(
    [
      unit("z-pinned", "z".repeat(10), { pinned: true }),
      unit("a-normal", "a".repeat(10)),
    ],
    { budgetChars: 1 },
  );

  assert.ok(projection.text.indexOf('id="a-normal"') < projection.text.indexOf('id="z-pinned"'));
});

test("rendering escapes omission metadata without changing source bytes", () => {
  const projection = projectContext(
    [unit('unit<&"', "body", { path: 'src/<unsafe&".ts', state: "unresolved" })],
    { budgetChars: 100 },
  );

  assert.match(
    projection.text,
    /<freshctx-omitted id="unit&lt;&amp;&quot;" path="src\/&lt;unsafe&amp;&quot;\.ts" reason="unresolved"\/>/u,
  );
  assert.doesNotMatch(projection.text, /<unsafe/u);
});

test("unresolved units cannot be selected even when pinned", () => {
  const unresolved = unit("missing", "stale-secret", { state: "unresolved", pinned: true });
  const result = selectWorkingSet([unresolved], { budgetChars: 100 });

  assert.equal(result.selected.length, 0);
  assert.equal(result.omitted[0].reason, "unresolved");
});

test("empty renderOrder emits envelope header and close without boilerplate prose", () => {
  const unresolved = unit("missing", "stale-secret", { state: "unresolved" });
  const projection = projectContext([unresolved], { turn: 1, budgetChars: 100 });

  assert.equal(projection.selected.length, 0);
  assert.match(
    projection.text,
    /^<freshctx turn="1" selected="0" unresolved="1" budget-omitted="0">\n<freshctx-omitted id="missing" path="src\/missing.ts" reason="unresolved"\/>\n<\/freshctx>$/u,
  );
  assert.doesNotMatch(
    projection.text,
    /The following code is the current workspace state/u,
  );
  assert.equal(Buffer.byteLength(projection.text, "utf8"), 153);
});
