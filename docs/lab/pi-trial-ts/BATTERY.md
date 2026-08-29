# Guion. Pi-only TypeScript measure pack

Tres brazos. Tres procesos Pi separados. Modelo fijado: **`deepseek-v4-flash`**
(solo flash, nunca pro).

Mismos PROMPT en los tres brazos. Tree-sitter se controla en el harness
(`FRESHCTX_SIDECAR=off` en brazo B). Pi no pasa `scope=symbol`.

Ventana **PI** para PROMPT. Ventana **CMD** para `live.mjs` / `print-columns.mjs`.
Nunca pegues un PROMPT en CMD.

Working copies en `docs/lab/pi-trial-ts/.work/`. El fixture fuente está en
`docs/lab/pi-trial-ts/fixture/`.

FreshCtx extension path: desde la raíz del repo FreshCtx
(`adapters/pi/extension.ts`), no desde `docs/`.

Después de cada PROMPT anota tiempo y tokens si Pi los muestra.

---

## Brazo A. Pi solo (`nothing`)

### A0. CMD

```bash
node docs/lab/pi-trial-ts/live.mjs reset nothing
cd docs/lab/pi-trial-ts/.work/nothing
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
node docs/lab/pi-trial-ts/live.mjs mutate nothing flip-settle
```

Debe imprimir `"value": "ST1"` en `MARKER_SETTLE`.

### A3. PI — t2-settle (igual en A, B y C)

```text
No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_SETTLE dentro de settleDailyLedger en src/settlement.ts?
Responde una sola línea: SETTLE=...
```

Anota la respuesta. Cierra Pi.

---

## Brazo B. FreshCtx sin Tree-sitter (`freshctx-no-ts`)

### B0. CMD

```bash
node docs/lab/pi-trial-ts/live.mjs reset freshctx-no-ts
cd docs/lab/pi-trial-ts/.work/freshctx-no-ts
export FRESHCTX_SIDECAR=off
pi -e /path/to/freshctx/adapters/pi/extension.ts --provider deepseek --model deepseek-v4-flash
```

Sustituye `/path/to/freshctx` por la raíz del checkout (directorio que contiene
`adapters/pi/extension.ts`).

Opcional: captura de requests

```bash
export FRESHCTX_SIDECAR=off
export PI_TRIAL_DUMP_DIR=/tmp/pi-trial-ts-freshctx-no-ts
pi -e /path/to/freshctx/adapters/pi/extension.ts -e /path/to/freshctx/docs/lab/pi-trial-ts/dump-request.ts ...
```

### B1. PI — mismo PROMPT que A1

### B2. CMD — `mutate freshctx-no-ts flip-settle`

### B3. PI — mismo PROMPT que A3

Cierra Pi.

---

## Brazo C. FreshCtx con Tree-sitter (`freshctx-ts`)

Sidecar inyectado por defecto. Tras PCR 0114, file-scope TS debería usar el
sidecar automáticamente (sin `scope=symbol` del host).

### C0. CMD

```bash
node docs/lab/pi-trial-ts/live.mjs reset freshctx-ts
cd docs/lab/pi-trial-ts/.work/freshctx-ts
unset FRESHCTX_SIDECAR
pi -e /path/to/freshctx/adapters/pi/extension.ts --provider deepseek --model deepseek-v4-flash
```

### C1. PI — mismo PROMPT que A1

### C2. CMD — `mutate freshctx-ts flip-settle`

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

- `mutate nothing` solo en brazo A.
- `mutate freshctx-no-ts` solo en brazo B.
- `mutate freshctx-ts` solo en brazo C.
- Nunca un `mutate` antes del primer PROMPT de ese brazo.
