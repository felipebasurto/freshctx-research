# FreshCtx — resumen del proyecto

## La tesis

El historial de un agente es un registro de eventos, pero el código es estado
mutable. Mezclarlos hace que una lectura antigua siga viajando en el prompt
después de modificar el archivo. Volver a leerlo añade otra copia; no sustituye
la anterior.

FreshCtx convierte las lecturas históricas en referencias estables y construye,
justo antes de cada request, una única vista acotada del código vigente. Si una
región no se puede localizar de forma inequívoca, la omite y declara la
incertidumbre. La observación original sigue siendo recuperable fuera del
prompt.

## La regla sin estado

Cada request al proveedor es independiente. Si FreshCtx selecciona una unidad,
los bytes vigentes de esa unidad tienen que viajar en ese mismo request, haya
cambiado el archivo o no. Un hash de revisión, una marca `unchanged` o un
request anterior son referencias a los bytes, no los bytes. Seleccionar una
unidad y enviar cero bytes es un fallo de corrección, y ningún ahorro de bytes
lo compensa.

FreshCtx rompió esta regla en la PCR 0077 y la reparó en la
[PCR 0079](lab/pcr/0079-stateless-byte-exact-requests.md). La reparación
aumenta a propósito el tamaño de los requests repetidos.

## Qué producto es

No es otro agente, un MCP de búsqueda, un vector DB ni una lista de reglas para
prompts. Es middleware local de contexto que Pi, Hermes, Oh My Pi u otros
harnesses pueden colocar en el camino hacia el proveedor.

Un MCP puede complementar el producto con herramientas de inspección y
recuperación, pero no puede borrar por sí solo resultados antiguos del contexto
interno del host. La integración completa necesita un hook que transforme la
copia del request.

## Cómo lo medimos

No medimos que el agente programe mejor. Eso dependería del muestreo, el modelo,
el proveedor y la política del harness.

CtxBench mide de forma determinista:

- si cada unidad enviada coincide byte a byte con el workspace actual;
- si hay código obsoleto o duplicado;
- si las observaciones enmascaradas se recuperan exactamente;
- qué ocurre ante renames, moves, deletes, duplicados y parse errors;
- bytes de proyección y del request completo;
- amplificación del cambio y estabilidad del prefijo cacheable;
- latencias de refresh, resolución, selección, render y serialización;
- memoria, throughput, disco y determinismo del hash de salida.

El proveedor de test no es un LLM: sólo captura el payload y devuelve un
sentinel fijo. El loop de autoresearch cuesta cero tokens de modelo.

## Contra qué hay que ganar

El baseline directo es CORVUS, que sincroniza archivos completos. FreshCtx sólo
será novedoso si demuestra algo adicional: unidades de región/símbolo,
recolección y expulsión automáticas, layout consciente de caché, recuperación
exacta y portabilidad entre harnesses.

También debe compararse con observation masking, CodeStruct, sistemas de
contexto por símbolos y el comportamiento nativo de Pi y Hermes. El manifiesto
de papers obliga al agente investigador a descargar y leer las fuentes antes de
experimentar.

## Estado actual

El núcleo de `src/` usa sólo la biblioteca estándar de Node.js. Ya están
implementados los scopes de archivo completo, región de líneas y símbolo. La
implementación Tree-sitter corre fuera del proceso del núcleo y cubre Python,
JavaScript, TypeScript, Go y Rust.

Pi y Hermes transforman sólo la copia del request, mantienen el emparejamiento
nativo entre assistant, tool call y tool result, y devuelven intacto el request
original si falla el adaptador. Los tests deterministas cubren esos contratos y
los invariantes de frescura, unicidad, recuperación, ambigüedad y presupuesto
sin invocar un modelo.

En este checkout, `npm run evaluate` elige por defecto
`holdout-v0.3-apex`. El pack está congelado localmente, no sellado por GitHub
Actions de producción. La medición registrada fue 8504 bytes de payload para
Isolated Semantic Engine, 36701 para el baseline de archivo completo y recall
requerido 5/5. `passAt1` siempre es `null` y queda fuera de alcance.

Siguen faltando un archivo de revisiones durable y con permisos, una barrera de
snapshot coherente, compatibilidad fijada contra releases de Pi y Hermes,
telemetría completa por etapa y memoria, revisión independiente del baseline y
atestación de congelación en CI de producción. Los 156 Public Change Records en
`docs/lab/pcr/` conservan el historial de evidencia.
