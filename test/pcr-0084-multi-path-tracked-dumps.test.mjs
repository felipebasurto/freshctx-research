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

test("PCR 0084: one-untracked-path multi-path cat is left alone", () => {
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
  assert.equal(drop.size, 0);

  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read"]),
    servedCallIds: new Set(),
    observedCallIds: new Set(),
    trackedPaths,
  });
  assert.match(JSON.stringify(pruned), /CONCAT_DUMP/u);
  assert.doesNotMatch(JSON.stringify(pruned), /freshctx:stale-dump/u);
});
