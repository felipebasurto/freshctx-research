import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShellToolCall,
  buildToolResultMessage,
  messageText,
} from "../adapters/pi/replay.mjs";
import { dropUnservedReadToolPairs, staleShellDumpCallIds } from "../adapters/request-prune.mjs";

const CLI_PATH = "src/viajante/cli.py";

test("PCR 0084: all-tracked multi-path cat keeps the pair and marker-replaces the dump", () => {
  const paths = [
    "README.md",
    CLI_PATH,
    "src/viajante/models.py",
    "src/viajante/flights.py",
  ];
  const command = `cat ${paths.join(" ")}`;
  const dump = `# MARKER_CLI=CL0\n${"CONCAT_DUMP\n".repeat(200)}# MARKER_README=R0\n`;
  const messages = [
    buildShellToolCall({ toolCallId: "call-all-tracked", command }),
    buildToolResultMessage({ toolCallId: "call-all-tracked", content: dump }),
  ];

  const drop = staleShellDumpCallIds(messages, {
    trackedPaths: paths,
    servedCallIds: new Set(),
  });
  assert.deepEqual([...drop], ["call-all-tracked"]);

  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read"]),
    servedCallIds: new Set(),
    observedCallIds: new Set(),
    trackedPaths: paths,
  });
  assert.equal(pruned.length, 2);
  assert.doesNotMatch(JSON.stringify(pruned), /CONCAT_DUMP/u);
  assert.doesNotMatch(JSON.stringify(pruned), /CL0/u);
  assert.match(JSON.stringify(pruned), /freshctx:stale-dump/u);

  const dumpResult = pruned[1];
  const marker = messageText([dumpResult]);
  for (const path of paths) {
    assert.match(marker, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("PCR 0091: one-untracked-path multi-path cat marker-replaces stale tracked bytes", () => {
  const trackedPaths = [
    "README.md",
    CLI_PATH,
    "src/viajante/models.py",
  ];
  const command = "cat README.md src/viajante/cli.py src/viajante/models.py notes/freshctx-todo.md";
  const dump = "# MARKER_CLI=CL0\nCONCAT_DUMP\n# MARKER_TODO=T0\n";
  const messages = [
    buildShellToolCall({ toolCallId: "call-one-untracked", command }),
    buildToolResultMessage({ toolCallId: "call-one-untracked", content: dump }),
  ];

  const drop = staleShellDumpCallIds(messages, {
    trackedPaths,
    servedCallIds: new Set(),
  });
  assert.deepEqual([...drop], ["call-one-untracked"]);

  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read"]),
    servedCallIds: new Set(),
    observedCallIds: new Set(),
    trackedPaths,
  });
  const marker = messageText([pruned[1]]);
  assert.doesNotMatch(marker, /CONCAT_DUMP/u);
  assert.match(marker, /freshctx:stale-dump/u);
  assert.match(marker, /README\.md/u);
  assert.match(marker, /src\/viajante\/cli\.py/u);
  assert.match(marker, /src\/viajante\/models\.py/u);
  assert.match(marker, /notes\/freshctx-todo\.md/u);
  assert.match(marker, /not supplied/u);
});

test("PCR 0091: suffix path alias stays exact while tracked peer bytes are marker-replaced", () => {
  const trackedPaths = [
    "README.md",
    CLI_PATH,
  ];
  const command = `cat docs/README.md ${CLI_PATH}`;
  const dump = "# MARKER_DOC_README=D0\nCONCAT_DUMP\n# MARKER_CLI=CL0\n";
  const messages = [
    buildShellToolCall({ toolCallId: "call-suffix-alias", command }),
    buildToolResultMessage({ toolCallId: "call-suffix-alias", content: dump }),
  ];

  const drop = staleShellDumpCallIds(messages, {
    trackedPaths,
    servedCallIds: new Set(),
  });
  assert.deepEqual([...drop], ["call-suffix-alias"]);

  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read"]),
    servedCallIds: new Set(),
    observedCallIds: new Set(),
    trackedPaths,
  });
  const marker = messageText([pruned[1]]);
  assert.doesNotMatch(marker, /CONCAT_DUMP/u);
  assert.doesNotMatch(marker, /MARKER_DOC_README=D0/u);
  assert.match(marker, /freshctx:stale-dump/u);
  assert.match(marker, /src\/viajante\/cli\.py/u);
  assert.match(marker, /docs\/README\.md/u);
  assert.match(marker, /not supplied/u);
  assert.doesNotMatch(marker, /\[freshctx:stale-dump paths=.*README\.md, src\/viajante\/cli\.py/u);
});
