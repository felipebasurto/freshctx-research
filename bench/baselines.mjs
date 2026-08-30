import { FreshCtxEngine } from "../src/engine.mjs";
import { annotateReadMessage } from "../src/transcript.mjs";
import { CorvusSyncedFileSet, renderSyncedContext } from "./corvus.mjs";

function messageText(messages) {
  return messages
    .flatMap((message) => {
      if (typeof message.content === "string") return [message.content];
      if (!Array.isArray(message.content)) return [];
      return message.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text);
    })
    .join("\n\n");
}

function observationMarker(path) {
  return `[observation-mask:${path}] Historical read masked; no live projection supplied.`;
}


export class AppendOnlyBaseline {
  constructor() {
    this.name = "append-only";
    this.messages = [];
    this.trackedReads = [];
  }

  async read(event, content, meta) {
    this.trackedReads.push({
      ...meta,
      initialContent: content,
    });
    this.messages.push({ role: "tool", content });
  }

  async capture(event) {
    this.messages.push({ role: "user", content: `TASK: ${event.task}` });
    const payloadText = messageText(this.messages);
    return {
      messages: structuredClone(this.messages),
      payloadText,
      projectionText: "",
      telemetry: { totalMs: 0 },
    };
  }
}

export class ObservationMaskBaseline {
  constructor() {
    this.name = "observation-mask";
    this.messages = [];
    this.trackedReads = [];
  }

  async read(event, content, meta) {
    this.trackedReads.push({
      ...meta,
      initialContent: content,
    });
    this.messages.push(
      annotateReadMessage({ role: "tool", content }, { id: meta.unitId, path: meta.path }),
    );
  }

  async capture(event) {
    const masked = this.messages.map((message) => {
      const unitId = message?.metadata?.freshctx?.unitId;
      if (!unitId) return structuredClone(message);
      const read = this.trackedReads.find((item) => item.unitId === unitId);
      const marker = observationMarker(read?.path ?? message.metadata.freshctx.path);
      return { ...structuredClone(message), content: marker };
    });
    masked.push({ role: "user", content: `TASK: ${event.task}` });
    const payloadText = messageText(masked);
    return {
      messages: masked,
      payloadText,
      projectionText: "",
      telemetry: { totalMs: 0 },
    };
  }
}

export class CorvusFileBaseline {
  constructor() {
    this.name = "corvus-file";
    this.messages = [];
    this.trackedReads = [];
    this.synced = new CorvusSyncedFileSet();
  }

  async read(event, content, meta) {
    this.trackedReads.push({
      ...meta,
      initialContent: content,
    });
    const marker = this.synced.syncFile(meta.path);
    this.messages.push({ role: "tool", content: marker });
  }

  async capture(event, workspace) {
    const started = performance.now();
    const files = await this.synced.syncContext(workspace);
    const projectionText = renderSyncedContext(files);
    const history = [
      ...this.messages.map((message) => structuredClone(message)),
      { role: "user", content: `TASK: ${event.task}` },
    ];
    const payloadMessages = projectionText
      ? [...history, { role: "user", content: projectionText }]
      : history;
    return {
      messages: payloadMessages,
      payloadText: messageText(payloadMessages),
      projectionText,
      telemetry: { totalMs: performance.now() - started },
    };
  }
}

export class FreshCtxFileBaseline {
  constructor({ sidecarRunner = null } = {}) {
    this.name = "freshctx-file";
    this.engine = new FreshCtxEngine({ sidecarRunner });
    this.messages = [];
    this.trackedReads = [];
  }

  async read(event, content, meta) {
    const unit = this.engine.trackRead({
      path: meta.path,
      content: meta.fileContent,
      scope: "file",
    });
    this.trackedReads.push({
      ...meta,
      unitId: unit.id,
      initialContent: content,
    });
    this.messages.push(annotateReadMessage({ role: "tool", content: meta.fileContent }, unit));
  }

  async capture(event, workspace) {
    const sourceProvider = Object.fromEntries(
      [...new Set(this.trackedReads.map((read) => read.path))].map((path) => [path, null]),
    );
    for (const path of Object.keys(sourceProvider)) {
      const current = await workspace.tryRead(path);
      if (current === null) {
        delete sourceProvider[path];
      } else {
        sourceProvider[path] = current;
      }
    }
    const request = await this.engine.buildRequest(this.messages, {
      sourceProvider,
      task: event.task,
      budgetChars: event.budgetChars,
    });
    return {
      messages: request.messages,
      payloadText: messageText(request.messages),
      projectionText: request.projection.text,
      telemetry: request.telemetry,
    };
  }
}

export class FreshCtxRegionBaseline {
  constructor({ sidecarRunner = null } = {}) {
    this.name = "freshctx-region";
    this.engine = new FreshCtxEngine({ sidecarRunner });
    this.messages = [];
    this.trackedReads = [];
  }

  async read(event, content, meta) {
    const unit = this.engine.trackRead({
      path: meta.path,
      content,
      scope: event.scope,
      startLine: event.startLine,
      endLine: event.endLine,
      selector: event.selector,
    });
    this.trackedReads.push({
      ...meta,
      unitId: unit.id,
      initialContent: content,
    });
    this.messages.push(annotateReadMessage({ role: "tool", content }, unit));
  }

  async capture(event, workspace) {
    const sourceProvider = Object.fromEntries(
      [...new Set(this.trackedReads.map((read) => read.path))].map((path) => [path, null]),
    );
    for (const path of Object.keys(sourceProvider)) {
      const current = await workspace.tryRead(path);
      if (current === null) {
        delete sourceProvider[path];
      } else {
        sourceProvider[path] = current;
      }
    }
    this.engine.advanceTurn();
    const request = await this.engine.buildRequest(this.messages, {
      sourceProvider,
      task: event.task,
      budgetChars: event.budgetChars,
    });
    return {
      messages: request.messages,
      payloadText: messageText(request.messages),
      projectionText: request.projection.text,
      telemetry: request.telemetry,
    };
  }
}

export const BASELINES = {
  "append-only": AppendOnlyBaseline,
  "observation-mask": ObservationMaskBaseline,
  "corvus-file": CorvusFileBaseline,
  "freshctx-file": FreshCtxFileBaseline,
  "freshctx-region": FreshCtxRegionBaseline,
};

export function createBaseline(name) {
  const Baseline = BASELINES[name];
  if (!Baseline) throw new Error(`unknown baseline: ${name}`);
  return new Baseline();
}
