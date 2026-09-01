# Guion. Long-session cost ledger

Dos brazos. Modelo fijado: **`deepseek-v4-flash`** (solo flash, nunca pro).

Mismos PROMPT en los dos brazos. FreshCtx es Isolated Semantic Engine con
Tree-sitter (default). FreshCtx sin Tree-sitter no existe. El host no expone
un toggle de Tree-sitter.

Nunca pegues una API key. Nunca inventes `request_bytes` ni tokens de un host
vivo. Si el dump no trae `usage.prompt_tokens`, deja `—`.

Working copies: `docs/lab/cost-ledger/.work/` (local). Fixture fuente:
`docs/lab/pi-trial-ts/fixture/`. Dest-root `src/settlement.ts` is missing
(engine `.mjs` only). Start the host in that working copy and set
`FRESHCTX_CWD` / `HERMES_TRIAL_WORKSPACE` (or `PI_TRIAL_WORKSPACE`) to it
so t1 symbol reads hit `.work/<arm>/src/settlement.ts`. Dest-root
`search_files` of `src/settlement.ts` is fail-closed and is not the t1 match.

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

## Brazo B. FreshCtx (`freshctx-ts`)

```bash
node docs/lab/cost-ledger/live.mjs reset freshctx-ts
```

Isolated Semantic Engine on (Tree-sitter default). Mismos ocho PROMPT. Mutate:

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

---

## PCR 0140. Ingest y CI

Dos turnos del pack de medida (`t1-read` + `t2-settle`) son **INVALID** como
coste de sesión larga. No copies `request_bytes` de PCR 0135 y los trates
como un total de ocho turnos.

CI no llama al host. Reimprime dumps de fixture:

```bash
node docs/lab/cost-ledger/print-ledger.mjs --fixture
```

`usage` sale del JSON de **respuesta** del proveedor (`prompt_tokens`,
`completion_tokens`). Un proxy dump-only no convierte el dummy
`usage.prompt_tokens: 0` en tokens reales.

Nunca pegues `DEEPSEEK_API_KEY`. Isolated Semantic Engine / Tree-sitter
siguen el default de FreshCtx. El host no expone un toggle de Tree-sitter.
