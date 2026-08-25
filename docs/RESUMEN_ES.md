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

El repositorio incluye la tesis, `SOUL.md`, un núcleo sin dependencias con
identidad estable y relocalización por anclas, tests de invariantes, benchmark
sintético repetido, manifiestos de papers y repos públicos con locks, y el
contrato completo de CtxBench.

Pi y Hermes Agent ya no son scaffolds. Hay una extensión de Pi y un plugin
`ContextEngine` de Hermes que sincronizan archivos completos y regiones de
líneas, rastrean lecturas de shell tipo `cat`, reescriben sólo la copia del
request y devuelven el request original del host si algo falla. Sus bytes de
proyección coinciden exactamente con el baseline `freshctx-region` del núcleo, y
los tests lo comprueban por igualdad.

Falta el generador multi-lenguaje, el muestreador determinista de la §5.1,
tiempos por etapa y memoria en los adaptadores, tests fijados a una versión
publicada de Pi o Hermes, y una reproducción revisada de CORVUS. La holdout v0.1
es un pack de regresión sin sellar, no un resultado.

El autoresearch está en pausa hasta cerrar la prioridad P1 de
[docs/ROADMAP.md](ROADMAP.md). Por tanto, el claim correcto hoy sigue siendo
“prototipo de invariantes”, no “estado del arte”.
