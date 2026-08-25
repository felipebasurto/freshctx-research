# Guion. Solo copiar y pegar

Dos ventanas. No mezcles comandos.

- **Ventana PI:** ahí vive `pi`. Ahí pegas los recuadros que dicen PROMPT.
- **Ventana CMD:** ahí corres `node ... live.mjs`. Nunca pegas un PROMPT ahí.

Si Pi ya está abierto, ciérralo (`ctrl+c` hasta que desaparezca).

El repo `/Users/felipe/Proyectos/viajante` no se toca. Trabajamos en copias.

Modelo: `deepseek-v4-pro` en los dos brazos.

Después de cada PROMPT anota en un papel: minutos:segundos, tokens in, tokens out (si Pi los muestra).

---

# BRAZO A. Sin FreshCtx

## A0. Ventana CMD. Pega esto entero

```bash
export PATH="/Users/felipe/.hermes/node/bin:$PATH"
node /Users/felipe/Proyectos/freshctx/docs/lab/pi-trial/live.mjs reset without --source /Users/felipe/Proyectos/viajante
cd /Users/felipe/Proyectos/freshctx/docs/lab/pi-trial/.work/without
pi
```

Espera a que salga el prompt de Pi. Elige `deepseek-v4-pro` si pregunta.

## A1. Ventana PI. Pega este PROMPT

```text
Lee estos archivos enteros, sin offset:
- README.md
- src/viajante/cli.py
- src/viajante/models.py
- src/viajante/flights.py
- notes/freshctx-todo.md

No edites. No crees archivos. Responde solo:

README=...
CLI=...
MODELS=...
FLIGHTS=...
TODO=...
```

Espera a que termine. Anota tiempo y tokens.

Debe decir: `README=RD0` `CLI=CL0` `MODELS=MD0` `FLIGHTS=FL0` `TODO=TD0`.

Si no, para y dímelo.

## A2. Ventana CMD. Pega esto

No cierres Pi. Vuelve a la ventana CMD (otra pestaña). El `cd` de Pi no aplica aquí.

```bash
export PATH="/Users/felipe/.hermes/node/bin:$PATH"
node /Users/felipe/Proyectos/freshctx/docs/lab/pi-trial/live.mjs mutate without flip-cli
```

Tiene que imprimir `"value": "CL1"` en MARKER_CLI.

## A3. Ventana PI. Pega este PROMPT

```text
No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_CLI?
Responde una línea: CLI=...
```

Anota lo que diga. Lo normal aquí es `CLI=CL0`.

Anota tiempo y tokens.

## A4. Ventana PI. Pega este PROMPT

```text
En src/viajante/models.py cambia MARKER_MODELS de MD0 a MD1. Solo eso.
Luego responde: MODELS=...
```

Espera. Debe responder `MODELS=MD1`.

## A5. Ventana PI. Pega este PROMPT

```text
No uses herramientas. No leas.
¿Cuál es MARKER_MODELS?
Responde: MODELS=...
```

Anota la respuesta, tiempo y tokens.

## A6. Ventana CMD. Pega esto

```bash
node /Users/felipe/Proyectos/freshctx/docs/lab/pi-trial/live.mjs mutate without flip-readme
```

Tiene que imprimir MARKER_README `"value": "RD1"`.

## A7. Ventana PI. Pega este PROMPT

```text
No uses herramientas. No leas. No edites.
README=...
FLIGHTS=...
```

Anota las dos líneas, tiempo y tokens.

## A8. Ventana CMD. Pega esto

```bash
node /Users/felipe/Proyectos/freshctx/docs/lab/pi-trial/live.mjs mutate without delete-todo
```

## A9. Ventana PI. Pega este PROMPT

```text
No uses herramientas. No leas. No edites.
¿Existe notes/freshctx-todo.md?
Si no existe, responde exactamente: TODO=gone
Si crees que existe, cita MARKER_TODO.
```

Anota la respuesta, tiempo y tokens.

## A10. Ventana PI. Pega este PROMPT

```text
No uses herramientas. No edites.
README=
CLI=
MODELS=
TODO=
FLIGHTS=
```

Anota el bloque entero. **Cierra Pi** (`ctrl+c`).

Brazo A terminado.

---

# BRAZO B. Con FreshCtx

Misma historia. Otro proceso. Otra carpeta.

## B0. Ventana CMD. Pega esto entero

```bash
export PATH="/Users/felipe/.hermes/node/bin:$PATH"
node /Users/felipe/Proyectos/freshctx/docs/lab/pi-trial/live.mjs reset with --source /Users/felipe/Proyectos/viajante
cd /Users/felipe/Proyectos/freshctx/docs/lab/pi-trial/.work/with
pi -e /Users/felipe/Proyectos/freshctx/adapters/pi/extension.ts
```

Mismo modelo: `deepseek-v4-pro`.

## B1. Ventana PI. El mismo PROMPT que A1

```text
Lee estos archivos enteros, sin offset:
- README.md
- src/viajante/cli.py
- src/viajante/models.py
- src/viajante/flights.py
- notes/freshctx-todo.md

No edites. No crees archivos. Responde solo:

README=...
CLI=...
MODELS=...
FLIGHTS=...
TODO=...
```

Debe decir otra vez `RD0 CL0 MD0 FL0 TD0`.

## B2. Ventana CMD

```bash
export PATH="/Users/felipe/.hermes/node/bin:$PATH"
node /Users/felipe/Proyectos/freshctx/docs/lab/pi-trial/live.mjs mutate with flip-cli
```

Fíjate: ahora dice `with`, no `without`.

## B3. Ventana PI. El mismo PROMPT que A3

```text
No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_CLI?
Responde una línea: CLI=...
```

Lo esperado aquí es `CLI=CL1`.

## B4. Ventana PI. El mismo PROMPT que A4

```text
En src/viajante/models.py cambia MARKER_MODELS de MD0 a MD1. Solo eso.
Luego responde: MODELS=...
```

## B5. Ventana PI. El mismo PROMPT que A5

```text
No uses herramientas. No leas.
¿Cuál es MARKER_MODELS?
Responde: MODELS=...
```

## B6. Ventana CMD

```bash
node /Users/felipe/Proyectos/freshctx/docs/lab/pi-trial/live.mjs mutate with flip-readme
```

## B7. Ventana PI. El mismo PROMPT que A7

```text
No uses herramientas. No leas. No edites.
README=...
FLIGHTS=...
```

Lo esperado: `README=RD1` y `FLIGHTS=FL0`.

## B8. Ventana CMD

```bash
node /Users/felipe/Proyectos/freshctx/docs/lab/pi-trial/live.mjs mutate with delete-todo
```

## B9. Ventana PI. El mismo PROMPT que A9

```text
No uses herramientas. No leas. No edites.
¿Existe notes/freshctx-todo.md?
Si no existe, responde exactamente: TODO=gone
Si crees que existe, cita MARKER_TODO.
```

Lo esperado: `TODO=gone`.

## B10. Ventana PI. El mismo PROMPT que A10

```text
No uses herramientas. No edites.
README=
CLI=
MODELS=
TODO=
FLIGHTS=
```

Cierra Pi. Pégame las respuestas de A y de B (las líneas AUTH/CLI/README/TODO) y los tokens si los viste.

---

# Si te pierdes

Estás en el brazo A hasta que cierres Pi después de A10.
`mutate without` solo en el brazo A.
`mutate with` solo en el brazo B.
Nunca un `mutate` antes del primer PROMPT de ese brazo.
