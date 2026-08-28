import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { installHermesPlugin } from "../adapters/hermes/install.mjs";
import {
  buildReadToolCall,
  buildToolResultMessage,
  createHermesAdapter,
  createHermesStateFile,
  messageText as hermesMessageText,
} from "../adapters/hermes/replay.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOST_ROOT = join(ROOT, "bench", "hosts", "hermes");
const PROBE_PATH = "probe.ts";
const OLD_BODY = "export const marker = 'PCR_0097_OLD_TOOL_RESULT';\n".repeat(8);
const NEW_BODY = "export const marker = 'PCR_0097_NEW_ON_DISK';\n".repeat(8);

const PYTHON_PROBE = `
import copy
import json
import os
import sys

payload = json.load(sys.stdin)
os.chdir(payload["workspace"])
sys.path.insert(0, payload["pluginRoot"])
sys.path.insert(1, payload["hostRoot"])

from plugins.context_engine import load_context_engine
from agent.conversation_loop import _apply_context_engine_selection


class Logger:
    def __init__(self):
        self.warning_calls = []

    def warning(self, *args, **kwargs):
        self.warning_calls.append({
            "args": [str(arg) for arg in args],
            "kwargs": {key: str(value) for key, value in kwargs.items()},
        })


class Agent:
    pass


def message_text(messages):
    parts = []
    for message in messages:
        content = message.get("content")
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts.append(str(part.get("text", "")))
    return "\\n\\n".join(parts)


engine = load_context_engine("freshctx")
assert engine is not None, "official loader failed to load freshctx"

agent = Agent()
agent.context_compressor = engine
agent.session_id = "pcr-0097-session"
engine.on_session_start("pcr-0097-session", hermes_home=payload["hermesHome"])

turn1_persisted = payload["turn1Persisted"]
engine.on_turn_complete(copy.deepcopy(turn1_persisted))
turn1_logger = Logger()
turn1_selected = _apply_context_engine_selection(
    agent,
    copy.deepcopy(turn1_persisted),
    copy.deepcopy(turn1_persisted),
    copy.deepcopy(turn1_persisted[-1]),
    logger=turn1_logger,
)
turn1_projection = turn1_selected[-1]["content"]
assert payload["newBody"] in message_text(turn1_selected), "turn 1 did not serve NEW body"
assert "[freshctx:already-served" not in turn1_projection, "turn 1 collapsed unexpectedly"

# Live Hermes path: projection stays request-only; persisted transcript gets assistant only.
applied_turn1 = copy.deepcopy(turn1_persisted) + [
    {"role": "assistant", "content": "first answer"},
]
engine.on_turn_complete(applied_turn1)

request_only_selected = engine.select_context(
    copy.deepcopy(payload["turn2RequestMessages"]),
    budget_tokens=0,
)
assert isinstance(request_only_selected, list) and request_only_selected, "request-only select returned no list"

host_logger = Logger()
host_selected = _apply_context_engine_selection(
    agent,
    copy.deepcopy(payload["turn2RequestMessages"]),
    copy.deepcopy(payload["turn2ConversationMessages"]),
    copy.deepcopy(payload["turn2ConversationMessages"][-1]),
    logger=host_logger,
)

request_only_text = message_text(request_only_selected)
host_text = message_text(host_selected)
host_projection = host_selected[-1]["content"]

print(json.dumps({
    "engineClass": engine.__class__.__name__,
    "loaderModule": sys.modules["plugins.context_engine"].__file__,
    "cwd": os.getcwd(),
    "requestOnlyCollapsed": "<freshctx " not in request_only_text,
    "requestOnlyNewCopies": request_only_text.count(payload["newBody"]),
    "hostCollapsed": "<freshctx " not in host_text,
    "hostNewCopies": host_text.count(payload["newBody"]),
    "hostNewCopiesInProjection": host_projection.count(payload["newBody"]),
    "hostOldCopies": host_text.count(payload["oldBody"]),
    "hostWarningCount": len(host_logger.warning_calls),
    "turn1WarningCount": len(turn1_logger.warning_calls),
    "conversationMessageCount": len(payload["turn2ConversationMessages"]),
    "requestMessageCount": len(payload["turn2RequestMessages"]),
    "turn1ProjectionBytes": len(turn1_projection),
    "turn2HostProjectionBytes": len(host_projection),
    "turn2RequestOnlyProjectionBytes": len(request_only_selected[-1]["content"]),
}))
`.trim();

function hermesReadPair() {
  return [
    buildReadToolCall({
      toolCallId: "call-hermes-0097",
      path: PROBE_PATH,
    }),
    buildToolResultMessage({
      toolCallId: "call-hermes-0097",
      content: OLD_BODY,
    }),
  ];
}

async function stageOfficialPluginRoot(pluginRoot) {
  const pluginsDir = join(pluginRoot, "plugins");
  await installHermesPlugin(pluginsDir);
  await copyFile(join(HOST_ROOT, "plugins", "__init__.py"), join(pluginsDir, "__init__.py"));
  await copyFile(
    join(HOST_ROOT, "plugins", "context_engine", "__init__.py"),
    join(pluginsDir, "context_engine", "__init__.py"),
  );
  return pluginsDir;
}

test("PCR 0097: Hermes continue later turn collapses after request-only apply ack without persisted projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0097-workspace-"));
  const pluginRoot = await mkdtemp(join(tmpdir(), "freshctx-pcr-0097-plugin-"));
  try {
    await stageOfficialPluginRoot(pluginRoot);
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY, "utf8");

    const turn1Persisted = [
      ...hermesReadPair(),
      { role: "user", content: "quote the current marker" },
    ];
    const turn2RequestMessages = [
      ...hermesReadPair(),
      { role: "user", content: "quote the current marker again" },
    ];
    const turn2ConversationMessages = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote the current marker again" },
    ];

    const run = spawnSync("python3", ["-c", PYTHON_PROBE], {
      cwd: ROOT,
      encoding: "utf8",
      input: JSON.stringify({
        hostRoot: HOST_ROOT,
        pluginRoot,
        hermesHome: join(pluginRoot, "hermes-home"),
        workspace,
        turn1Persisted,
        turn2RequestMessages,
        turn2ConversationMessages,
        newBody: NEW_BODY,
        oldBody: OLD_BODY,
      }),
    });

    assert.equal(run.status, 0, run.stderr || run.stdout || "official Hermes continue probe failed");
    const result = JSON.parse(run.stdout);
    assert.equal(result.engineClass, "FreshCtxContextEngine");
    assert.match(result.loaderModule, /plugins\/context_engine\/__init__\.py$/u);
    assert.equal(result.cwd, workspace);
    assert.equal(result.requestOnlyCollapsed, false);
    assert.equal(result.requestOnlyNewCopies, 1);
    assert.equal(result.hostCollapsed, true);
    assert.equal(result.hostNewCopies, 1, "collapsed tail still requires quoteable current bytes at read slot (PCR 0103)");
    assert.equal(result.hostNewCopiesInProjection, 0, "collapsed stub must not re-dump unit bodies in tail");
    assert.equal(result.hostOldCopies, 0, "stale observation-time tool bytes must not reappear");
    assert.equal(result.hostWarningCount, 0);
    assert.equal(result.turn1WarningCount, 0);
    assert.equal(result.requestMessageCount, 3);
    assert.equal(result.conversationMessageCount, 5);
    assert.ok(result.turn1ProjectionBytes > result.turn2HostProjectionBytes);
    assert.ok(result.turn2HostProjectionBytes < 200);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(pluginRoot, { recursive: true, force: true });
  }
});

test("PCR 0097: replay adapter promotes request-only apply ack from assistant follow-through", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0097-replay-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0097-replay-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: 120_000,
    });
    const ctx = { cwd: workspace };
    const turn1Persisted = [
      ...hermesReadPair(),
      { role: "user", content: "quote the current marker" },
    ];

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx, {
      conversationMessages: structuredClone(turn1Persisted),
    });
    assert.ok(turn1);
    assert.match(turn1.projectionText, /<freshctx /u);

    await adapter.onTurnComplete(
      [
        ...structuredClone(turn1Persisted),
        { role: "assistant", content: "first answer" },
      ],
      ctx,
    );

    const turn2RequestMessages = [
      ...hermesReadPair(),
      { role: "user", content: "quote the current marker again" },
    ];
    const turn2ConversationMessages = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote the current marker again" },
    ];
    const turn2 = await adapter.onSelectContext(structuredClone(turn2RequestMessages), ctx, {
      conversationMessages: structuredClone(turn2ConversationMessages),
    });
    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 1);
    assert.equal(turn2.projectionText, "");
    assert.equal(turn2.telemetry.projectionBytes, 0);
    assert.equal(hermesMessageText(turn2.messages).split(NEW_BODY).length - 1, 1);
    assert.equal(turn2.projectionText.split(NEW_BODY).length - 1, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0097: continue leftover pending does not promote from prior tool+assistant when this turn projection was not delivered", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0097-continue-leftover-"));
  try {
    await writeFile(join(workspace, PROBE_PATH), NEW_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0097-continue-leftover-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: 120_000,
    });
    const ctx = { cwd: workspace };
    const priorHistory = [
      ...hermesReadPair(),
      { role: "user", content: "prior continue turn" },
      { role: "assistant", content: "prior assistant answer" },
    ];
    const undeliveredTurn = [
      ...structuredClone(priorHistory),
      { role: "user", content: "this projection is discarded" },
    ];

    await adapter.onTurnComplete(structuredClone(priorHistory), ctx);
    await adapter.onTurnComplete(structuredClone(undeliveredTurn), ctx);
    const discardedSelect = await adapter.onSelectContext(structuredClone(undeliveredTurn), ctx, {
      conversationMessages: structuredClone(undeliveredTurn),
    });
    assert.ok(discardedSelect);
    assert.match(discardedSelect.projectionText, /<freshctx /u);

    await adapter.onTurnComplete(structuredClone(undeliveredTurn), ctx);

    const retrySelect = await adapter.onSelectContext(structuredClone(undeliveredTurn), ctx, {
      conversationMessages: structuredClone(undeliveredTurn),
    });
    assert.ok(retrySelect);
    assert.equal(retrySelect.telemetry.skipEligibleSelections, 0);
    assert.match(retrySelect.projectionText, /<freshctx /u);
    assert.doesNotMatch(retrySelect.projectionText, /\[freshctx:already-served/u);
    assert.equal(hermesMessageText(retrySelect.messages).split(NEW_BODY).length - 1, 1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
