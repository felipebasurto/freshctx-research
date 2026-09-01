# Guion. SWE-bench-like host trial

Two arms. FreshCtx on or off. Host is **Pi** or **Hermes**.
Modelo fijado: **`deepseek-v4-flash`** (solo flash, nunca pro).

This is **not a full SWE-bench dump**. One synthetic card:
`synthetic-mini-ledger-001`. Do not invent SWE scores.

Ventana **HOST** para PROMPT. Ventana **CMD** para `run.mjs`.
Never paste an API key. Nunca pegues un PROMPT en CMD.

Working copies en `docs/lab/swe-host-trial/.work/` (local only).
Fixture: `docs/lab/swe-host-trial/fixture/mini-ledger/`.

FreshCtx paths from the FreshCtx repo root:
`adapters/pi/extension.ts` or `adapters/hermes`, not from `docs/`.

Isolated Semantic Engine (Tree-sitter) is a FreshCtx-internal default
when installed. This battery does not add a Tree-sitter host toggle.

---

## Dry check (no model)

```bash
node docs/lab/swe-host-trial/run.mjs validate
node docs/lab/swe-host-trial/run.mjs print-columns
```

---

## Pi — FreshCtx off (`nothing`)

### CMD

```bash
node docs/lab/swe-host-trial/run.mjs how-to --host=pi --arm=nothing
cd docs/lab/swe-host-trial/.work/pi-nothing
pi --provider deepseek --model deepseek-v4-flash
```

### HOST — t1-read

```text
Lee el símbolo settleDaily en src/settle.mjs con scope=symbol y selector settleDaily.

No edites. No crees archivos. Responde solo:

SETTLE=...
```

---

## Pi — FreshCtx on (`freshctx`)

### CMD

```bash
node docs/lab/swe-host-trial/run.mjs how-to --host=pi --arm=freshctx
# Use adapters/pi/extension.ts from the FreshCtx repo root.
cd docs/lab/swe-host-trial/.work/pi-freshctx
pi --provider deepseek --model deepseek-v4-flash
```

Same HOST prompt as above.

---

## Hermes — FreshCtx off (`nothing`)

### CMD

```bash
node docs/lab/swe-host-trial/run.mjs how-to --host=hermes --arm=nothing
cd docs/lab/swe-host-trial/.work/hermes-nothing
hermes chat --provider openai --model deepseek-v4-flash
```

Same HOST prompt.

---

## Hermes — FreshCtx on (`freshctx`)

### CMD

```bash
node docs/lab/swe-host-trial/run.mjs how-to --host=hermes --arm=freshctx
node adapters/hermes/install.mjs docs/lab/swe-host-trial/.work/hermes-freshctx/hermes-home/plugins
cd docs/lab/swe-host-trial/.work/hermes-freshctx
hermes chat --provider openai --model deepseek-v4-flash
```

Configura `context.engine: freshctx` in the isolated `HERMES_HOME`.
Same HOST prompt.

---

## After a live capture

```bash
node docs/lab/swe-host-trial/print-columns.mjs
```

Columns: `host`, `arm`, `task`, `turn`, `request_bytes`,
`prompt_tokens`, `resolution`, `fail_to_pass`.

Until a capture exists, print `not measured`.
Do not invent `AUTORESEARCH_SCORE`. Do not invent Pass@1.

Official table stays **549/0/0/549**.
