# Guion. Multi-turn host trial

Tres brazos. Hosts: **Pi** y/o **Hermes**. Más de dos turnos. Modelo fijado:
**`deepseek-v4-flash`** (solo flash, nunca pro).

Mismos PROMPT en los tres brazos y en ambos hosts. Tree-sitter se controla en el
harness (`FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off` en brazo B). El host pasa
`scope=symbol` con selector `settleDailyLedger`.

Ventana **PI** o **HERMES** para PROMPT. Ventana **CMD** para `live.mjs` /
`print-columns.mjs`. Nunca pegues un PROMPT en CMD. Nunca pegues una API key.

Working copies en `docs/lab/multi-turn-trial/.work/{host}/{arm}/`.
El fixture fuente está en `docs/lab/pi-trial-ts/fixture/`.

Launch patterns: Pi usa `adapters/pi/extension.ts` como `pi-trial-ts`.
Hermes usa `launch-hermes` / `adapters/hermes` como `hermes-trial-ts`.

Después de cada PROMPT anota tiempo y tokens si el host los muestra.

---

## Brazo A. Host solo (`nothing`)

### A0. CMD — Pi

```bash
node docs/lab/multi-turn-trial/live.mjs reset pi nothing
cd docs/lab/multi-turn-trial/.work/pi/nothing
pi --provider deepseek --model deepseek-v4-flash
```

### A0. CMD — Hermes

```bash
node docs/lab/multi-turn-trial/live.mjs reset hermes nothing
cd docs/lab/multi-turn-trial/.work/hermes/nothing
hermes chat --provider openai --model deepseek-v4-flash
```

### A1. HOST — t1-read

```text
Lee el símbolo settleDailyLedger en src/settlement.ts con scope=symbol y selector settleDailyLedger.

No edites. No crees archivos. Responde solo:

SETTLE=...
```

Esperado: `SETTLE=ST0`.

### A2. CMD — flip 1

```bash
node docs/lab/multi-turn-trial/live.mjs mutate pi nothing flip-settle
# o: node docs/lab/multi-turn-trial/live.mjs mutate hermes nothing flip-settle
```

Debe imprimir `"value": "ST1"` en `MARKER_SETTLE`.

### A3. HOST — t2-settle

```text
No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_SETTLE dentro de settleDailyLedger en src/settlement.ts?
Responde una sola línea: SETTLE=...
```

### A4. CMD — flip 2

```bash
node docs/lab/multi-turn-trial/live.mjs mutate pi nothing flip-settle-2
# o: node docs/lab/multi-turn-trial/live.mjs mutate hermes nothing flip-settle-2
```

Debe imprimir `"value": "ST2"` en `MARKER_SETTLE`.

### A5. HOST — t3-settle

Mismo PROMPT que A3. Esperado si el host ve disco: `SETTLE=ST2`.

### A6. HOST — t4-unchanged

Sin `mutate`. Mismo PROMPT que A3. El disco sigue en `ST2`.

Cierra el host.

---

## Brazo B. FreshCtx sin Isolated Semantic Engine (`freshctx-no-ts`)

### B0. CMD — Pi

```bash
node docs/lab/multi-turn-trial/live.mjs reset pi freshctx-no-ts
cd docs/lab/multi-turn-trial/.work/pi/freshctx-no-ts
export FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off
pi -e /path/to/freshctx/adapters/pi/extension.ts --provider deepseek --model deepseek-v4-flash
```

### B0. CMD — Hermes

```bash
node docs/lab/multi-turn-trial/live.mjs reset hermes freshctx-no-ts
node adapters/hermes/install.mjs docs/lab/multi-turn-trial/.work/hermes/freshctx-no-ts/hermes-home/plugins
cd docs/lab/multi-turn-trial/.work/hermes/freshctx-no-ts
export FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off
export HERMES_HOME="$PWD/hermes-home"
hermes chat --provider openai --model deepseek-v4-flash
```

Configura `context.engine: freshctx` y añade `freshctx` a `plugins.enabled`.

### B1–B6

Mismos PROMPT y flips que A, con `mutate <host> freshctx-no-ts ...`.

---

## Brazo C. FreshCtx con Isolated Semantic Engine (`freshctx-ts`)

### C0. CMD — Pi

```bash
node docs/lab/multi-turn-trial/live.mjs reset pi freshctx-ts
cd docs/lab/multi-turn-trial/.work/pi/freshctx-ts
unset FRESHCTX_ISOLATED_SEMANTIC_ENGINE
pi -e /path/to/freshctx/adapters/pi/extension.ts --provider deepseek --model deepseek-v4-flash
```

### C0. CMD — Hermes

```bash
node docs/lab/multi-turn-trial/live.mjs reset hermes freshctx-ts
node adapters/hermes/install.mjs docs/lab/multi-turn-trial/.work/hermes/freshctx-ts/hermes-home/plugins
cd docs/lab/multi-turn-trial/.work/hermes/freshctx-ts
unset FRESHCTX_ISOLATED_SEMANTIC_ENGINE
export HERMES_HOME="$PWD/hermes-home"
hermes chat --provider openai --model deepseek-v4-flash
```

### C1–C6

Mismos PROMPT y flips que A, con `mutate <host> freshctx-ts ...`.

---

## Driver automático

```bash
node docs/lab/multi-turn-trial/auto-rpc.mjs --host=hermes
node docs/lab/multi-turn-trial/auto-rpc.mjs --host=pi
node docs/lab/multi-turn-trial/auto-rpc.mjs --host=both
```

Requiere `pi` y/o `hermes` en PATH. Nunca pegues una API key en CMD.
Tras capturar:

```bash
node docs/lab/multi-turn-trial/print-columns.mjs
```

Columnas: `host`, `arm`, `turn`, `exact_current_bytes`, `stale_prior_bytes`,
`sibling_bytes_in_request`, `request_bytes`, `prompt_tokens`, `stdout_current`,
`resolution`.

Rellena `REPORT.md` con números reales. No inventes `AUTORESEARCH_SCORE`.

---

## Si te pierdes

- `mutate <host> nothing` solo en brazo A.
- `mutate <host> freshctx-no-ts` solo en brazo B.
- `mutate <host> freshctx-ts` solo en brazo C.
- Nunca un `mutate` antes del primer PROMPT de ese brazo.
- `flip-settle-2` solo después de `flip-settle`.
- Turn 4 no tiene `mutate`.
