import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createPiAdapter, messageText } from "../adapters/pi/replay.mjs";
import { FreshCtxEngine } from "../src/engine.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";

const PROBE_PATH = "probe.ts";
const OLD_BODY = "export const marker = 'T77_OLD';\n".repeat(40);
const NEW_BODY = "export const marker = 'T77_NEW';\n".repeat(40);

async function writeProbe(workspace, content) {
  await writeFile(join(workspace, PROBE_PATH), content, { encoding: "utf8" });
}

function turn1Messages(staleBody = OLD_BODY) {
  return [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-t77",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: PROBE_PATH }),
          },
        },
      ],
    },
    { role: "tool", toolCallId: "call-t77", content: staleBody },
    { role: "user", content: "what is the marker?" },
  ];
}

async function runTwoTurnReplay({ workspace, editBeforeTurn2 = false }) {
  const adapter = createPiAdapter({ budgetChars: 120_000 });
  const ctx = { cwd: workspace };
  const persisted = turn1Messages();

  await adapter.onTurnStart({ turnIndex: 1 });
  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: "call-t77",
      input: { path: PROBE_PATH },
      content: OLD_BODY,
      isError: false,
    },
    ctx,
  );

  const turn1 = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
  assert.ok(turn1);

  if (editBeforeTurn2) {
    await writeProbe(workspace, NEW_BODY);
  }

  await adapter.onTurnStart({ turnIndex: 2 });
  const turn2 = await adapter.onContext({ messages: structuredClone(persisted) }, ctx);
  assert.ok(turn2);

  return { turn1, turn2 };
}

test("PCR 0077: projector skips unchanged unit bodies when lastInjectedRevision matches", () => {
  const engine = new FreshCtxEngine();
  const unit = engine.trackRead({ path: "src/a.ts", content: OLD_BODY, scope: "file" });
  const lastInjectedRevision = new Map([[unit.id, unit.revision]]);

  const projection = engine.project({ budgetChars: 120_000, lastInjectedRevision });
  const decoded = decodeProjectionUnits(projection.text);

  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].content, "");
  assert.match(projection.text, /unchanged="true"/u);
  assert.doesNotMatch(projection.text, /T77_OLD/u);
});

test("PCR 0077: two-turn unchanged replay omits full file body on second inject", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0077-unchanged-"));
  try {
    await writeProbe(workspace, OLD_BODY);
    const { turn1, turn2 } = await runTwoTurnReplay({ workspace });

    const turn1Bytes = Buffer.byteLength(turn1.projection.text, "utf8");
    const turn2Bytes = Buffer.byteLength(turn2.projection.text, "utf8");

    assert.match(turn1.projection.text, /T77_OLD/u);
    assert.doesNotMatch(turn2.projection.text, /T77_OLD/u);
    assert.match(turn2.projection.text, /unchanged="true"/u);
    assert.ok(turn2Bytes < turn1Bytes, `turn2 ${turn2Bytes} should be smaller than turn1 ${turn1Bytes}`);
    assert.ok(turn1Bytes - turn2Bytes >= Buffer.byteLength(OLD_BODY, "utf8") - 32);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0077: two-turn changed replay still injects NEW bytes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0077-changed-"));
  try {
    await writeProbe(workspace, OLD_BODY);
    const { turn1, turn2 } = await runTwoTurnReplay({ workspace, editBeforeTurn2: true });

    assert.match(turn1.projection.text, /T77_OLD/u);
    assert.doesNotMatch(turn1.projection.text, /T77_NEW/u);
    assert.match(turn2.projection.text, /T77_NEW/u);
    assert.doesNotMatch(turn2.projection.text, /T77_OLD/u);
    assert.doesNotMatch(turn2.projection.text, /unchanged="true"/u);

    const payloadText = messageText(turn2.messages);
    assert.match(payloadText, /T77_NEW/u);
    assert.doesNotMatch(payloadText, /T77_OLD/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0077: empty registry fail-open preserves original provider payload", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0077-empty-"));
  try {
    const original = [{ role: "user", content: "task only" }];
    const adapter = createPiAdapter({ budgetChars: 8_000 });
    const hookResult = await adapter.onContext({ messages: original }, { cwd: workspace });
    assert.equal(hookResult, undefined);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0077: context throw fail-open preserves original provider payload", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0077-throw-"));
  try {
    await writeProbe(workspace, OLD_BODY);
    const adapter = createPiAdapter({ budgetChars: 8_000 });
    const ctx = { cwd: workspace };
    const persisted = turn1Messages();

    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-t77",
        input: { path: PROBE_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );

    const originalProject = adapter.engine.project.bind(adapter.engine);
    adapter.engine.project = () => {
      throw new Error("simulated context failure");
    };

    const hookResult = await adapter.onContext({ messages: persisted }, ctx);
    assert.equal(hookResult, undefined);

    const requestMessages = hookResult?.messages ?? persisted;
    assert.deepEqual(requestMessages, persisted);
    assert.match(messageText(requestMessages), /T77_OLD/u);

    adapter.engine.project = originalProject;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
