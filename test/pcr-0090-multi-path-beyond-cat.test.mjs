import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShellToolCall,
  buildToolResultMessage,
  messageText,
} from "../adapters/pi/replay.mjs";
import { dropUnservedReadToolPairs, staleShellDumpCallIds } from "../adapters/request-prune.mjs";

const TRACKED_PATHS = [
  "README.md",
  "src/viajante/cli.py",
  "src/viajante/models.py",
];

const DUMP = "# MARKER_MULTI=ML0\n" + "CONCAT_DUMP\n".repeat(200);

test("PCR 0090: all-tracked multi-path python argv dump marker-replaces the dump", () => {
  const command = "python3 -c \"import pathlib, sys; [sys.stdout.write(pathlib.Path(path).read_text()) for path in sys.argv[1:]]\" README.md src/viajante/cli.py src/viajante/models.py";
  const messages = [
    buildShellToolCall({ toolCallId: "call-python-all-tracked", command }),
    buildToolResultMessage({ toolCallId: "call-python-all-tracked", content: DUMP }),
  ];

  const drop = staleShellDumpCallIds(messages, {
    trackedPaths: TRACKED_PATHS,
    servedCallIds: new Set(),
  });
  assert.deepEqual([...drop], ["call-python-all-tracked"]);

  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read"]),
    servedCallIds: new Set(),
    observedCallIds: new Set(),
    trackedPaths: TRACKED_PATHS,
  });
  const marker = messageText([pruned[1]]);
  assert.doesNotMatch(marker, /CONCAT_DUMP/u);
  assert.doesNotMatch(marker, /ML0/u);
  assert.match(marker, /freshctx:stale-dump/u);
  for (const path of TRACKED_PATHS) {
    assert.match(marker, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("PCR 0090: all-tracked piped cat dump marker-replaces the dump", () => {
  const command = "cat README.md src/viajante/cli.py src/viajante/models.py | base64";
  const messages = [
    buildShellToolCall({ toolCallId: "call-pipe-all-tracked", command }),
    buildToolResultMessage({ toolCallId: "call-pipe-all-tracked", content: DUMP }),
  ];

  const drop = staleShellDumpCallIds(messages, {
    trackedPaths: TRACKED_PATHS,
    servedCallIds: new Set(),
  });
  assert.deepEqual([...drop], ["call-pipe-all-tracked"]);

  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read"]),
    servedCallIds: new Set(),
    observedCallIds: new Set(),
    trackedPaths: TRACKED_PATHS,
  });
  const marker = messageText([pruned[1]]);
  assert.doesNotMatch(marker, /CONCAT_DUMP/u);
  assert.match(marker, /freshctx:stale-dump/u);
  for (const path of TRACKED_PATHS) {
    assert.match(marker, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("PCR 0090: all-tracked xargs cat dump marker-replaces the dump", () => {
  const command = "printf '%s\\n' README.md src/viajante/cli.py src/viajante/models.py | xargs cat";
  const messages = [
    buildShellToolCall({ toolCallId: "call-xargs-all-tracked", command }),
    buildToolResultMessage({ toolCallId: "call-xargs-all-tracked", content: DUMP }),
  ];

  const drop = staleShellDumpCallIds(messages, {
    trackedPaths: TRACKED_PATHS,
    servedCallIds: new Set(),
  });
  assert.deepEqual([...drop], ["call-xargs-all-tracked"]);

  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read"]),
    servedCallIds: new Set(),
    observedCallIds: new Set(),
    trackedPaths: TRACKED_PATHS,
  });
  const marker = messageText([pruned[1]]);
  assert.doesNotMatch(marker, /CONCAT_DUMP/u);
  assert.match(marker, /freshctx:stale-dump/u);
  for (const path of TRACKED_PATHS) {
    assert.match(marker, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("PCR 0091: mixed tracked and untracked multi-path python dump marker-replaces stale tracked bytes", () => {
  const command = "python3 -c \"import pathlib, sys; [sys.stdout.write(pathlib.Path(path).read_text()) for path in sys.argv[1:]]\" README.md src/viajante/cli.py notes/freshctx-todo.md";
  const messages = [
    buildShellToolCall({ toolCallId: "call-python-mixed", command }),
    buildToolResultMessage({ toolCallId: "call-python-mixed", content: DUMP }),
  ];

  const drop = staleShellDumpCallIds(messages, {
    trackedPaths: TRACKED_PATHS,
    servedCallIds: new Set(),
  });
  assert.deepEqual([...drop], ["call-python-mixed"]);

  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read"]),
    servedCallIds: new Set(),
    observedCallIds: new Set(),
    trackedPaths: TRACKED_PATHS,
  });
  const marker = messageText([pruned[1]]);
  assert.doesNotMatch(marker, /CONCAT_DUMP/u);
  assert.doesNotMatch(marker, /ML0/u);
  assert.match(marker, /freshctx:stale-dump/u);
  assert.match(marker, /README\.md/u);
  assert.match(marker, /src\/viajante\/cli\.py/u);
  assert.match(marker, /notes\/freshctx-todo\.md/u);
  assert.match(marker, /not supplied/u);
});
