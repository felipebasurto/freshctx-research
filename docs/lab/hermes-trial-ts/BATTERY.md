# Guion. Hermes TypeScript measure pack

Tres brazos. Tres procesos Hermes separados. Modelo fijado: **`deepseek-v4-flash`**
(solo flash, nunca pro).

Mismos PROMPT en los tres brazos. Tree-sitter se controla en el harness
(`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off` en brazo B). El host pasa `scope=symbol` con selector
`settleDailyLedger`; FreshCtx recibe esa observación vía tool args.

Ventana **HERMES** para PROMPT. Ventana **CMD** para `live.mjs` / `print-columns.mjs`.
Nunca pegues un PROMPT en CMD. Nunca pegues una API key.

Working copies en `docs/lab/hermes-trial-ts/.work/`. El fixture fuente está en
`docs/lab/pi-trial-ts/fixture/`. Dest-root `src/settlement.ts` no existe (solo
engine `.mjs`). Arranca Hermes en la working copy y exporta
`FRESHCTX_CWD` / `HERMES_TRIAL_WORKSPACE` a esa carpeta para que el
`read_file` de t1 no apunte al dest-root.

FreshCtx plugin path: desde la raíz del repo FreshCtx
(`adapters/hermes`), no desde `docs/`.

Después de cada PROMPT anota tiempo y tokens si Hermes los muestra.

---

## Brazo A. Hermes solo (`nothing`)

### A0. CMD

```bash
node docs/lab/hermes-trial-ts/live.mjs reset nothing
cd docs/lab/hermes-trial-ts/.work/nothing
hermes chat --provider openai --model deepseek-v4-flash
```

### A1. HERMES — t1-read

```text
Lee el símbolo settleDailyLedger en src/settlement.ts con scope=symbol y selector settleDailyLedger.

No edites. No crees archivos. Responde solo:

SETTLE=...
```

Esperado: `SETTLE=ST0`.

### A2. CMD — flip

```bash
node docs/lab/hermes-trial-ts/live.mjs mutate nothing flip-settle
```

Debe imprimir `"value": "ST1"` en `MARKER_SETTLE`.

### A3. HERMES — t2-settle (igual en A, B y C)

```text
No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_SETTLE dentro de settleDailyLedger en src/settlement.ts?
Responde una sola línea: SETTLE=...
```

Anota la respuesta. Cierra Hermes.

---

## Brazo B. FreshCtx sin Tree-sitter (`freshctx-no-ts`)

### B0. CMD

```bash
node docs/lab/hermes-trial-ts/live.mjs reset freshctx-no-ts
node adapters/hermes/install.mjs docs/lab/hermes-trial-ts/.work/freshctx-no-ts/hermes-home/plugins
cd docs/lab/hermes-trial-ts/.work/freshctx-no-ts
export FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off
export HERMES_HOME="$PWD/hermes-home"
hermes chat --provider openai --model deepseek-v4-flash
```

Configura `context.engine: freshctx` y añade `freshctx` a `plugins.enabled` en `HERMES_HOME/config.yaml`.

### B1. HERMES — mismo PROMPT que A1

### B2. CMD — `mutate freshctx-no-ts flip-settle`

### B3. HERMES — mismo PROMPT que A3

Cierra Hermes.

---

## Brazo C. FreshCtx con Tree-sitter (`freshctx-ts`)

Isolated Semantic Engine inyectado por defecto. Turn-1 host read usa `scope=symbol` con selector
`settleDailyLedger`. Tree-sitter refresca solo ese símbolo tras el flip.

### C0. CMD

```bash
node docs/lab/hermes-trial-ts/live.mjs reset freshctx-ts
node adapters/hermes/install.mjs docs/lab/hermes-trial-ts/.work/freshctx-ts/hermes-home/plugins
cd docs/lab/hermes-trial-ts/.work/freshctx-ts
unset FRESHCTX_ISOLATED_SEMANTIC_ENGINE
export HERMES_HOME="$PWD/hermes-home"
hermes chat --provider openai --model deepseek-v4-flash
```

Configura `context.engine: freshctx` y añade `freshctx` a `plugins.enabled` en `HERMES_HOME/config.yaml`.

### C1. HERMES — mismo PROMPT que A1

### C2. CMD — `mutate freshctx-ts flip-settle`

### C3. HERMES — mismo PROMPT que A3

Cierra Hermes.

---

## Driver automático

```bash
node docs/lab/hermes-trial-ts/auto-rpc.mjs
```

Requiere `hermes` en PATH. El dump proxy captura POSTs a `/v1/chat/completions`.
`launch-hermes` crea `HERMES_HOME` aislado e instala FreshCtx en B/C.

Tras capturar:

```bash
node docs/lab/hermes-trial-ts/print-columns.mjs
```

Columnas: `arm`, `turn`, `t2_exact_new_bytes`, `sibling_bytes_in_request`,
`request_bytes`, `prompt_tokens`, `hermes_stdout_current`, `resolution`.

Rellena `REPORT.md` con números reales. No inventes `AUTORESEARCH_SCORE`.

---

## Si te pierdes

- `mutate nothing` solo en brazo A.
- `mutate freshctx-no-ts` solo en brazo B.
- `mutate freshctx-ts` solo en brazo C.
- Nunca un `mutate` antes del primer PROMPT de ese brazo.
