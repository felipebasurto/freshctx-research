import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildShellToolCall,
  buildToolResultMessage,
  createPiAdapter,
  DEFAULT_BUDGET_CHARS,
  messageText,
} from "../adapters/pi/replay.mjs";
import { parseShellFileRead, trackedPathsMentionedInCommand } from "../adapters/shell-read.mjs";
import { dropUnservedReadToolPairs, staleShellDumpCallIds } from "../adapters/request-prune.mjs";

const CLI_PATH = "src/viajante/cli.py";
const PAD = "x".repeat(39_000);
const OLD_BODY = `# MARKER_CLI=CL0\n${PAD}\n`;
const NEW_BODY = `# MARKER_CLI=CL1\n${PAD}\n`;

test("PCR 0081: parseShellFileRead still refuses pipes", () => {
  assert.equal(parseShellFileRead(`base64 < ${CLI_PATH} | base64 -d`), null);
  assert.equal(parseShellFileRead(`cat ${CLI_PATH} | head`), null);
});

test("PCR 0081: piped dump names exactly one tracked path", () => {
  assert.deepEqual(
    trackedPathsMentionedInCommand(`base64 < ${CLI_PATH} | base64 -d`, [CLI_PATH, "README.md"]),
    [CLI_PATH],
  );
  assert.deepEqual(
    trackedPathsMentionedInCommand(`cat /tmp/work/${CLI_PATH}`, [CLI_PATH, "README.md"]),
    [CLI_PATH],
  );
  assert.deepEqual(
    trackedPathsMentionedInCommand(
      `wc -l README.md ${CLI_PATH}`,
      [CLI_PATH, "README.md"],
    ).sort(),
    [CLI_PATH, "README.md"].sort(),
  );
});

test("PCR 0081: python3 -c dump of one tracked path is dropped", () => {
  const command = `python3 -c "import sys; sys.stdout.write(open('${CLI_PATH}').read())"`;
  assert.deepEqual(trackedPathsMentionedInCommand(command, [CLI_PATH, "README.md"]), [CLI_PATH]);
  const messages = [
    buildShellToolCall({ toolCallId: "call-py", command }),
    buildToolResultMessage({ toolCallId: "call-py", content: OLD_BODY }),
  ];
  const drop = staleShellDumpCallIds(messages, {
    trackedPaths: [CLI_PATH],
    servedCallIds: new Set(),
  });
  assert.deepEqual([...drop], ["call-py"]);
});

test("PCR 0081: Pi-native toolCall/toolResult python dump of a tracked path is dropped", () => {
  const command = `python3 -c "print(open('${CLI_PATH}').read())"`;
  const messages = [
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "dump it" },
        { type: "toolCall", id: "call-py-native", name: "bash", arguments: { command } },
      ],
    },
    {
      role: "toolResult",
      toolCallId: "call-py-native",
      toolName: "bash",
      content: [{ type: "text", text: OLD_BODY }],
      isError: false,
    },
    { role: "user", content: "CLI=?" },
  ];
  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read", "bash"]),
    servedCallIds: new Set(),
    observedCallIds: new Set(),
    trackedPaths: [CLI_PATH],
  });
  assert.doesNotMatch(JSON.stringify(pruned), /CL0/u);
  assert.equal(pruned.some((message) => message.role === "toolResult"), true);
  assert.match(JSON.stringify(pruned), /freshctx:stale-dump/u);
});

test("PCR 0081: two tracked paths in one command are not dropped", () => {
  const messages = [
    buildShellToolCall({
      toolCallId: "call-wc",
      command: `wc -l README.md ${CLI_PATH}`,
    }),
    buildToolResultMessage({ toolCallId: "call-wc", content: "CL0 leftover" }),
  ];
  const drop = staleShellDumpCallIds(messages, {
    trackedPaths: [CLI_PATH, "README.md"],
    servedCallIds: new Set(),
  });
  assert.equal(drop.size, 0);
  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read"]),
    servedCallIds: new Set(),
    trackedPaths: [CLI_PATH, "README.md"],
  });
  assert.match(JSON.stringify(pruned), /CL0 leftover/u);
});

test("PCR 0081: five-file cat dump is left in place (live 2.2 leftover)", () => {
  const paths = [
    "README.md",
    CLI_PATH,
    "src/viajante/models.py",
    "src/viajante/flights.py",
    "notes/freshctx-todo.md",
  ];
  const command = `cat ${paths.join(" ")}`;
  const dump = `# MARKER_CLI=CL0\nCONCAT_DUMP\n`;
  const messages = [
    buildShellToolCall({ toolCallId: "call-five", command }),
    buildToolResultMessage({ toolCallId: "call-five", content: dump }),
  ];
  const drop = staleShellDumpCallIds(messages, {
    trackedPaths: paths,
    servedCallIds: new Set(),
  });
  assert.equal(drop.size, 0);
  const pruned = dropUnservedReadToolPairs(messages, {
    readTools: new Set(["read"]),
    servedCallIds: new Set(),
    observedCallIds: new Set(),
    trackedPaths: paths,
  });
  assert.match(JSON.stringify(pruned), /CONCAT_DUMP/u);
  assert.doesNotMatch(JSON.stringify(pruned), /stale-dump/u);
});

test("PCR 0081: piped dump of a tracked path is dropped after refresh", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0080-"));
  try {
    await mkdir(join(workspace, "src/viajante"), { recursive: true });
    await writeFile(join(workspace, CLI_PATH), OLD_BODY, "utf8");

    const adapter = createPiAdapter({ budgetChars: DEFAULT_BUDGET_CHARS });
    const ctx = { cwd: workspace };
    const absCat = `cat ${join(workspace, CLI_PATH)}`;
    const piped = `base64 < ${CLI_PATH} | base64 -d`;
    const persisted = [
      buildReadToolCall({ toolCallId: "call-read", path: CLI_PATH }),
      buildToolResultMessage({ toolCallId: "call-read", content: OLD_BODY }),
      buildShellToolCall({ toolCallId: "call-cat", command: absCat }),
      buildToolResultMessage({ toolCallId: "call-cat", content: OLD_BODY }),
      buildShellToolCall({ toolCallId: "call-pipe", command: piped }),
      buildToolResultMessage({ toolCallId: "call-pipe", content: OLD_BODY }),
      { role: "user", content: "CLI=?" },
    ];

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-read",
        input: { path: CLI_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    await adapter.onToolResult(
      {
        toolName: "bash",
        toolCallId: "call-cat",
        input: { command: absCat },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    await adapter.onToolResult(
      {
        toolName: "bash",
        toolCallId: "call-pipe",
        input: { command: piped },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );

    await adapter.onContext({ messages: structuredClone(persisted) }, ctx);

    await writeFile(join(workspace, CLI_PATH), NEW_BODY, "utf8");
    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2 = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
    assert.ok(turn2);

    const payload = messageText(turn2.messages);
    assert.match(payload, /CL1/u);
    assert.doesNotMatch(payload, /CL0/u);
    assert.match(payload, /freshctx:stale-dump/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
