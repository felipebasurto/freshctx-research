import { projectContext } from "./projector.mjs";
import { FreshRegistry } from "./registry.mjs";
import { rewriteHistoricalReads } from "./transcript.mjs";

export class FreshCtxEngine {
  constructor({ policy = {}, turn = 0 } = {}) {
    this.policy = policy;
    this.turn = turn;
    this.registry = new FreshRegistry();
  }

  trackRead(read) {
    return this.registry.trackRead({ ...read, turn: read.turn ?? this.turn });
  }

  async refresh(sourceProvider) {
    return this.registry.refresh(sourceProvider, this.turn);
  }

  project({ task = "", budgetChars, policy = {} } = {}) {
    const projection = projectContext(this.registry.list(), {
      turn: this.turn,
      task,
      budgetChars,
      policy: { ...this.policy, ...policy },
    });
    this.registry.markUsed(projection.selected.map((unit) => unit.id), this.turn);
    return projection;
  }

  rewrite(messages) {
    return rewriteHistoricalReads(messages, this.registry);
  }

  async buildRequest(messages, { sourceProvider, task = "", budgetChars, policy = {} } = {}) {
    const totalStarted = performance.now();
    const refreshStarted = performance.now();
    if (sourceProvider) await this.refresh(sourceProvider);
    const refreshMs = performance.now() - refreshStarted;

    const rewriteStarted = performance.now();
    const rewritten = this.rewrite(messages);
    const rewriteMs = performance.now() - rewriteStarted;

    const projectStarted = performance.now();
    const projection = this.project({ task, budgetChars, policy });
    const projectMs = performance.now() - projectStarted;
    const projectionMessage = {
      role: "user",
      content: projection.text,
      metadata: { freshctx: { projection: true, turn: this.turn } },
    };
    const requestMessages = [...rewritten, projectionMessage];
    const serializeStarted = performance.now();
    const serialized = JSON.stringify(requestMessages);
    const serializeMs = performance.now() - serializeStarted;

    return {
      messages: requestMessages,
      projection,
      telemetry: {
        refreshMs,
        rewriteMs,
        projectMs,
        serializeMs,
        totalMs: performance.now() - totalStarted,
        payloadBytes: Buffer.byteLength(serialized, "utf8"),
        projectionBytes: Buffer.byteLength(projection.text, "utf8"),
      },
    };
  }

  advanceTurn() {
    this.turn += 1;
    return this.turn;
  }
}
