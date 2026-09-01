# Guion. Long-session cost ledger

Tres brazos. Modelo fijado: **`deepseek-v4-flash`** (solo flash, nunca pro).

Mismos PROMPT en los tres brazos. Tree-sitter se controla en el harness
(`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off` en brazo B). El Isolated Semantic Engine
vive dentro de FreshCtx. El host no expone un toggle de Tree-sitter.

Nunca pegues una API key. Nunca inventes `request_bytes` ni tokens de un host
vivo. Si el dump no trae `usage.prompt_tokens`, deja `—`.

Working copies: `docs/lab/cost-ledger/.work/` (local). Fixture fuente:
`docs/lab/pi-trial-ts/fixture/`.

---

## Brazo A. Host solo (`nothing`)

### A0. CMD

```bash
node docs/lab/cost-ledger/live.mjs reset nothing
```

Arranca el host (Hermes o Pi) con `--model deepseek-v4-flash` en esa working
copy. Opcional: dump proxy del pack de medida de dos turnos.

### A1–A8. Ocho PROMPT

Usa `session.mjs` / `CELLS`: t1-read, flip-settle, t2-settle, t3-reread,
t4-settle, t5-ask-again, t6-reread, t7-settle, t8-ask-again.

Después de t1:

```bash
node docs/lab/cost-ledger/live.mjs mutate nothing flip-settle
```

Si el host muestra tokens, anótalos. No inventes números.

Cierra el host.

---

## Brazo B. FreshCtx sin Tree-sitter (`freshctx-no-ts`)

```bash
node docs/lab/cost-ledger/live.mjs reset freshctx-no-ts
export FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off
```

Instala FreshCtx en el host de ese brazo. Mismos ocho PROMPT. Mutate solo en
ese brazo:

```bash
node docs/lab/cost-ledger/live.mjs mutate freshctx-no-ts flip-settle
```

---

## Brazo C. FreshCtx con Tree-sitter (`freshctx-ts`)

```bash
node docs/lab/cost-ledger/live.mjs reset freshctx-ts
unset FRESHCTX_ISOLATED_SEMANTIC_ENGINE
```

Isolated Semantic Engine on (default). Mismos ocho PROMPT. Mutate:

```bash
node docs/lab/cost-ledger/live.mjs mutate freshctx-ts flip-settle
```

---

## Acumular

Escribe `docs/lab/cost-ledger/.work/capture/summary.json` con turnos reales, o
ingiere `*.scan.json` vía `ingest.mjs`. Luego:

```bash
node docs/lab/cost-ledger/print-ledger.mjs
```

Columnas: `arm`, `turn`, `request_bytes`, `prompt_tokens`, `completion_tokens`,
`token_source`, `cost_proxy_usd`, `cumulative_request_bytes`,
`cumulative_prompt_tokens`, `cumulative_cost_proxy_usd`.

Rellena `REPORT.md` solo con números reales. No inventes un live long-session
table. No toques el official table 549/0/0/549.
