import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildReadToolCall,
  buildToolResultMessage,
  captureProviderRequest,
  DEFAULT_BUDGET_CHARS,
  messageText,
  toProviderPayload,
} from "../../../adapters/pi/replay.mjs";

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const OLD_MARK = "FRESHCTX_TRIAL_OLD";
const NEW_MARK = "FRESHCTX_TRIAL_NEW";

function parseArgs(argv) {
  const out = { repo: "", paths: [], budgetChars: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo") out.repo = argv[++i] ?? "";
    else if (arg === "--paths") {
      out.paths = String(argv[++i] ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (arg === "--budget") out.budgetChars = Number(argv[++i]);
  }
  return out;
}

export function utf8Bytes(text) {
  return Buffer.byteLength(String(text), "utf8");
}

export function pieceTokens(text) {
  const matches = String(text).match(/[A-Za-z_][A-Za-z0-9_]*|\d+|[^\s]/g);
  return matches?.length ?? 0;
}

export function chars4Proxy(bytes) {
  return Math.ceil(bytes / 4);
}

function stampLine(path, mark) {
  if (/\.py$/u.test(path)) return `# ${mark}`;
  if (/\.md$/u.test(path)) return `<!-- ${mark} -->`;
  return `// ${mark}`;
}

function messageBody(message) {
  if (typeof message?.content === "string") return message.content;
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function payloadText(payload) {
  return JSON.stringify(payload);
}

async function writeFixture(root) {
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "README.md"),
    "# Trial fixture\n\nSmall workspace for the Pi with/without comparison.\n",
    "utf8",
  );
  await writeFile(
    join(root, "src/auth.ts"),
    [
      "export function refreshToken(userId: string) {",
      `  const secret = '${OLD_MARK}';`,
      "  return `${userId}:${secret}`;",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  return ["README.md", "src/auth.ts"];
}

async function cloneRepo(url, dest) {
  await execFile("git", ["clone", "--depth", "1", url, dest], { timeout: 120_000 });
}

async function listCandidatePaths(root) {
  const { stdout } = await execFile("git", ["-C", root, "ls-files"], { timeout: 30_000 });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((path) => !path.includes("node_modules/"))
    .filter((path) => /\.(md|ts|tsx|js|mjs|py|go|rs)$/u.test(path));
}

async function pickPaths(root, requested) {
  if (requested.length > 0) return requested;
  const listed = await listCandidatePaths(root).catch(() => []);
  const readme = listed.find((path) => path.toLowerCase() === "readme.md");
  const sources = listed.filter((path) => path !== readme);
  const chosen = [readme, ...sources].filter(Boolean).slice(0, 2);
  if (chosen.length === 0) throw new Error("no text files to read in workspace");
  return chosen;
}

async function readWorkspaceFile(root, relPath) {
  const content = await readFile(join(root, relPath), "utf8");
  return content.replaceAll("\r\n", "\n");
}

function buildPersistedMessages(reads) {
  const messages = [
    {
      role: "user",
      content: `Read ${reads.map((read) => read.path).join(" and ")} and tell me what they contain.`,
    },
  ];
  for (const read of reads) {
    messages.push(
      buildReadToolCall({ toolCallId: read.callId, path: read.path }),
      buildToolResultMessage({ toolCallId: read.callId, content: read.content }),
    );
  }
  messages.push({ role: "user", content: "After any edits, quote the current file contents." });
  return messages;
}

function extractFreshCtxUnit(projectionText, path) {
  if (!projectionText) return "";
  const needle = `path="${path}"`;
  const start = projectionText.indexOf(needle);
  if (start < 0) return "";
  const open = projectionText.lastIndexOf("<freshctx-unit", start);
  const close = projectionText.indexOf("</freshctx-unit>", start);
  if (open < 0 || close < 0) return "";
  const tagEnd = projectionText.indexOf(">", open);
  if (tagEnd < 0) return "";
  return projectionText.slice(tagEnd + 1, close);
}

function perReadMetrics(reads, { withMessages, projectionText }) {
  return reads.map((read) => {
    const withoutBytes = utf8Bytes(read.content);
    const toolMsg = withMessages.find(
      (message) =>
        message.role === "tool" && (message.toolCallId ?? message.tool_call_id) === read.callId,
    );
    const withBody = toolMsg ? messageBody(toolMsg) : "";
    const projected = extractFreshCtxUnit(projectionText, read.path);
    const markerBytes = utf8Bytes(withBody);
    const projectedBytes = utf8Bytes(projected);
    return {
      path: read.path,
      callId: read.callId,
      without: {
        utf8Bytes: withoutBytes,
        pieceTokens: pieceTokens(read.content),
        chars4Proxy: chars4Proxy(withoutBytes),
      },
      with: {
        markerUtf8Bytes: markerBytes,
        projectedUtf8Bytes: projectedBytes,
        utf8Bytes: markerBytes + projectedBytes,
        pieceTokens: pieceTokens(withBody) + pieceTokens(projected),
        chars4Proxy: chars4Proxy(markerBytes + projectedBytes),
      },
    };
  });
}

function scoreMessages(messages) {
  const text = messageText(messages);
  return {
    current: text.includes(NEW_MARK),
    stale: text.includes(OLD_MARK),
    hasMarker: text.includes("[freshctx:"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = await mkdtemp(join(tmpdir(), "freshctx-pi-trial-"));
  let source = "fixture";
  let paths;

  try {
    if (args.repo) {
      source = args.repo;
      await cloneRepo(args.repo, root);
      paths = await pickPaths(root, args.paths);
    } else {
      paths = await writeFixture(root);
    }

    const editPath = paths.find((path) => path !== "README.md") ?? paths[0];
    const rawEdit = await readWorkspaceFile(root, editPath);
    const stamped = rawEdit.includes(OLD_MARK)
      ? rawEdit
      : `${rawEdit.replace(/\n$/u, "")}\n${stampLine(editPath, OLD_MARK)}\n`;
    await writeFile(join(root, editPath), stamped, "utf8");

    const reads = [];
    for (const [index, path] of paths.entries()) {
      const content = await readWorkspaceFile(root, path);
      reads.push({ path, callId: `call-${index + 1}`, content });
    }

    const edited = reads.find((read) => read.path === editPath) ?? reads[0];
    const mutated = edited.content.replaceAll(OLD_MARK, NEW_MARK);
    await writeFile(join(root, edited.path), mutated, "utf8");

    const persisted = buildPersistedMessages(reads);

    const withoutPayload = toProviderPayload(persisted);
    const withoutDump = payloadText(withoutPayload);
    const withoutBytes = utf8Bytes(withoutDump);

    const budgetChars = args.budgetChars ?? DEFAULT_BUDGET_CHARS;

    const captured = await captureProviderRequest({
      cwd: root,
      persistedMessages: persisted,
      budgetChars,
    });
    const withDump = payloadText(captured.payload);
    const withBytes = utf8Bytes(withDump);

    const readsTable = perReadMetrics(reads, {
      withMessages: captured.requestMessages,
      projectionText: captured.projectionText,
    });

    const result = {
      schemaVersion: 1,
      label: "replay",
      notAPaperResult: true,
      driver: "adapters/pi/replay.mjs (same handlers as extension.ts)",
      piCliInstalled: false,
      source,
      workspace: root,
      editedPath: edited.path,
      budgetChars,
      capturedAt: new Date().toISOString(),
      totals: {
        without: {
          utf8Bytes: withoutBytes,
          pieceTokens: pieceTokens(withoutDump),
          chars4Proxy: chars4Proxy(withoutBytes),
        },
        with: {
          utf8Bytes: withBytes,
          pieceTokens: pieceTokens(withDump),
          chars4Proxy: chars4Proxy(withBytes),
          adapterApplied: captured.adapterApplied,
          projectionBytes: captured.telemetry.projectionBytes ?? utf8Bytes(captured.projectionText),
        },
        deltaUtf8Bytes: withoutBytes - withBytes,
        deltaPieceTokens: pieceTokens(withoutDump) - pieceTokens(withDump),
      },
      score: {
        without: scoreMessages(persisted),
        with: scoreMessages(captured.requestMessages),
      },
      reads: readsTable,
    };

    const outPath = join(here, "last-run.json");
    await mkdir(here, { recursive: true });
    await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    process.stdout.write(
      [
        `driver=${result.driver}`,
        `source=${source}`,
        `edited=${edited.path}`,
        `without.bytes=${withoutBytes} with.bytes=${withBytes} delta=${result.totals.deltaUtf8Bytes}`,
        `without.pieceTokens=${result.totals.without.pieceTokens} with.pieceTokens=${result.totals.with.pieceTokens}`,
        `score.without stale=${result.score.without.stale} current=${result.score.without.current}`,
        `score.with stale=${result.score.with.stale} current=${result.score.with.current}`,
        `wrote ${outPath}`,
        "",
      ].join("\n"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}
