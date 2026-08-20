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

test("unresolved units cannot be selected even when pinned", () => {
  const unresolved = unit("missing", "stale-secret", { state: "unresolved", pinned: true });
  const result = selectWorkingSet([unresolved], { budgetChars: 100 });

  assert.equal(result.selected.length, 0);
  assert.equal(result.omitted[0].reason, "unresolved");
});
