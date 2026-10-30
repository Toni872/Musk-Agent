# Documentación del proyecto MUSK

Índice de la documentación. El código y los comandos están en `README.md`
(raíz); las reglas duras y el alcance, en `AGENTS.md` (raíz).

## Estructura

```
docs/
  producto/    Qué se construye: especificación, catálogo, matriz y base de conocimiento
  cliente/     Material de y para el cliente (Nicolás / MUSK / comercial)
  operacion/   Decisiones operativas y checklist antes de tocar leads reales
  guiones/     Guiones de demo y de conversación
  archivo/     Material histórico superado; se conserva como referencia
```

## producto/

| Fichero | Contenido |
|---|---|
| `producto/musk-mvp-spec.md` | Especificación completa del MVP |
| `producto/musk-catalogo-cursos-propuesta.md` | Propuesta de catálogo de cursos (fase 2) |
| `producto/matriz-validacion-cursos.md` | Validación de contenido por curso; origen de `src/content.ts` |
| `producto/escuela-musk-base-conocimiento.md` | Base de conocimiento de la escuela; fuente de los 35 pasajes de `src/kb.ts` |

## cliente/

| Fichero | Contenido |
|---|---|
| `cliente/pedido-nicolas.md` | Pedido de contenido a Nicolás; qué falta aprobar |
| `cliente/aprobacion-nicolas.md` | Resumen de lo que necesita firma de Nicolás |
| `cliente/guia-comercial.md` | Guía de uso para el comercial (handoff y registro) |
| `cliente/gamma-preguntas-musk.md` | Batería de preguntas para probar el agente (demo) |
| `cliente/MUSK_Validacion_Funcional_MVP_Script9_28092026.pdf` | Validación funcional original del MVP (copia de referencia) |

## operacion/

| Fichero | Contenido |
|---|---|
| `operacion/decisiones-operativas-nicolas.md` | Decisiones de operación: llamada, aviso, cadencia |
| `operacion/checklist-canal-real.md` | Qué cerrar antes de tocar un lead real |

## guiones/

| Fichero | Contenido |
|---|---|
| `guiones/GUION_DEMO.md` | Guion de demo con las respuestas observadas |
| `guiones/guion-neuroventas.md` | Guion por momento conversacional: texto real, objetivo y mecanismo |

## archivo/

Material superado que se conserva como referencia. No es fuente de verdad.

| Fichero | Contenido |
|---|---|
| `archivo/plan-retrieval-hibrido.md` | Plan de retrieval híbrido (no implementado: hoy se usa BM25 + cobertura) |
| `archivo/instrucciones_de_optimizaci_n_de_costos.md` | Notas sobre optimización de costes de herramientas (ajenas al producto) |
| `archivo/como-documentar-flujo.pdf` | Export obsoleto; su markdown de origen ya se eliminó |

## Documentos de entrada (raíz)

| Fichero | Contenido |
|---|---|
| `README.md` | Qué hace el arnés, comandos y verificación |
| `INSTRUCCIONES.md` | Guía para que el equipo de MUSK lo pruebe en su equipo |
| `AGENTS.md` | Fuente de verdad del alcance, reglas duras y convenciones |
