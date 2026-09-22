# Launch Plan

This is an unpublished planning draft. The link placeholders were never filled.
It is not a result, a measurement, or the public article.

## Positioning

One sentence:

> FreshCtx is a live, versioned context layer that prevents coding agents from
> sending stale and duplicated code to the model.

The memorable bug:

> A coding agent reads `auth.ts`, edits it, and then sends the old and new
> versions together on the next request because its transcript is append-only.

The measurable promise:

> Given the same workspace and trace, FreshCtx emits one byte-exact current
> version, reports uncertainty instead of guessing, and measures the bytes and
> milliseconds required—without calling a model.

## Launch sequence

### Stage 1 — Invariant prototype

Publish when local CI, thesis, CtxBench contract, paper manifest, starter
adapters, and synthetic demo are ready. Use only the labels `prototype` and
`synthetic`.

Assets:

- 15-second terminal recording: old code read -> file changes -> next payload
  contains stable marker plus one current unit;
- benchmark JSON showing zero stale bytes and deterministic hashes;
- architecture diagram from `docs/ARCHITECTURE.md`;
- a “what would falsify this?” section linking to CtxBench.

### Stage 2 — Public repository alpha

Publish the first Flask/Express trace pack, locked commits, raw JSONL, and
CORVUS-file reproduction. Announce measured bytes and p95 transform time, not
agent capability.

### Stage 3 — Research release

Publish only after the Level 4 gates: sealed multi-language holdout, Pi and
Hermes capture, independent reproduction, paper/preprint, and raw evidence.

## GitHub front page

Above the fold should contain:

1. `Never send stale code to an agent.`
2. a four-line before/after payload example;
3. current evidence badge: tests, deterministic benchmark, supported adapters;
4. precise prototype warning;
5. `npm test`, `npm run ctxbench`, and paper download commands;
6. link to thesis and normative evaluation.

Do not lead with a generic “AI context management platform” description. Lead
with the concrete state bug.

Recommended topics: `coding-agents`, `context-engineering`, `autoresearch`,
`prompt-caching`, `developer-tools`, `llm-infrastructure`.

## LinkedIn post — English prototype launch

Coding agents have a state-management bug hiding in plain sight.

They read a file. They edit it. But the old read usually remains frozen inside
an append-only conversation. On the next model call, the prompt can contain two
conflicting versions of the same code.

I started building FreshCtx: an open, live context layer for coding agents.

Historical reads become stable references. Before each model call, FreshCtx
resolves the relevant code against the current workspace and injects one bounded
current view. If it cannot resolve a region safely, it reports uncertainty
instead of sending stale code.

The important part is how I am testing it.

I am not measuring whether an agent “programs better.” Model behavior is
stochastic, so that would make it hard to know what improved. CtxBench uses
deterministic mutation traces on pinned public repositories and a fake provider
that only captures the exact prompt.

It measures stale bytes, duplicate units, exact-current recall, recovery,
context-delta amplification, cacheable-prefix reuse, memory, and p50/p95/p99
transformation latency. Each candidate evaluation uses zero model inference
tokens; the autoresearch coding agent's own usage is tracked separately.

The first dependency-free prototype and thesis are ready. It currently proves
the core invariant on synthetic fixtures; it does not claim state of the art.
The next bar is a faithful comparison with CORVUS-style whole-file
synchronization across public Python, JavaScript, Rust, TypeScript, Go, C, and
Lua repositories.

If this works, harnesses such as Pi and Hermes should be able to adopt it without
changing their model, agent, or prompt doctrine.

Repository: [ADD LINK]

#CodingAgents #ContextEngineering #OpenSource #AIInfrastructure

## LinkedIn post — Spanish prototype launch

Los agentes de código tienen un problema de gestión de estado que hemos
normalizado.

Leen un archivo. Lo modifican. Pero la lectura antigua suele quedarse congelada
en una conversación append-only. En la siguiente llamada al modelo, el prompt
puede contener dos versiones contradictorias del mismo código.

He empezado a construir FreshCtx: una capa abierta de contexto vivo para agentes
de programación.

Las lecturas históricas se convierten en referencias estables. Antes de cada
llamada, FreshCtx resuelve el código relevante contra el workspace actual e
inyecta una única vista vigente y acotada. Si no puede resolver una región con
seguridad, declara la incertidumbre en vez de enviar código obsoleto.

La parte más importante es cómo lo voy a medir.

No quiero puntuar si el agente “programa mejor”. La salida del modelo no es
determinista y mezclaría demasiadas variables. CtxBench usa mutaciones
reproducibles sobre commits fijos de repositorios públicos y un proveedor falso
que sólo captura el prompt exacto.

Mide bytes obsoletos, duplicados, recall byte a byte del estado actual,
recuperación, amplificación del cambio, reutilización del prefijo cacheable,
memoria y latencias p50/p95/p99. Cada evaluación de un candidato consume cero
tokens de inferencia; el consumo del propio agente autoresearch se registra por
separado.

El primer prototipo sin dependencias y la tesis ya están preparados. Hoy prueba
la invariante central con fixtures sintéticas; todavía no afirma ser estado del
arte. El siguiente listón es compararlo de forma fiel con sincronización de
archivos completos al estilo CORVUS en repos públicos de varios lenguajes.

Si funciona, harnesses como Pi y Hermes podrán integrarlo sin cambiar de modelo,
agente ni doctrina de prompts.

Repositorio: [AÑADIR ENLACE]

#CodingAgents #ContextEngineering #OpenSource #AIInfrastructure

## Demo script

1. Show a tool result containing `role === "admin"`.
2. Modify the file to `permissions.includes("write")` outside the transcript.
3. Run one request capture.
4. Search the payload for both sentinels.
5. Show old count `0`, current count `1`, payload SHA, and transform p95.
6. Run the same trace 100 times and show one unique hash.

The demo ends before any model response. That is the point.

## Paper or preprint outline

1. Mutable state inside append-only agent trajectories.
2. Prior work: masking, CORVUS, structural actions, compiled views, lifecycle,
   cache systems.
3. FreshCtx architecture and invariants.
4. CtxBench: public corpus, trace generator, independent oracle, metrics.
5. File versus region/symbol results.
6. Pi/Hermes request-capture portability.
7. Failure analysis: rename, move, ambiguity, deletion, parse errors, cache
   churn.
8. Limits and optional downstream-agent study kept separate.

## Claim review checklist

Before publishing a number:

- Is it measured, cited, or only a target?
- Is the label synthetic, replay, or public-repo?
- Are repository and trace hashes public?
- Was the baseline faithful and equally budgeted?
- Did all correctness gates pass?
- Are p95/p99 and raw samples available?
- Does the sentence say context transformer rather than coding agent?
- Can someone reproduce it without an API key?
