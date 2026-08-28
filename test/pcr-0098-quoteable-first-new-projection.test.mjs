import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { installHermesPlugin } from "../adapters/hermes/install.mjs";
import {
  buildReadToolCall as buildHermesReadToolCall,
  buildToolResultMessage as buildHermesToolResultMessage,
  createHermesAdapter,
  createHermesStateFile,
  messageText as hermesMessageText,
} from "../adapters/hermes/replay.mjs";
import {
  createPiAdapter,
  messageText as piMessageText,
} from "../adapters/pi/replay.mjs";
import {
  servedReadToolResultContent,
  shouldInlineServedReadAtToolResult,
  shouldInlineSelectedReadAtToolResult,
} from "../adapters/request-prune.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { stableReadMarker } from "../src/transcript.mjs";

const REGION_PATH = "ws/sample.txt";
const OLD_BODY = "line1 header\nline2 OLD interior\nline3 footer\n";
const NEW_BODY = "line1 header\nline2 NEW interior\nline3 footer\n";
const LINE2_NEW = "line2 NEW interior";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOST_ROOT = join(ROOT, "bench", "hosts", "hermes");
const HERMES_CONTEXT_MODULE = join(HOST_ROOT, "plugins", "context_engine", "__init__.py");
const hermesHostReady = existsSync(HERMES_CONTEXT_MODULE);

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


def tool_result_text(messages):
    for message in messages:
        if message.get("role") != "tool":
            continue
        content = message.get("content")
        if isinstance(content, str):
            return content
    return ""


engine = load_context_engine("freshctx")
assert engine is not None, "official loader failed to load freshctx"

agent = Agent()
agent.context_compressor = engine
agent.session_id = "pcr-0098-session"
engine.on_session_start("pcr-0098-session", hermes_home=payload["hermesHome"])

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
assert payload["oldBody"] in message_text(turn1_selected), "turn 1 did not serve OLD body"
assert payload["newBody"] not in turn1_projection, "turn 1 should not serve NEW yet"

applied_turn1 = copy.deepcopy(turn1_persisted) + [
    {"role": "assistant", "content": "first answer"},
]
engine.on_turn_complete(applied_turn1)

with open(payload["regionPath"], "w", encoding="utf-8") as handle:
    handle.write(payload["newBody"])

host_logger = Logger()
host_selected = _apply_context_engine_selection(
    agent,
    copy.deepcopy(payload["turn2RequestMessages"]),
    copy.deepcopy(payload["turn2ConversationMessages"]),
    copy.deepcopy(payload["turn2ConversationMessages"][-1]),
    logger=host_logger,
)

request_only_selected = engine.select_context(
    copy.deepcopy(payload["turn2RequestMessages"]),
    budget_tokens=0,
)
assert isinstance(request_only_selected, list) and request_only_selected, "request-only select returned no list"

host_text = message_text(host_selected)
host_projection = host_selected[-1]["content"]
host_tool = tool_result_text(host_selected)

print(json.dumps({
    "engineClass": engine.__class__.__name__,
    "loaderModule": sys.modules["plugins.context_engine"].__file__,
    "cwd": os.getcwd(),
    "requestSliceUserCount": sum(1 for message in payload["turn2RequestMessages"] if message.get("role") == "user"),
    "conversationUserCount": sum(1 for message in payload["turn2ConversationMessages"] if message.get("role") == "user"),
    "requestOnlyToolHasSummaryMarker": "supplied in the live projection" in tool_result_text(request_only_selected),
    "hostToolHasLine2New": payload["line2New"] in host_tool,
    "hostToolHasSummaryMarker": "supplied in the live projection" in host_tool,
    "hostProjectionHasFreshctxUnit": "<freshctx-unit" in host_projection,
    "hostProjectionBytes": len(host_projection),
    "turn2RequestOnlyProjectionBytes": len(request_only_selected[-1]["content"]),
    "hostWarningCount": len(host_logger.warning_calls),
    "turn1WarningCount": len(turn1_logger.warning_calls),
}))
`.trim();

function piTurn1Persisted() {
  return [
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-pi-0098",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: REGION_PATH }),
          },
        },
      ],
    },
    {
      role: "tool",
      toolCallId: "call-pi-0098",
      content: OLD_BODY,
    },
    {
      role: "user",
      content: "quote line 2 exactly",
    },
  ];
}

function hermesReadPair() {
  return [
    buildHermesReadToolCall({
      toolCallId: "call-hermes-0098",
      path: REGION_PATH,
    }),
    buildHermesToolResultMessage({
      toolCallId: "call-hermes-0098",
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

function hermesTurn1Persisted() {
  return [
    ...hermesReadPair(),
    {
      role: "user",
      content: "quote line 2 exactly",
    },
  ];
}

function toolResultText(message) {
  if (typeof message?.content === "string") return message.content;
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

test("PCR 0098: turn-2 first-NEW gate requires an assistant reply between user turns", () => {
  const projection = {
    selected: [{ id: "fc_test", content: NEW_BODY }],
    omitted: [],
    text: `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="1">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`,
  };
  const liveTurn2 = [
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "second" },
  ];
  const smokeSecondCapture = [
    { role: "user", content: "first task" },
    { role: "user", content: "second task" },
  ];
  assert.equal(
    shouldInlineServedReadAtToolResult({
      messages: liveTurn2,
      projection,
      skipEligibleSelections: 0,
      projectionText: projection.text,
      lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
    }),
    true,
  );
  assert.equal(
    shouldInlineServedReadAtToolResult({
      messages: smokeSecondCapture,
      projection,
      skipEligibleSelections: 0,
      projectionText: projection.text,
      lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
    }),
    false,
  );
});

test("PCR 0098: Hermes inline gate counts users from conversationMessages, not the narrowed request slice", () => {
  const projection = {
    selected: [{ id: "fc_test", content: NEW_BODY }],
    omitted: [],
    text: `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="1">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`,
  };
  const requestSlice = [
    ...hermesReadPair(),
    { role: "user", content: "quote line 2 raw bytes exactly" },
  ];
  const conversationMessages = [
    ...hermesReadPair(),
    { role: "user", content: "quote line 2 exactly" },
    { role: "assistant", content: "first answer" },
    { role: "user", content: "quote line 2 raw bytes exactly" },
  ];
  assert.equal(
    shouldInlineServedReadAtToolResult({
      messages: requestSlice,
      userCountMessages: conversationMessages,
      projection,
      skipEligibleSelections: 0,
      projectionText: projection.text,
      lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
    }),
    true,
  );
  assert.equal(
    shouldInlineServedReadAtToolResult({
      messages: requestSlice,
      projection,
      skipEligibleSelections: 0,
      projectionText: projection.text,
      lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
    }),
    false,
  );
});

test("PCR 0098: turn-2 first-NEW gate fires only on the second user turn with a live unit body", () => {
  const projection = {
    selected: [{ id: "fc_test", content: NEW_BODY }],
    omitted: [],
    text: `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="1">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`,
  };
  const twoUserTurns = [
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "second" },
  ];
  assert.equal(
    shouldInlineServedReadAtToolResult({
      messages: [{ role: "user", content: "only one" }],
      projection,
      skipEligibleSelections: 0,
      projectionText: projection.text,
      lastInjectedRevision: new Map([["fc_test", "sha256:old"]]),
    }),
    false,
  );
});

test("PCR 0098: stale served read tool results carry current bytes on turn 2", () => {
  const unit = { id: "fc_test", path: REGION_PATH, content: NEW_BODY };
  const selectedUnitIds = new Set(["fc_test"]);
  const fullProjection = `<freshctx turn="2" selected="1" unresolved="0" budget-omitted="0">\n<freshctx-unit id="fc_test" path="${REGION_PATH}" lines="1-4" revision="sha256:x" resolution="whole-file" content-bytes="${Buffer.byteLength(NEW_BODY, "utf8")}">\n${NEW_BODY}\n</freshctx-unit>\n</freshctx>`;
  assert.equal(
    shouldInlineSelectedReadAtToolResult({
      unit,
      observedContent: OLD_BODY,
      projectionText: fullProjection,
      selectedUnitIds,
      turn2FirstNewGate: true,
    }),
    true,
  );
  assert.equal(
    servedReadToolResultContent({
      unit,
      inlineSelectedRead: true,
      selectedUnitIds,
    }),
    NEW_BODY,
  );
  assert.equal(
    shouldInlineSelectedReadAtToolResult({
      unit,
      observedContent: NEW_BODY,
      projectionText: fullProjection,
      selectedUnitIds,
      turn2FirstNewGate: true,
    }),
    false,
  );
  assert.equal(
    servedReadToolResultContent({
      unit,
      inlineSelectedRead: false,
      selectedUnitIds,
    }),
    stableReadMarker(unit),
  );
});

test("PCR 0098: Pi turn-2 first-NEW keeps quoteable interior bytes at the tracked read and full live projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0098-pi-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const adapter = createPiAdapter({ budgetChars: 120_000 });
    const ctx = { cwd: workspace };

    await adapter.onTurnStart({ turnIndex: 1 });
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: "call-pi-0098",
        input: { path: REGION_PATH },
        content: OLD_BODY,
        isError: false,
      },
      ctx,
    );
    const turn1 = await adapter.onContext({ messages: structuredClone(piTurn1Persisted()) }, ctx);
    assert.ok(turn1);
    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn1.messages) } });

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    await adapter.onTurnStart({ turnIndex: 2 });
    const turn2Persisted = [
      ...structuredClone(piTurn1Persisted()),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    const turn2 = await adapter.onContext({ messages: structuredClone(turn2Persisted) }, ctx);
    assert.ok(turn2);
    assert.ok(turn2.projection.text.includes("<freshctx-unit"));
    assert.match(decodeProjectionUnits(turn2.projection.text)[0]?.content ?? "", /line2 NEW interior/u);
    const toolResult = turn2.messages.find((message) => message.role === "tool");
    assert.match(toolResultText(toolResult), /^line1 header\nline2 NEW interior/u);
    assert.doesNotMatch(toolResultText(toolResult), /supplied in the live projection/u);
    assert.ok(turn2.telemetry.projectionBytes > 200);
    assert.doesNotMatch(turn2.projection.text, /already-served units=1\] Current tracked content was already served/u);

    await adapter.onBeforeProviderRequest({ payload: { messages: structuredClone(turn2.messages) } });

    await adapter.onTurnStart({ turnIndex: 3 });
    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: "quote line 2 again unchanged disk" },
    ];
    const turn3 = await adapter.onContext({ messages: structuredClone(turn3Persisted) }, ctx);
    assert.ok(turn3);
    assert.match(turn3.projection.text, /\[freshctx:already-served units=1\]/u);
    assert.doesNotMatch(turn3.projection.text, /<freshctx-unit/u);
    assert.equal(turn3.telemetry.projectionBytes, 99);
    assert.doesNotMatch(piMessageText(turn3.messages), /line2 OLD interior/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0098: Hermes turn-2 first-NEW keeps quoteable interior bytes at the tracked read and full live projection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0098-hermes-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0098-hermes-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: 120_000,
    });
    const ctx = { cwd: workspace };
    const turn1Persisted = hermesTurn1Persisted();

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx);
    assert.ok(turn1);
    await adapter.onTurnComplete(
      [
        ...structuredClone(turn1Persisted),
        { role: "assistant", content: "first answer" },
      ],
      ctx,
    );

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2Persisted = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2Persisted), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2Persisted), ctx);
    assert.ok(turn2);
    assert.ok(turn2.projectionText.includes("<freshctx-unit"));
    assert.match(decodeProjectionUnits(turn2.projectionText)[0]?.content ?? "", /line2 NEW interior/u);
    const toolResult = turn2.messages.find((message) => message.role === "tool");
    assert.match(toolResultText(toolResult), /^line1 header\nline2 NEW interior/u);
    assert.doesNotMatch(toolResultText(toolResult), /supplied in the live projection/u);
    assert.ok(turn2.telemetry.projectionBytes > 200);
    assert.doesNotMatch(turn2.projectionText, /already-served units=1\] Current tracked content was already served/u);

    await adapter.onTurnComplete(
      [
        ...structuredClone(turn2Persisted),
        { role: "assistant", content: LINE2_NEW },
      ],
      ctx,
    );

    const turn3Persisted = [
      ...structuredClone(turn2Persisted),
      { role: "assistant", content: LINE2_NEW },
      { role: "user", content: "quote line 2 again unchanged disk" },
    ];
    await adapter.onTurnComplete(structuredClone(turn3Persisted), ctx);
    const turn3 = await adapter.onSelectContext(structuredClone(turn3Persisted), ctx);
    assert.ok(turn3);
    assert.match(turn3.projectionText, /\[freshctx:already-served units=1\]/u);
    assert.doesNotMatch(turn3.projectionText, /<freshctx-unit/u);
    assert.equal(turn3.telemetry.projectionBytes, 99);
    assert.doesNotMatch(hermesMessageText(turn3.messages), /line2 OLD interior/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0098: Hermes narrowed request slice still inlines quoteable bytes when conversation history proves turn-2 first-NEW", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0098-hermes-narrow-"));
  try {
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");
    const stateFile = await createHermesStateFile("freshctx-pcr-0098-hermes-narrow-state-");
    const adapter = createHermesAdapter({
      stateFile,
      budgetChars: 120_000,
    });
    const ctx = { cwd: workspace };
    const turn1Persisted = hermesTurn1Persisted();

    await adapter.onTurnComplete(structuredClone(turn1Persisted), ctx);
    const turn1 = await adapter.onSelectContext(structuredClone(turn1Persisted), ctx, {
      conversationMessages: structuredClone(turn1Persisted),
    });
    assert.ok(turn1);
    assert.match(decodeProjectionUnits(turn1.projectionText)[0]?.content ?? "", /line2 OLD interior/u);

    await adapter.onTurnComplete(
      [
        ...structuredClone(turn1Persisted),
        { role: "assistant", content: "first answer" },
      ],
      ctx,
    );

    await writeFile(join(workspace, REGION_PATH), NEW_BODY, "utf8");

    const turn2RequestMessages = [
      ...hermesReadPair(),
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    const turn2ConversationMessages = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    await adapter.onTurnComplete(structuredClone(turn2ConversationMessages), ctx);
    const turn2 = await adapter.onSelectContext(structuredClone(turn2RequestMessages), ctx, {
      conversationMessages: structuredClone(turn2ConversationMessages),
    });
    assert.ok(turn2);
    assert.equal(turn2.telemetry.skipEligibleSelections, 0);
    assert.ok(turn2.projectionText.includes("<freshctx-unit"));
    assert.match(decodeProjectionUnits(turn2.projectionText)[0]?.content ?? "", /line2 NEW interior/u);
    const toolResult = turn2.messages.find((message) => message.role === "tool");
    assert.match(toolResultText(toolResult), /^line1 header\nline2 NEW interior/u);
    assert.doesNotMatch(toolResultText(toolResult), /supplied in the live projection/u);
    assert.ok(turn2.telemetry.projectionBytes > 200);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("PCR 0098: official Hermes loader inlines quoteable bytes on narrowed request slice with full conversation history", { skip: !hermesHostReady }, async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0098-official-"));
  const pluginRoot = await mkdtemp(join(tmpdir(), "freshctx-pcr-0098-official-plugin-"));
  try {
    await stageOfficialPluginRoot(pluginRoot);
    await mkdir(join(workspace, "ws"), { recursive: true });
    await writeFile(join(workspace, REGION_PATH), OLD_BODY, "utf8");

    const turn1Persisted = hermesTurn1Persisted();
    const turn2RequestMessages = [
      ...hermesReadPair(),
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];
    const turn2ConversationMessages = [
      ...structuredClone(turn1Persisted),
      { role: "assistant", content: "first answer" },
      { role: "user", content: "quote line 2 raw bytes exactly" },
    ];

    const run = spawnSync("python3", ["-c", PYTHON_PROBE], {
      cwd: ROOT,
      encoding: "utf8",
      input: JSON.stringify({
        hostRoot: HOST_ROOT,
        pluginRoot,
        hermesHome: join(pluginRoot, "hermes-home"),
        workspace,
        regionPath: join(workspace, REGION_PATH),
        turn1Persisted,
        turn2RequestMessages,
        turn2ConversationMessages,
        oldBody: OLD_BODY,
        newBody: NEW_BODY,
        line2New: LINE2_NEW,
      }),
    });

    assert.equal(run.status, 0, run.stderr || run.stdout || "official Hermes quoteable-first-NEW probe failed");
    const result = JSON.parse(run.stdout);
    assert.equal(result.engineClass, "FreshCtxContextEngine");
    assert.match(result.loaderModule, /plugins\/context_engine\/__init__\.py$/u);
    assert.equal(result.cwd, workspace);
    assert.equal(result.requestSliceUserCount, 1);
    assert.equal(result.conversationUserCount, 2);
    assert.equal(result.requestOnlyToolHasSummaryMarker, true);
    assert.equal(result.hostToolHasLine2New, true);
    assert.equal(result.hostToolHasSummaryMarker, false);
    assert.equal(result.hostProjectionHasFreshctxUnit, true);
    assert.ok(result.hostProjectionBytes > 200);
    assert.ok(result.turn2RequestOnlyProjectionBytes > 200);
    assert.equal(result.hostWarningCount, 0);
    assert.equal(result.turn1WarningCount, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(pluginRoot, { recursive: true, force: true });
  }
});
