# MUSK — Arnés de simulación conversacional (MVP)

Arnés independiente en Node/TypeScript para simular el agente de WhatsApp del primer MVP de MUSK Technologies: reactivar leads antiguos de una formación, responder solo con contenido aprobado y derivar siempre al equipo comercial antes de cualquier cierre. El agente nunca vende por WhatsApp.

No está conectado a WhatsApp, no usa leads reales ni integra CRM. El único componente de red opcional es un proveedor LLM compatible con OpenAI, usado únicamente para reformular respuestas ya aprobadas en modo interactivo.

## Rápido camino

1. `cd musk` y `npm install`.
2. `npm run typecheck` → debe pasar sin errores.
3. `npm test` → 18 tests (obligatorios, estructurales y regresiones de disparadores), sin red ni API key.
4. `npm run sim -- --smoke` → un turno guiado, sale con código 0 sin leer stdin.
5. `npm run sim` → REPL interactivo (modo determinista sin LLM; ver configuración abajo).
6. `npm run sim:demo` → REPL con el **contenido DEMO de muestra** (`src/content.demo.ts`), para una demo funcional sin los `TODO(decisión)`.

## Qué hace y qué no hace

| Aspecto | Estado |
|---|---|
| Canal WhatsApp | No conectado: simulación local |
| Leads y CRM | Datos simulados en memoria (`LeadContact` de prueba) |
| Reglas duras 1-11 de `AGENTS.md` | Codificadas en `src/rules.ts` y verificadas por tests |
| LLM | Opcional; solo para respuestas generales con FAQ aprobada |
| Intents protegidos (precio, temario, financiación, parada, humano, desconocido) | Deterministas; nunca llaman al LLM |
| Contenido de la formación | Curado del dossier MUSK (piloto FullStack) con FAQ aprobadas; quedan `TODO(decisión)` (duración, mensaje inicial, cualificación); perfil DEMO adicional con `--demo` |

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `src/rules.ts` | Las 11 reglas duras como datos, disparadores de parada y derivación, plantillas de respuesta aprobada y guard de salida (`guardReply`) |
| `src/content.ts` | Contenido aprobado del piloto (FullStack) curado desde el dossier; sin campos de precio ni de temario; marcas `TODO(decisión)` solo en lo no cerrado |
| `src/content.demo.ts` | Perfil de contenido DEMO de muestra (no aprobado por MUSK), cargado solo con `--demo`; sin importes y con respuestas FAQ validadas por el guard |
| `src/intent.ts` | Clasificador determinista en español (price, temario, financiacion, unknown, human, stop, general) con normalización es-ES |
| `src/llm.ts` | Interfaz `LLMProvider`, `OpenAICompatibleLLM` vía `fetch` sin SDK, `MockProvider` para tests sin red |
| `src/agent.ts` | Núcleo del agente: prompt de sistema, un turno por llamada, guard de reglas, flags de acción (`handoff` / `stop` / `none`) |
| `src/simulator.ts` | CLI: REPL interactivo (`npm run sim`) y modo `--smoke` no interactivo |
| `tests/rules.test.ts` | 18 tests: obligatorios + estructurales + regresiones de disparadores |

## Cómo se mapea cada test obligatorio

| Test | Comportamiento verificado | Código implicado |
|---|---|---|
| Precio | Sin importes (ni €, ni "euros", ni cifras) e invitación a la llamada | `intent.price` → plantilla `price` → `guardReply` |
| Temario | Sin temario detallado; contenido general (habilidades, salidas) y reconducción a la llamada | `intent.temario` → plantilla `syllabus` → `guardReply` |
| Financiación | Genérica ("existen opciones") y remite a persona/llamada; sin condiciones, importes ni promesas | `intent.financiacion` → plantilla `financing` → `guardReply` |
| Respuesta desconocida | Registra la duda y propone contacto humano; no inventa respuesta | `intent.unknown` → `registeredDoubts` → plantilla `doubt` |
| Petición humano | `action=handoff` con contacto, bucket, mensaje y resumen para el comercial | `HANDOFF_TRIGGERS.humanRequested` → `HandoffContext` |
| Petición parada | `action=stop`, registro "no continuar"; turnos posteriores no generan seguimiento | `STOP_TRIGGER` → estado `stopped` → respuesta suprimida |

## Configuración del LLM (opcional)

Copia `.env.example` y define las variables si quieres reformulación LLM en el REPL:

| Variable | Descripción |
|---|---|
| `MUSK_LLM_BASE_URL` | Endpoint compatible con OpenAI (p. ej. `https://api.openai.com/v1`) |
| `MUSK_LLM_API_KEY` | Clave del proveedor |
| `MUSK_LLM_MODEL` | Modelo (por defecto `gpt-4o-mini`) |
| `MUSK_LLM_TEMPERATURE` | Temperatura (por defecto `0.2`) |

Sin estas variables, el agente funciona igual en modo determinista con las respuestas aprobadas. Todo lo protegido por reglas ignora el LLM siempre.

## TODO(decisión) pendientes

El piloto (FullStack) ya está curado en `src/content.ts` con las FAQ aprobadas trabajadas del dossier; quedan a la espera de validación de Nicolas:

- Duración del curso: "¿cuánto dura?" responde por regla 5 (registrar duda y proponer humano) hasta tener respuesta aprobada.
- Texto del mensaje inicial (`initialMessage`).
- Lista final de preguntas de cualificación (las propuestas no están cerradas).
- Redacción final de "prácticas garantizadas" si se confirma como mensaje público.
- Plantilla de rechazo amable: implementada (12-10): un "no me interesa" seco → intent `decline`, copy dedicado, registra duda, NO es parada.

Decisiones que este arnés deja configurables fuera del contenido: receptor de los avisos y cobertura, mecanismo de llamada (solicitar contacto vs acordar momento), cadencia de seguimiento y reglas de parada, etiquetas conversacionales definitivas, configuración del canal y base legal. No se presentan como acordadas.

## Contenido DEMO (muestra, no aprobado)

`src/content.demo.ts` es un perfil de **muestra** adicional (no aprobado por MUSK). Ya no es necesario para la demo: `src/content.ts` trae el contenido curado del piloto FullStack y `npm run sim` lo usa por defecto. `--demo` queda disponible como muestra alternativa.

## Contexto histórico (no son objetivos ni parámetros)

Las cifras de las reuniones del 18/09/2026 — "6 intentos", ~3 % de conversión, coste >300 €, volúmenes de 12-15 / 35 alumnos al mes — son contexto histórico sin denominador ni periodo definidos. **No son objetivos, umbrales ni parámetros del MVP, y no aparecen en ningún punto del código como constantes.** Los umbrales de éxito siguen sin acordarse.

## Verificación

- [ ] `npm install` completa sin errores.
- [ ] `npm run typecheck` pasa con cero errores.
- [ ] `npm test` pasa: 18 tests, cero fallos, sin red.
- [ ] `npm run sim -- --smoke` sale con código 0 e imprime un intercambio de un turno.
- [ ] Ningún archivo de este arnés contiene importes, umbrales de conversión ni cadencias como constantes.

## Siguiente paso

Cerrar con Nicolas las decisiones de contenido pendientes (duración, mensaje inicial, cualificación) y las de operación mediante la demo en el REPL, antes de pensar en canal real o muestra con leads reales.
