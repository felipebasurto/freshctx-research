/**
 * FreshCtx bridge for OpenCode.
 *
 * Sidecar: `freshctx serve --stdio --root <workspace>` (this repo ships the
 * sidecar only, no bridge). This plugin owns the OpenCode side:
 *  - `tool.execute.after` (read tool) -> `observe`
 *  - `experimental.chat.messages.transform` -> `prepare` + atomic apply + `commit`
 *  - `tool: freshctx_*` -> toggle on/off + visibility into when it acts
 *
 * Toggle (checked in this order):
 *  1. In-memory flag via `freshctx_enable` / `freshctx_disable` tools
 *     (or ask the agent "disable freshctx"). Resets on OpenCode restart.
 *  2. Env `FRESHCTX_ENABLED=0|false|off|no|disabled` -> start disabled.
 *     Anything else / unset -> start enabled.
 *
 * Visibility:
 *  - Every act logs via `client.app.log({ service: "freshctx", ... })`
 *    (`observe`, `prepare selected/omitted`, `commit applied/stale`, skips).
 *  - `freshctx_status` tool returns enabled, counts, last action, sidecar health.
 *  - Set `FRESHCTX_DEBUG=1` for per-part match logging.
 *
 * Safety: fail-open everywhere. If any verify/replace/insert step fails the
 * original `output.messages` array is restored (in place) and the original
 * request goes to the model. Never reassign `output.messages` -- the runtime
 * only honors in-place `splice` (see anomalyco/opencode#25754).
 */
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PROTOCOL = "freshctx/1";
const MAX_TRACKED = 20;
const DEFAULT_BUDGET = 12_000;

// ---------------------------------------------------------------------------
// tiny JSONL client (inline so the plugin has no dependency on src/*)
// ---------------------------------------------------------------------------
class FreshCtxClient {
  private child: ChildProcess;
  private nextId = 0;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private closed = false;

  constructor(child: ChildProcess) {
    this.child = child;
    const lines = createInterface({ input: child.stdout as any });
    lines.on("line", (line) => this.receive(line));
    child.once("error", (e) => this.rejectAll(e));
    child.once("exit", (code, signal) => {
      if (!this.closed) this.rejectAll(new Error(`freshctx exited (${code ?? signal ?? "unknown"})`));
    });
  }

  static spawn(command: string, root: string): FreshCtxClient {
    const child = spawn(command, ["serve", "--stdio", "--root", root], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new FreshCtxClient(child);
  }

  private receive(line: string) {
    let res: any;
    try {
      res = JSON.parse(line);
    } catch {
      this.rejectAll(new Error("freshctx emitted invalid JSONL"));
      return;
    }
    const p = this.pending.get(res?.id);
    if (!p) return;
    this.pending.delete(res.id);
    if (res.ok) p.resolve(res.result);
    else {
      const err: any = new Error(res.error?.message ?? "freshctx request failed");
      err.code = res.error?.code;
      err.details = res.error?.details;
      p.reject(err);
    }
  }

  private rejectAll(e: any) {
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
  }

  request(op: string, fields: Record<string, any> = {}): Promise<any> {
    if (this.closed) return Promise.reject(new Error("freshctx client is closed"));
    const id = `rpc_${++this.nextId}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin!.write(`${JSON.stringify({ protocol: PROTOCOL, id, op, ...fields })}\n`, (err: any) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      (this.child.stdin as any)?.end();
    } catch {}
    this.rejectAll(new Error("freshctx client closed"));
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function envEnabled(): boolean {
  const v = (process.env.FRESHCTX_ENABLED ?? "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off" || v === "no" || v === "disabled");
}
function budgetBytes(): number {
  const n = Number(process.env.FRESHCTX_BUDGET_BYTES ?? DEFAULT_BUDGET);
  return Number.isSafeInteger(n) && n >= 0 ? n : DEFAULT_BUDGET;
}
function sha256Hex(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}
function toRelative(root: string, filePath: string): string | null {
  const abs = path.isAbsolute(filePath) ? path.normalize(filePath) : path.join(root, filePath);
  const rel = path.relative(root, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}
function getTextField(part: any): { key: string; text: string } | null {
  for (const key of ["text", "output", "content", "value", "data"]) {
    if (typeof part?.[key] === "string" && part[key].length > 0) return { key, text: part[key] };
  }
  return null;
}
function messagesAlreadyHaveProjection(messages: any[]): boolean {
  return messages.some((m) =>
    (m?.parts ?? []).some((p: any) => {
      const f = getTextField(p);
      return f ? f.text.includes("<freshctx ") || f.text.includes("<freshctx-unit ") : false;
    }),
  );
}

type Observed = { resultId: string; relPath: string; text: string; revision: string };
type LastAction = { at: string; kind: string; detail: string };

export const FreshCtx: Plugin = async ({ client, directory }) => {
  const root: string = directory;
  const command = process.env.FRESHCTX_COMMAND || "freshctx";
  const sessionId = process.env.FRESHCTX_SESSION || `opencode-${path.basename(root)}`;
  let enabled = envEnabled();
  const debug = (process.env.FRESHCTX_DEBUG ?? "") === "1";
  let fc: FreshCtxClient | null = null;
  let helloOk = false;
  const observed = new Map<string, Observed>(); // callID -> observed read
  let lastAction: LastAction | null = null;
  let lastSession: string | null = null;

  // -- persistent stats (survive restarts; powers /freshctx status + script) --
  const statsPath = path.join(root, ".opencode", "freshctx-stats.json");
  const stats: {
    observes: number; prepares: number; applies: number; discards: number; stale: number;
    lastObserveAt: string | null; lastPrepareAt: string | null; lastAppliedAt: string | null;
    lastBytes: number; history: LastAction[];
  } = {
    observes: 0, prepares: 0, applies: 0, discards: 0, stale: 0,
    lastObserveAt: null, lastPrepareAt: null, lastAppliedAt: null,
    lastBytes: 0, history: [],
  };
  // Best-effort load (ignore corrupt/missing).
  try {
    const raw = await readFile(statsPath, "utf8");
    const parsed = JSON.parse(raw);
    for (const k of ["observes", "prepares", "applies", "discards", "stale", "lastBytes"] as const) {
      if (Number.isSafeInteger(parsed?.[k])) (stats as any)[k] = parsed[k];
    }
    for (const k of ["lastObserveAt", "lastPrepareAt", "lastAppliedAt"] as const) {
      if (typeof parsed?.[k] === "string") (stats as any)[k] = parsed[k];
    }
    if (Array.isArray(parsed?.history)) stats.history = parsed.history.slice(-20);
  } catch { /* first run */ }
  let saveTimer: any = null;
  function saveStatsSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      try {
        await mkdir(path.dirname(statsPath), { recursive: true });
        await writeFile(statsPath, JSON.stringify({ ...stats, sessionId, root }, null, 2));
      } catch { /* stats must never break the agent */ }
    }, 150);
  }

  const setLast = (kind: string, detail: string) => {
    lastAction = { at: new Date().toISOString(), kind, detail };
  };
  // record() updates counters + history + lastAction + persists (fire-and-forget).
  function record(kind: string, detail: string, counter?: "observes" | "prepares" | "applies" | "discards" | "stale", bytes?: number) {
    const at = new Date().toISOString();
    lastAction = { at, kind, detail };
    stats.history.push({ at, kind, detail });
    stats.history = stats.history.slice(-20);
    if (counter) {
      stats[counter] += 1;
      if (counter === "observes") stats.lastObserveAt = at;
      if (counter === "prepares") stats.lastPrepareAt = at;
      if (counter === "applies") stats.lastAppliedAt = at;
    }
    if (typeof bytes === "number") stats.lastBytes = bytes;
    saveStatsSoon();
  }

  async function log(level: "debug" | "info" | "warn" | "error", message: string, extra?: any) {
    setLast(level === "info" ? "log" : level, message);
    try {
      await (client as any).app.log({
        body: { service: "freshctx", level, message, extra: { sessionId, enabled, ...extra } },
      });
    } catch {
      console.error(`[freshctx] ${level} ${message}`);
    }
  }

  // Colored TUI toasts: success=green, warning=yellow, error=red, info=blue.
  // Always try/catch: TUI may be unavailable in headless/CLI mode.
  async function toast(
    message: string,
    variant: "info" | "success" | "warning" | "error" = "info",
    title = "FreshCtx",
    duration = 3500,
  ) {
    try {
      await (client as any).tui.showToast({ body: { title, message, variant, duration } });
    } catch {
      // ignore: logs already carry the signal
    }
  }

  async function ensureClient(): Promise<FreshCtxClient | null> {
    if (fc && helloOk) return fc;
    try {
      fc = FreshCtxClient.spawn(command, root);
      const res = await fc.request("hello", {
        session_id: sessionId,
        capabilities: {
          request_rewrite: true,
          stable_result_identity: true,
          projection_insertion: true,
          shared_workspace: true,
        },
        adapter: "opencode-bridge/0.1",
      });
      helloOk = true;
      await log("info", `connected session=${sessionId} idempotent=${res?.idempotent ?? false}`, {
        languages: res?.languages,
      });
      return fc;
    } catch (e: any) {
      await log("warn", `sidecar unavailable (${e?.code ?? e?.message}); failing open`);
      try {
        fc?.close();
      } catch {}
      fc = null;
      helloOk = false;
      return null;
    }
  }

  function track(resultId: string, entry: Observed) {
    observed.set(resultId, entry);
    while (observed.size > MAX_TRACKED) {
      const oldest = observed.keys().next().value as string;
      observed.delete(oldest);
    }
  }

  return {
    // -- toggle + visibility tools (always available, even when disabled) --
    tool: {
      freshctx_status: tool({
        description: "Show FreshCtx bridge status: enabled, sidecar health, tracked reads, last action.",
        args: {},
        async execute() {
          let sidecar: any = { connected: helloOk };
          if (enabled) {
            const c = await ensureClient();
            if (c) {
              try {
                sidecar = { connected: true, ...(await c.request("status", {})) };
              } catch (e: any) {
                sidecar = { connected: false, error: e?.code ?? e?.message };
              }
            } else sidecar = { connected: false, error: "spawn/hello failed" };
          }
          await toast(
            enabled ? `FreshCtx ${stats.applies > 0 ? `updated ${stats.lastAppliedAt}` : "on — no context applied yet"}` : "FreshCtx off",
            enabled ? "info" : "warning",
            "FreshCtx status",
            3000,
          );
          return JSON.stringify(
            {
              enabled, root, sessionId,
              // when / how much: complements the TUI's % context + tokens display
              stats: {
                observes: stats.observes, prepares: stats.prepares,
                applies: stats.applies, discards: stats.discards, stale: stats.stale,
                lastObserveAt: stats.lastObserveAt, lastPrepareAt: stats.lastPrepareAt,
                lastAppliedAt: stats.lastAppliedAt, lastBytes: stats.lastBytes,
              },
              tracked: [...observed.values()].map((o) => ({ resultId: o.resultId, path: o.relPath, revision: o.revision.slice(0, 19) + "…" })),
              lastAction,
              history: stats.history.slice(-10),
              sidecar,
            },
            null,
            2,
          );
        },
      }),
      freshctx_enable: tool({
        description: "Enable FreshCtx live-context rewriting for future model calls.",
        args: {},
        async execute() {
          enabled = true;
          await log("info", "enabled via freshctx_enable");
          await toast("FreshCtx ON — reads will be kept fresh", "success");
          return "freshctx enabled";
        },
      }),
      freshctx_disable: tool({
        description: "Disable FreshCtx live-context rewriting (hooks become no-ops, original request is sent).",
        args: {},
        async execute() {
          enabled = false;
          await log("info", "disabled via freshctx_disable");
          await toast("FreshCtx OFF — original requests go through", "warning");
          return "freshctx disabled";
        },
      }),
    },

    event: async ({ event }: any) => {
      const type = event?.type as string | undefined;
      if (!type) return;
      if (type === "session.created" || type === "session.updated") {
        lastSession = event?.properties?.id ?? event?.properties?.sessionID ?? lastSession;
      }
      if (type === "session.idle" && debug) {
        await log("debug", `session idle tracked_reads=${observed.size}`);
      }
    },

    // -- observe: after every successful `read`, archive exact bytes --
    "tool.execute.after": async (input: any, output: any) => {
      try {
        if (input?.tool !== "read") return; // v1: precise reads only
        if (!enabled) return;
        const rawPath: string | undefined =
          input?.args?.filePath ?? input?.args?.path ?? input?.args?.file_path;
        const content: unknown = output?.output;
        if (!rawPath || typeof content !== "string" || content.length === 0) return;
        if (output?.metadata?.error) return;
        const relPath = toRelative(root, String(rawPath));
        if (!relPath) {
          if (debug) await log("debug", `observe skip outside root path=${String(rawPath).slice(0, 120)}`);
          return;
        }
        if (Buffer.byteLength(content, "utf8") > 512 * 1024) {
          await log("warn", `observe skip file_too_large path=${relPath}`);
          return;
        }
        const c = await ensureClient();
        if (!c) return; // fail open
        const resultId = String(input.callID ?? input.callId ?? randomUUID());
        try {
          const res = await c.request("observe", {
            result_id: resultId,
            path: relPath,
            content_utf8_base64: Buffer.from(content, "utf8").toString("base64"),
          });
          track(resultId, { resultId, relPath, text: content, revision: sha256Hex(content) });
          lastSession = input.sessionID ?? lastSession;
          record("observe", `${relPath} -> ${res?.unit_id}`, "observes");
          await log("info", `observe ${relPath} -> ${res?.unit_id} idempotent=${res?.idempotent ?? false}`, {
            resultId,
            unitId: res?.unit_id,
          });
        } catch (e: any) {
          await log("warn", `observe failed path=${relPath} code=${e?.code ?? "unknown"} ${e?.message ?? ""}`);
        }
      } catch (e: any) {
        // never break the agent on bridge bugs
        console.error(`[freshctx] observe wrapper failed: ${e?.message}`);
      }
    },

    // -- prepare/commit: rewrite the LLM-bound copy, never the stored session --
    "experimental.chat.messages.transform": async (_input: any, out: any) => {
      const messages: any[] | undefined = out?.messages;
      if (!Array.isArray(messages) || messages.length === 0) return;
      if (!enabled) return;
      if (observed.size === 0) return;
      if (messagesAlreadyHaveProjection(messages)) {
        if (debug) await log("debug", "transform skip: projection already present (idempotency guard)");
        return;
      }
      const backup = structuredClone(messages);
      const restore = () => {
        messages.splice(0, messages.length, ...backup);
      };
      try {
        const c = await ensureClient();
        if (!c) return;
        const resultIds = [...observed.keys()];
        const requestId = randomUUID();
        const plan = await c.request("prepare", { request_id: requestId, result_ids: resultIds, budget_bytes: budgetBytes() });
        record("prepare", `request=${requestId.slice(0, 8)} results=${resultIds.length}`, "prepares");

        // atomic apply: every replacement must verify + land, else discard plan
        for (const r of plan?.replacements ?? []) {
          const known = observed.get(r.result_id);
          if (!known) {
            await log("warn", `prepare discard: unknown_result ${r.result_id}`);
            return; // fail open: keep original messages
          }
          if (known.revision !== r.expected_sha256) {
            await log("warn", `prepare discard: hash mismatch ${r.result_id} (tool output changed since observe)`);
            return;
          }
          let replaced = false;
          for (const msg of messages) {
            for (const part of msg?.parts ?? []) {
              const f = getTextField(part);
              if (f && f.text.includes(known.text)) {
                part[f.key] = f.text.split(known.text).join(String(r.marker));
                replaced = true;
              } else if (f && debug && f.text.length > 0) {
                // debug only; truncated tool outputs won't contain full bytes -> expected discard path
              }
            }
          }
          if (!replaced) {
            await log("warn", `prepare discard: result not in request copy ${r.result_id} (truncated or compacted?)`);
            restore();
            record("discard", `result not in request copy ${r.result_id}`, "discards");
            await toast("FreshCtx skipped — tool output not in request (fail-open)", "warning");
            return;
          }
        }

        // insert single live projection (in place)
        const projectionText = Buffer.from(String(plan.projection_utf8_base64 ?? ""), "base64").toString("utf8");
        if (!projectionText) {
          await log("warn", "prepare discard: empty projection");
          restore();
          return;
        }
        const last = messages[messages.length - 1];
        if (last && Array.isArray(last.parts)) {
          last.parts.push({ type: "text", text: `\n${projectionText}` });
        } else {
          messages.splice(messages.length, 0, { info: { role: "user" }, parts: [{ type: "text", text: projectionText }] } as any);
        }

        // commit revalidates selected revisions; stale -> discard
        try {
          const commit = await c.request("commit", { plan_id: plan.plan_id });
          const bytes = Buffer.byteLength(projectionText, "utf8");
          record(
            "applied",
            `plan=${String(plan.plan_id).slice(0, 12)}… selected=${plan.selected?.length ?? 0} omitted=${plan.omitted?.length ?? 0} bytes=${bytes}`,
            "applies",
            bytes,
          );
          await log("info", `freshctx applied plan=${plan.plan_id} selected=[${(plan.selected ?? []).join(",")}] omitted=${(plan.omitted ?? []).length} unresolved=${(plan.unresolved ?? []).length}`, {
            planId: plan.plan_id,
            selected: plan.selected,
            omitted: plan.omitted,
            commitIdempotent: commit?.idempotent,
          });
          await toast(
            `Fresh context applied — ${plan.selected?.length ?? 0} fresh, ${plan.omitted?.length ?? 0} omitted`,
            "success",
            "FreshCtx",
            3000,
          );
        } catch (e: any) {
          restore();
          record("stale", `commit ${e?.code ?? "failed"}; sent original`, "stale");
          await log("warn", `commit ${e?.code ?? "failed"}; discarded plan and sent original request`, {
            code: e?.code,
            details: e?.details,
          });
          await toast(`FreshCtx stale (${e?.code ?? "changed file"}) — sent original request`, "warning");
        }
      } catch (e: any) {
        try {
          (messages as any[]).splice(0, messages.length, ...structuredClone(backup));
        } catch {}
        await log("warn", `transform failed open (${e?.code ?? e?.message})`);
      }
    },
  };
};

export default FreshCtx;
