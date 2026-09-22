# Pi trial report. A vs B. `live-host`

No es un paper. No es CtxBench. No es SOTA. Label: `live-host`.

Brazo A: Pi sin extensión. Brazo B: `pi -e …/adapters/pi/extension.ts`
con `FRESHCTX_BUDGET_CHARS=200000`. El primer B1 (budget 24k) se abortó:
omitió los tres archivos grandes; seguir habría medido el omit, no el
refresco.

## Setup

| | |
|---|---|
| Fecha | 2026-08-25, sesión local |
| Host | Pi 0.84.3 (`<local-home>/.hermes/node/bin/pi`) |
| Modelo en UI | `deepseek-v4-pro` · thinking `high` |
| Extensión FreshCtx | no |
| Workspace | `docs/lab/pi-trial/.work/without` (copia de `<local-checkout>`) |
| Repo original | no se tocó |
| Driver | CLI real, prompts pegados a mano |
| Oro de disco | `live.mjs mutate` / markers estampados al reset |

Los números de la franja de Pi se copian tal cual. Lectura nuestra:

- `↑` tokens de entrada (acumulado de sesión en esta UI)
- `↓` tokens de salida (acumulado)
- `CH` cache hit
- `$` coste de sesión que muestra Pi
- `R` y `%/1.0M` se anotan sin interpretarlos como métrica FreshCtx

No hay captura del JSON del request. El score es lo que Pi **dijo**, más lo
que `live.mjs` vio en disco.

## Marcadores

| id | archivo | v0 | v1 | quién lo mueve |
|---|---|---|---|---|
| README | `README.md` | RD0 | RD1 | `mutate flip-readme` |
| CLI | `src/viajante/cli.py` | CL0 | CL1 | `mutate flip-cli` |
| MODELS | `src/viajante/models.py` | MD0 | MD1 | Pi con `edit` |
| FLIGHTS | `src/viajante/flights.py` | FL0 | (no se mutó) | — |
| TODO | `notes/freshctx-todo.md` | TD0 | gone | `mutate delete-todo` |

## Turnos

### A1. Lectura inicial

Disco: RD0 CL0 MD0 FL0 TD0.

Pi respondió los cinco v0. Correcto.

Franja: `↑38k ↓1.9k R6.5k CH17.3% $0.018 3.9%/1.0M`

Leyó los cinco paths. No escribió.

### A2. Mutación externa

`mutate without flip-cli`. Disco: CLI=`CL1`. Solo cambió `src/viajante/cli.py`.

### A3. Pregunta CLI sin herramientas

Pi: `CLI=CL0`. **Stale.** Disco ya era `CL1`. No releyó.

Franja: `↑38k ↓1.9k R46k CH99.6% $0.018 3.9%/1.0M`

Misma factura que A1. Casi todo caché.

### A4. Pi edita models.py

Diff: `# MARKER_MODELS=MD0` → `MD1`. Pi: `MODELS=MD1`. Disco coincide.

Franja: `↑38k ↓2.1k R125k CH99.7% $0.019 4.0%/1.0M`

### A5. Pregunta MODELS sin herramientas

Pi: `MODELS=MD1`. Correcto. Él mismo lo había escrito.

Franja: `↑38k ↓2.1k R164k CH99.9% $0.019 4.0%/1.0M`

### A6. Mutación externa README

`mutate without flip-readme`. Disco: README=`RD1`. Flights sigue `FL0`.

### A7. Pregunta README + FLIGHTS sin herramientas

Pi: README=`RD0` (**stale**). FLIGHTS=`FL0` (correcto, nadie lo mutó).

Franja: `↑38k ↓2.8k R204k CH99.8% $0.020 4.1%/1.0M`

### A8. Borrado

`mutate without delete-todo`. `notes/freshctx-todo.md` ya no existe.

### A9. Pregunta TODO sin herramientas

Pi: `TODO=TD0` y razona que el archivo sigue. **Stale.** Disco: gone.

Franja: `↑38k ↓3.1k R245k CH99.7% $0.020 4.1%/1.0M`

### A10. Inventario

Franja: `↑38k ↓4.2k R285k CH99.7% $0.021 4.2%/1.0M`

| marker | Pi | disco | |
|---|---|---|---|
| README | RD0 | RD1 | stale |
| CLI | CL0 | CL1 | stale |
| MODELS | MD1 | MD1 | current |
| TODO | existe TD0 | deleted | stale |
| FLIGHTS | FL0 | FL0 | current |

## Lectura

Sin FreshCtx, Pi acierta lo que escribió en esta sesión y lo que no cambió.
Falla en los tres cambios externos: flip de `cli.py`, flip del README, delete
del todo.

Los tokens de entrada se quedaron en `↑38k` desde A1. El coste de sesión
subió de `$0.018` a `$0.021`. Eso no mide bytes del request. Mide lo que
DeepSeek facturó con caché alta.

## Brazo B. Primer intento (abortado)

| | |
|---|---|
| Extensión | `extension.ts` cargada |
| Workspace | `.work/with` |
| Budget | default 24k chars |
| Franja B1 | `↑99k ↓4.1k R66k CH46.5% $0.047 4.9%/1.0M` |

Pi leyó los cinco paths. FreshCtx proyectó README + todo. Envelope:
`selected=2` `budget-omitted=3`. Los tres grandes (~39k / ~25k / ~34k bytes)
no cabían. El modelo vio markers sin cuerpo, usó `bash` `wc`/`cat`, y al
final citó `RD0 CL0 MD0 FL0 TD0`.

Markers bien. Camino sucio. Coste B1 `$0.047` vs A1 `$0.018` por los reintentos.

`bash cat` no pasa por `trackRead`. FreshCtx no sigue esas lecturas.

## Brazo B. Relanzado (`FRESHCTX_BUDGET_CHARS=200000`)

| | |
|---|---|
| Extensión | `extension.ts` cargada |
| Workspace | `.work/with` |
| Budget | 200000 chars |
| Modelo | el mismo: `deepseek-v4-pro` · thinking `high` |

### B1b. Lectura inicial

Franja: `↑32k ↓1.6k R13k CH16.9% $0.015 4.0%/1.0M`

Cinco `read`. Sin `bash cat`. Summaries de los cinco archivos. No escribió
`RD0 CL0 MD0 FL0 TD0` en el formato pedido; el contenido sí llegó.

### B2 / B3. Flip externo de cli.py

`mutate with flip-cli`. Disco: `CL1`.

Pi, sin herramientas: `CLI=CL1`. **Current.** En A3 fue `CL0`.

Franja: `↑65k ↓1.6k R19k CH16.4% $0.030 4.0%/1.0M`

La entrada subió 32k→65k. La proyección viva va en el request. A3 no inyectó
el archivo nuevo y cobró menos.

### B4. Pi edita models.py

Pi cambió `MD0→MD1` con `edit`. Respuesta: `MODELS=MD1`. Igual que A4: lo
escribió él.

Franja: `↑131k ↓1.9k R34k CH20.1% $0.059 4.0%/1.0M` (A4: `$0.021`).

### B5. Pregunta MODELS sin herramientas

`MODELS=MD1`. Current. Igual que A5: lo escribió él, no es refresco.

Franja: `↑163k ↓1.9k R42k CH20.4% $0.072 4.0%/1.0M`

### B6 / B7. Flip externo de README

`mutate with flip-readme`. Disco: `RD1`.

Pi, sin herramientas: `README=RD1` `FLIGHTS=FL0`. **Current.** En A7 fue
`README=RD0`.

Franja: `↑194k ↓2.0k R51k CH21.0% $0.086 4.0%/1.0M`

### B8 / B9. Delete externo de todo

`mutate with delete-todo`. Disco: archivo ausente.

Pi, sin herramientas: `TODO=gone`. **Current.** En A9 fue `TODO=TD0`.

Franja: `↑226k ↓2.3k R59k CH21.0% $0.101 4.1%/1.0M`

### B10. Inventario

Franja: `↑258k ↓2.4k R68k CH20.8% $0.115 4.1%/1.0M`

| marker | Pi | disco | |
|---|---|---|---|
| README | RD1 | RD1 | current |
| CLI | CL1 | CL1 | current |
| MODELS | MD1 | MD1 | current |
| TODO | gone | deleted | current |
| FLIGHTS | FL0 | FL0 | current |

## A vs B

Celdas de tesis: cambio externo, sin re-leer, ¿dice el marker de disco?

| celda | disco | A (sin) | B (con) |
|---|---|---|---|
| CLI flip | CL1 | CL0 stale | CL1 current |
| README flip | RD1 | RD0 stale | RD1 current |
| TODO delete | gone | TD0 stale | gone current |

Controles (no miden refresco):

| celda | disco | A | B |
|---|---|---|---|
| MODELS (Pi escribió) | MD1 | MD1 | MD1 |
| FLIGHTS (nadie mutó) | FL0 | FL0 | FL0 |

Inventario final:

| marker | A | B | disco |
|---|---|---|---|
| README | RD0 | RD1 | RD1 |
| CLI | CL0 | CL1 | CL1 |
| MODELS | MD1 | MD1 | MD1 |
| TODO | TD0 | gone | gone |
| FLIGHTS | FL0 | FL0 | FL0 |

Tokens y coste de sesión (franja de Pi, no JSON del request):

| | A1 → A10 | B1b → B10 |
|---|---|---|
| entrada `↑` | 38k, plana | 32k → 258k |
| salida `↓` | 1.9k → 4.2k | 1.6k → 2.4k |
| cache hit | 17% → ~99% | ~17–21% |
| coste | $0.018 → $0.021 | $0.015 → $0.115 |

A no reinyecta. B sí: cada turno mete la proyección viva. Por eso B cuesta
más y la entrada crece. No comparar esos dólares como “eficiencia del
agente”. Comparar si el marker es el de disco.

## Lectura B

Con FreshCtx y budget que cabe, Pi acertó los tres cambios externos sin
herramientas. Sin FreshCtx, falló los tres. Los controles coinciden.

Eso mide el transformador en un host real, un modelo, un repo, n=1.
No mide si el agente programa mejor.

## Limitaciones

- n=1. Un host (Pi 0.84.3), un modelo (`deepseek-v4-pro` high), un repo
  (copia de viajante).
- El budget default (24k) omite los tres `.py` grandes. Esta corrida
  forzó 200000. Sin eso, el modelo usa `bash cat` y FreshCtx no trackea.
- No se midió persistencia al reiniciar Pi.
- No hay captura del request. Los tokens son la franja de la UI.
- El protocolo de markers es fácil una vez la proyección está en el
  request. No es un bench de edición.
- `AGENTS.md` del padre a veces entra en el contexto de Pi.
- Label: `live-host`. No citar como SOTA ni como CtxBench.

## Siguiente experimento

No persist. No Hermes. No Tree-sitter. No retune de holdout.

Si se sigue: misma batería con budget 24k (medir omit + `bash cat`) o
cerrar Pi, reabrir la misma carpeta `.work/with` y preguntar CLI/README
sin leer — eso mide si el registry sobrevive el restart. Eso es otro
trial, no esta corrida.
