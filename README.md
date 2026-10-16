# MUSK — Arnés de simulación conversacional (MVP)

Arnés independiente en Node/TypeScript para simular el agente de WhatsApp del primer MVP de Escuela Musk: reactivar leads antiguos de una formación, responder solo con contenido aprobado y derivar siempre al equipo comercial antes de cualquier cierre. El agente nunca vende por WhatsApp.

No está conectado a WhatsApp, no usa leads reales ni integra CRM. El único componente de red opcional es un proveedor LLM compatible con OpenAI, usado únicamente para reformular respuestas ya aprobadas en modo interactivo.

## Rápido camino

1. `cd musk` y `npm install`.
2. `npm run typecheck` → debe pasar sin errores.
3. `npm test` → 69 tests (obligatorios, estructurales, apertura/cualificación, recepción de respuestas, regresiones de disparadores, cobertura de información, UI y bucle de evaluación de retrieval), sin red ni API key.
4. `npm run eval` → informe del **bucle de evaluación**: 40 casos etiquetados con recall, precisión, aciertos de intent y violaciones del guard sobre el enrutado real.
5. `npm run sim -- --smoke` → un turno guiado, sale con código 0 sin leer stdin.
6. `npm run sim` → REPL interactivo (modo determinista sin LLM; ver configuración abajo).
7. `npm run sim:demo` → REPL con el **contenido DEMO de muestra** (`src/content.demo.ts`), para una demo funcional sin los `TODO(decisión)`.
8. `npm run ui` → sirve el simulador en el navegador en `http://localhost:4173` (mismo motor, interfaz de chat; sin dependencias de red).

## Qué hace y qué no hace

| Aspecto | Estado |
|---|---|
| Canal WhatsApp | No conectado: simulación local |
| Leads y CRM | Datos simulados en memoria (`LeadContact` de prueba) |
| Reglas duras 1-11 de `AGENTS.md` | Codificadas en `src/rules.ts` y verificadas por tests |
| LLM | Opcional; solo para respuestas generales con FAQ aprobada |
| Intents protegidos (precio, temario, financiación, parada, humano, desconocido) | Deterministas; nunca llaman al LLM |
| Contenido de la formación | Curado del dossier MUSK (piloto FullStack) con FAQ aprobadas; quedan `TODO(decisión)` (presentación de MUSK, mensaje inicial, cualificación); perfil DEMO adicional con `--demo` |
| Cobertura de dudas del lead | Las FAQ actúan como tabla de enrutado (palabra clave → contenido aprobado), de lo específico a lo general: información general, qué se aprende, salidas, metodología, modalidad, acompañamiento, requisitos y duración. Lo que no está aprobado cae en la regla 5 |
| Apertura y cualificación | El agente abre con el mensaje inicial (§3.2) y hace las preguntas de cualificación de una en una, sin examen ni puntuación (§4). Si el texto es un `TODO(decisión)`, no se envía ni se pregunta: se informa como decisión abierta de MUSK. Flujo completo en el perfil DEMO (`npm run sim:demo`) |
| Recepción de respuestas | Mientras hay una pregunta pendiente, el mensaje del lead se recibe **como respuesta** (se registra y se acusa con cortesía), nunca como duda. Sigue mandando el resto de reglas: una pregunta real (regla 5), un tema protegido (precio/temario/financiación), una parada (regla 7) o una aceptación de llamada (regla 9) no se capturan, y la pregunta sigue pendiente |

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `src/rules.ts` | Las 11 reglas duras como datos, disparadores de parada y derivación, plantillas de respuesta aprobada y guard de salida (`guardReply`) |
| `src/content.ts` | Contenido aprobado del piloto (FullStack) curado desde el dossier; sin campos de precio ni de temario; marcas `TODO(decisión)` solo en lo no cerrado. La FAQ es la tabla de enrutado de la pregunta del lead a contenido aprobado (de lo específico a lo general) |
| `src/content.demo.ts` | Perfil de contenido DEMO de muestra (no aprobado por MUSK), cargado solo con `--demo`; sin importes y con respuestas FAQ validadas por el guard |
| `src/intent.ts` | Clasificador determinista en español (price, temario, financiacion, unknown, human, stop, general) con normalización es-ES |
| `src/llm.ts` | Interfaz `LLMProvider`, `OpenAICompatibleLLM` vía `fetch` sin SDK, `MockProvider` para tests sin red |
| `src/agent.ts` | Núcleo del agente: prompt de sistema, un turno por llamada, guard de reglas, flags de acción (`handoff` / `stop` / `none`), apertura (`opening`), cualificación (`nextQualificationQuestion`) y recepción de la respuesta del lead (`pendingAsk` / `receiveAnswer`) |
| `src/simulator.ts` | CLI: REPL interactivo (`npm run sim`) y modo `--smoke` no interactivo; imprime apertura y decisiones abiertas |
| `src/eval.dataset.ts` | Dataset etiquetado del bucle de evaluación: 40 casos (pregunta del lead → respuesta aprobada esperada + intent esperado), con la expectativa derivada de las reglas duras, no del comportamiento actual |
| `src/eval.ts` | Bucle de evaluación de retrieval: scoring puro (hit / miss / wrong-answer / false-positive / correct-null, recall, precisión, intent y guard) + CLI `npm run eval` (`--verbose`, `--json`). Cero efectos al importarlo |
| `ui/chat.ts` | Capa pura (sin DOM) de la interfaz de chat: estado serializable, diagnóstico de turno y banners. Toda la lógica de conversación vive aquí; se puede testear sin navegador |
| `ui/main.ts` | Capa DOM fina del simulador: solo pinta `ChatState` y reenvía eventos. Inserta texto con `textContent`, nunca `innerHTML` |
| `ui/build.mjs` | Empaqueta `ui/main.ts` + `ui/chat.ts` + `src/*` en `ui/dist/app.js` con esbuild (salida minificada, sin `process.env`) |
| `ui/server.mjs` | Servidor estático sin dependencias para `ui/dist` en `http://localhost:4173` |
| `tests/rules.test.ts` | 37 tests: obligatorios + estructurales + apertura/cualificación + regresiones de disparadores + cobertura de información (routing a contenido aprobado) |
| `tests/reception.test.ts` | 11 tests del mecanismo de recepción: la respuesta tras una pregunta se captura y no es duda; precio, parada, aceptación de llamada y pregunta real (regla 5) no se capturan y dejan la pregunta pendiente; cada respuesta envía silencio (nada de acuse) salvo la última, que cierra proponiendo la llamada con la frase **ya aprobada** del precio; flujo demo completo sin dudas y `reset` |
| `tests/ui-chat.test.ts` | 11 tests del modelo de vista de la UI (`ui/chat.ts`), sin DOM: mensajes, diagnóstico por turno, banner de perfil, apertura, cambio de perfil y reinicio |
| `tests/eval.test.ts` | 6 tests que convierten el bucle de evaluación en puerta: invariantes absolutos (0 falsos positivos, 0 violaciones del guard, enrutado exacto de temas prohibidos C23-C31, cobertura de las 9 FAQ) + suelos medidos de recall y precisión (69 tests en total) |

## Cómo se mapea cada test obligatorio

| Test | Comportamiento verificado | Código implicado |
|---|---|---|
| Precio | Sin importes (ni €, ni "euros", ni cifras) e invitación a la llamada | `intent.price` → plantilla `price` → `guardReply` |
| Temario | Sin temario detallado; contenido general (habilidades, salidas) y reconducción a la llamada | `intent.temario` → plantilla `syllabus` → `guardReply` |
| Financiación | Genérica ("existen opciones") y remite a persona/llamada; sin condiciones, importes ni promesas | `intent.financiacion` → plantilla `financing` → `guardReply` |
| Respuesta desconocida | Registra la duda y propone contacto humano; no inventa respuesta | `intent.unknown` → `registeredDoubts` → plantilla `doubt` |
| Petición humano | `action=handoff` con contacto, bucket, mensaje y resumen para el comercial | `HANDOFF_TRIGGERS.humanRequested` → `HandoffContext` |
| Petición parada | `action=stop`, registro "no continuar"; turnos posteriores no generan seguimiento | `STOP_TRIGGER` → estado `stopped` → respuesta suprimida |

## Bucle de evaluación (medición, no más lógica)

El enrutado de respuestas aprobadas (`classify` → `findApprovedAnswer`) se mide con un **bucle de evaluación**: un dataset etiquetado de 40 casos en `src/eval.dataset.ts` (pregunta del lead → respuesta aprobada esperada + intent esperado) que se ejecuta contra el código real y se puntúa.

- **Qué mide**: aciertos (hit), respuestas equivocadas (wrong-answer), fallos (miss), falsos positivos (un tema prohibido que alcanza una FAQ) y correct-null, con recall, precisión, aciertos de intent y violaciones del guard de salida.
- **Qué NO es**: no añade embeddings, ni base de datos vectorial, ni ninguna llamada al LLM. Es un instrumento de medición, no un recuperador: no cambia el comportamiento en tiempo de ejecución.
- **Etiquetas de oro**: derivadas de las reglas duras de `AGENTS.md`, no de lo que el código hace hoy. Cuando una etiqueta y el comportamiento actual no coinciden, la diferencia **es la medición** (los fallos se listan para llevarlos a una lista de bugs).
- **Cómo se usa**: `npm run eval` imprime el resumen y solo los casos que fallan; `npm run eval -- --verbose` imprime todos los casos; `npm run eval -- --json` vuelca el informe completo en JSON.
- **Puerta, no solo informe**: los tests de `tests/eval.test.ts` fijan los invariantes absolutos (0 falsos positivos, 0 violaciones del guard, enrutado exacto de los temas prohibidos C23-C31, cobertura de las 9 FAQ) y suelos medidos de recall y precisión. El punto de partida documentado fue recall 0.82 / precisión 1.00 (baseline 2026-10-15); tras cerrar las paráfrasis sin palabra clave el suelo de recall queda en 1.00. Los suelos solo suben, nunca bajan.

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

- Presentación de MUSK (`companyPresentation`): la spec §3.6 la exige como contenido mínimo y §8.1 la lista como información a aportar por Nicolás. Mientras no exista, "sobre MUSK" responde con identidad + formación + humano y el ítem aparece como decisión pendiente (nunca se inventa).
- Texto del mensaje inicial (`initialMessage`).
- Lista final de preguntas de cualificación (las propuestas no están cerradas).
- Duración del curso: no hay respuesta aprobada con datos; "¿cuánto dura?" se responde sin cifras y se deriva a la llamada.
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
- [ ] `npm test` pasa: 69 tests, cero fallos, sin red.
- [ ] `npm run eval` imprime el informe del bucle de evaluación (40 casos) sin regresar por debajo de los suelos de recall/precisión.
- [ ] `npm run sim -- --smoke` sale con código 0 e imprime un intercambio de un turno.
- [ ] Ningún archivo de este arnés contiene importes, umbrales de conversión ni cadencias como constantes.

## Siguiente paso

Cerrar con Nicolas las decisiones de contenido pendientes (duración, mensaje inicial, cualificación) y las de operación mediante la demo en el REPL, antes de pensar en canal real o muestra con leads reales.
