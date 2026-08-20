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

El starter incluye tesis, `SOUL.md`, núcleo funcional sin dependencias, tests,
benchmark sintético repetido, manifiestos de papers y repos públicos, contrato
completo de CtxBench y scaffolds para Pi y Hermes.

Todavía no incluye el generador multi-lenguaje, un corpus público congelado ni
una reproducción revisada de CORVUS. Por tanto, el claim correcto hoy es
“prototipo de invariantes”, no “estado del arte”.
