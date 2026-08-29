# Guion. Pi-only TypeScript measure pack

Tres brazos. Tres procesos Pi separados. Modelo fijado: **`deepseek-v4-flash`**
(solo flash, nunca pro).

Ventana **PI** para PROMPT. Ventana **CMD** para `live.mjs` / `print-columns.mjs`.
Nunca pegues un PROMPT en CMD.

Working copies en `docs/lab/pi-trial-ts/.work/`. El fixture fuente está en
`docs/lab/pi-trial-ts/fixture/`.

Después de cada PROMPT anota tiempo y tokens si Pi los muestra.

---

## Brazo A. Pi solo (`without`)

### A0. CMD

```bash
node docs/lab/pi-trial-ts/live.mjs reset without
cd docs/lab/pi-trial-ts/.work/without
pi --provider deepseek --model deepseek-v4-flash
```

### A1. PI — t1-read

```text
Lee este archivo entero, sin offset:
- src/settlement.ts

No edites. No crees archivos. Responde solo:

SETTLE=...
```

Esperado: `SETTLE=ST0`.

### A2. CMD — flip

```bash
node docs/lab/pi-trial-ts/live.mjs mutate without flip-settle
```

Debe imprimir `"value": "ST1"` en `MARKER_SETTLE`.

### A3. PI — t2-settle (igual en A/B/C)

```text
No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_SETTLE dentro de settleDailyLedger en src/settlement.ts?
Responde una sola línea: SETTLE=...
```

Anota la respuesta. Cierra Pi.

---

## Brazo B. Pi + FreshCtx file-scope (`with-file`)

### B0. CMD

```bash
node docs/lab/pi-trial-ts/live.mjs reset with-file
cd docs/lab/pi-trial-ts/.work/with-file
pi -e /path/to/freshctx/adapters/pi/extension.ts --provider deepseek --model deepseek-v4-flash
```

Sustituye `/path/to/freshctx` por tu checkout.

Opcional: captura de requests

```bash
export PI_TRIAL_DUMP_DIR=/tmp/pi-trial-ts-with-file
pi -e /path/to/freshctx/adapters/pi/extension.ts -e /path/to/freshctx/docs/lab/pi-trial-ts/dump-request.ts ...
```

### B1. PI — mismo PROMPT que A1 (lectura de archivo entero)

### B2. CMD — `mutate with-file flip-settle`

### B3. PI — mismo PROMPT que A3

Cierra Pi.

---

## Brazo C. Pi + FreshCtx symbol + sidecar (`with-symbol`)

### C0. CMD

```bash
node docs/lab/pi-trial-ts/live.mjs reset with-symbol
cd docs/lab/pi-trial-ts/.work/with-symbol
pi -e /path/to/freshctx/adapters/pi/extension.ts --provider deepseek --model deepseek-v4-flash
```

### C1. PI — t1-read (symbol scope)

```text
Lee estos símbolos de src/settlement.ts con scope=symbol (no leas el archivo entero):
- settleDailyLedger
- settleWeeklyLedger

No edites. No crees archivos. Responde solo:

SETTLE=...
SIBLING=...
```

Esperado: `SETTLE=ST0`, `SIBLING=SW0`.

### C2. CMD — `mutate with-symbol flip-settle`

### C3. PI — mismo PROMPT que A3

Cierra Pi.

---

## Tabla impresa

Tras capturar requests (manual con `dump-request.ts` o `auto-rpc.mjs`):

```bash
node docs/lab/pi-trial-ts/print-columns.mjs
```

Columnas: `arm`, `turn`, `t2_exact_new_bytes`, `sibling_bytes_in_request`,
`request_bytes`, `prompt_tokens`, `pi_stdout_current`, `resolution`.

Rellena `REPORT.md` con números reales. No inventes `AUTORESEARCH_SCORE`.

---

## Si te pierdes

- `mutate without` solo en brazo A.
- `mutate with-file` solo en brazo B.
- `mutate with-symbol` solo en brazo C.
- Nunca un `mutate` antes del primer PROMPT de ese brazo.
