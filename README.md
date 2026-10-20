# MUSK — Arnés de simulación conversacional (MVP)

Arnés independiente en Node/TypeScript para simular el agente de WhatsApp del primer MVP de Escuela Musk: reactivar leads antiguos de una formación, responder solo con contenido aprobado y derivar siempre al equipo comercial antes de cualquier cierre. El agente nunca vende por WhatsApp.

No está conectado a WhatsApp, no usa leads reales ni integra CRM. El único componente de red opcional es un proveedor LLM compatible con OpenAI, usado únicamente para reformular respuestas ya aprobadas en modo interactivo.

## Rápido camino

1. `npm install` (desde la raíz de este repositorio).
2. `npm run typecheck` → debe pasar sin errores.
3. `npm test` → 158 tests en 5 ficheros (obligatorios, estructurales, apertura/cualificación, recepción de respuestas, regresiones de disparadores, cobertura de información, capa de base de conocimiento, UI y bucle de evaluación de retrieval), sin red ni API key.
4. `npm run eval` → informe del **bucle de evaluación**: 43 casos etiquetados de la FAQ (recall, precisión, aciertos de intent y violaciones del guard sobre el enrutado real) y 30 casos de la base de conocimiento (recall y falsos positivos, medidos aparte).
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
| Cobertura de dudas del lead | Las FAQ actúan como tabla de enrutado (palabra clave → contenido aprobado), de lo específico a lo general: información general, qué se aprende, salidas, metodología, modalidad, acompañamiento, requisitos y duración. Encima de ellas, la **capa de base de conocimiento** (recuperación determinista, sin LLM) responde lo que la base de conocimiento cubre; lo que no está aprobado cae en la regla 5 |
| Base de conocimiento | 35 pasajes de la base de conocimiento de la escuela, con recuperación determinista (BM25 + cobertura) y umbrales con nombre en el código. **Solo en el perfil DEMO**: el copy está pendiente de firma de MUSK. Sin cifras, sin temas prohibidos, y la FAQ escrita a mano siempre tiene prioridad |
| Apertura y cualificación | El agente abre con el mensaje inicial (§3.2) y hace las preguntas de cualificación de una en una, sin examen ni puntuación (§4). Si el texto es un `TODO(decisión)`, no se envía ni se pregunta: se informa como decisión abierta de MUSK. Flujo completo en el perfil DEMO (`npm run sim:demo`) |
| Recepción de respuestas | Mientras hay una pregunta pendiente, el mensaje del lead se recibe **como respuesta** (se registra y se acusa con cortesía), nunca como duda. Sigue mandando el resto de reglas: una pregunta real (regla 5), un tema protegido (precio/temario/financiación), una parada (regla 7) o una aceptación de llamada (regla 9) no se capturan, y la pregunta sigue pendiente |

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `src/rules.ts` | Las 11 reglas duras como datos, disparadores de parada y derivación, plantillas de respuesta aprobada y guard de salida (`guardReply`) |
| `src/content.ts` | Contenido aprobado del piloto (FullStack) curado desde el dossier; sin campos de precio ni de temario; marcas `TODO(decisión)` solo en lo no cerrado. La FAQ es la tabla de enrutado de la pregunta del lead a contenido aprobado (de lo específico a lo general) |
| `src/content.demo.ts` | Perfil de contenido DEMO de muestra (no aprobado por MUSK), cargado solo con `--demo`; sin importes y con respuestas FAQ validadas por el guard |
| `src/intent.ts` | Clasificador determinista en español (price, temario, financiacion, unknown, human, stop, general, kb) con normalización es-ES |
| `src/kb.ts` | Base de conocimiento de la escuela como datos: 35 pasajes con respuesta al lead, términos de recuperación y procedencia (solo perfil DEMO, pendiente de firma) |
| `src/retrieval.ts` | Recuperación determinista sobre la base de conocimiento: tokenización es-ES, BM25, cobertura de términos, temas prohibidos y umbrales con nombre (`MIN_BM25_SCORE`, `MIN_TERM_COVERAGE`) |
| `src/llm.ts` | Interfaz `LLMProvider`, `OpenAICompatibleLLM` vía `fetch` sin SDK, `MockProvider` para tests sin red |
| `src/agent.ts` | Núcleo del agente: prompt de sistema, un turno por llamada, guard de reglas, flags de acción (`handoff` / `stop` / `none`), apertura (`opening`), cualificación (`nextQualificationQuestion`) y recepción de la respuesta del lead (`pendingAsk` / `receiveAnswer`) |
| `src/simulator.ts` | CLI: REPL interactivo (`npm run sim`) y modo `--smoke` no interactivo; imprime apertura y decisiones abiertas |
| `src/eval.dataset.ts` | Dataset etiquetado del bucle de evaluación: 43 casos de la FAQ (pregunta del lead → respuesta aprobada esperada + intent esperado) y 30 casos de la base de conocimiento (22 que debe responder, 8 que deben escalar), con la expectativa derivada de las reglas duras, no del comportamiento actual |
| `src/eval.ts` | Bucle de evaluación de retrieval: scoring puro (hit / miss / wrong-answer / false-positive / correct-null, recall, precisión, intent y guard) + la sección independiente de la base de conocimiento (recall y falsos positivos) + CLI `npm run eval` (`--verbose`, `--json`). Cero efectos al importarlo |
| `ui/chat.ts` | Capa pura (sin DOM) de la interfaz de chat: estado serializable, diagnóstico de turno y banners. Toda la lógica de conversación vive aquí; se puede testear sin navegador |
| `ui/main.ts` | Capa DOM fina del simulador: solo pinta `ChatState` y reenvía eventos. Inserta texto con `textContent`, nunca `innerHTML` |
| `ui/build.mjs` | Empaqueta `ui/main.ts` + `ui/chat.ts` + `src/*` en `ui/dist/app.js` con esbuild (salida minificada, sin `process.env`) |
| `ui/server.mjs` | Servidor estático sin dependencias para `ui/dist` en `http://localhost:4173` |
| `tests/rules.test.ts` | 49 tests: obligatorios + estructurales + apertura/cualificación + regresiones de disparadores + cobertura de información (routing a contenido aprobado) |
| `tests/reception.test.ts` | 58 tests del mecanismo de recepción: la respuesta tras una pregunta se captura y no es duda; precio, parada, aceptación de llamada y pregunta real (regla 5) no se capturan y dejan la pregunta pendiente; cada respuesta envía silencio (nada de acuse) salvo la última, que cierra proponiendo la llamada con la frase **ya aprobada** del precio; flujo demo completo sin dudas y `reset` |
| `tests/ui-chat.test.ts` | 11 tests del modelo de vista de la UI (`ui/chat.ts`), sin DOM: mensajes, diagnóstico por turno, banner de perfil, apertura, cambio de perfil y reinicio |
| `tests/eval.test.ts` | 10 tests que convierten el bucle de evaluación en puerta: invariantes absolutos (0 falsos positivos, 0 violaciones del guard, enrutado exacto de temas prohibidos C23-C31, cobertura de las 9 FAQ) + suelos medidos de recall y precisión + la puerta propia de la base de conocimiento (0 falsos positivos en el grupo que debe escalar) |
| `tests/retrieval.test.ts` | 15 tests de la capa de base de conocimiento: cada respuesta pasa el guard, ninguna contiene una cifra, ninguna menciona un tema prohibido, resolución de preguntas conocidas, umbral, y el agente de extremo a extremo (responde con el pasaje, registra la procedencia y no registra duda; una pregunta fuera sigue escalando) |

## Cómo se mapea cada test obligatorio

| Test | Comportamiento verificado | Código implicado |
|---|---|---|
| Precio | Sin importes (ni €, ni "euros", ni cifras) e invitación a la llamada | `intent.price` → plantilla `price` → `guardReply` |
| Temario | Sin temario detallado; contenido general (habilidades, salidas) y reconducción a la llamada | `intent.temario` → plantilla `syllabus` → `guardReply` |
| Financiación | Genérica ("existen opciones") y remite a persona/llamada; sin condiciones, importes ni promesas | `intent.financiacion` → plantilla `financing` → `guardReply` |
| Respuesta desconocida | Registra la duda y propone contacto humano; no inventa respuesta | `intent.unknown` → `registeredDoubts` → plantilla `doubt` |
| Petición humano | `action=handoff` con contacto, bucket, mensaje y resumen para el comercial | `HANDOFF_TRIGGERS.humanRequested` → `HandoffContext` |
| Petición parada | `action=stop`, registro "no continuar"; turnos posteriores no generan seguimiento | `STOP_TRIGGER` → estado `stopped` → respuesta suprimida |

## Capa de base de conocimiento (Fase 0, pendiente de firma de MUSK)

`src/kb.ts` + `src/retrieval.ts` añaden una **capa de recuperación determinista**
sobre la base de conocimiento de la escuela (`escuela-musk-base-conocimiento.md`).
Sin ella, cada pregunta nueva del lead exigía una entrada de FAQ con palabras
clave nuevas: ese era el cuello de botella. Con ella, el agente responde lo que
la base de conocimiento cubre **sin LLM, sin embeddings y sin dependencias**.

| Pieza | Qué hace |
|---|---|
| `src/kb.ts` | Los pasajes como datos: `id`, `title`, `answer` (la respuesta al lead), `terms` (vocabulario de recuperación, no va al lead) y `source` (procedencia) |
| `src/retrieval.ts` | Tokenización es-ES, BM25 (`BM25_K1`, `BM25_B`), cobertura de términos y los umbrales con nombre `MIN_BM25_SCORE` y `MIN_TERM_COVERAGE` |

Cómo funciona, en orden:

1. **Temas prohibidos** (`FORBIDDEN_TOPIC_PATTERNS`): precio, financiación, fechas
   de inicio y calendario, devoluciones, becas, ubicación física, requisitos de
   acceso, condiciones del convenio de prácticas y temario detallado. Una
   pregunta de esos temas **nunca** se responde: escala a la regla 5.
2. **Puntuación**: BM25 sobre los pasajes + cobertura (qué fracción de los
   términos de la pregunta aparece en el pasaje). Un pasaje solo es respuesta
   si supera **los dos** umbrales.
3. **Si nada llega**: comportamiento de siempre, la regla 5 (duda registrada y
   contacto humano). El operador ve, además, qué pasaje se acercó más y con
   qué puntuación: `kb closest = kb-catalogo (score 1.90, coverage 0.33)`.

Reglas de la capa:

- **El umbral vive en el código**, como constante con nombre, nunca en un
  prompt: es auditable y se puede recalibrar.
- **Ninguna respuesta de la base de conocimiento contiene una sola cifra** (ni
  precios, ni salarios, ni porcentajes, ni horas, ni duraciones). Lo fija un
  test, y todas las respuestas pasan además `guardReply`.
- **La base de conocimiento es una fuente, no un envío** (regla 10): cada
  pasaje tiene su propia respuesta breve; el documento entero nunca se manda.
- **La FAQ escrita a mano conserva la prioridad**: la base de conocimiento solo
  entra cuando la FAQ no responde.
- **Es contenido pendiente de firma** (reglas 4 y 11): vive **solo** en el
  perfil DEMO (`src/content.demo.ts`). El perfil aprobado (`src/content.ts`) no
  la lleva y, sin ella, se comporta exactamente como antes.

### Cómo añadir un pasaje

1. Añade una entrada a `KB_PASSAGES` (`src/kb.ts`) con `id` estable, `title`
   para el operador, `answer` (es-ES, tuteo, **sin cifras ni temas
   prohibidos**), `terms` (las frases que usaría un lead) y `source` (la
   sección del documento de origen).
2. Añade un caso etiquetado al grupo F de `EVAL_KB_CASES`
   (`src/eval.dataset.ts`).
3. `npm test` (el bucle de evaluación y los tests de la capa) y `npm run eval`.

### Cómo recalibrar los umbrales

1. Cambia los casos etiquetados y ejecuta `npm run eval -- --verbose`: imprime
   la puntuación y la cobertura de cada caso etiquetado (grupos F y G).
2. Mueve `MIN_BM25_SCORE` / `MIN_TERM_COVERAGE` **solo** si el grupo F sigue
   superándolos con margen y los falsos positivos del grupo G siguen a cero.
   Una paráfrasis que deja de superar el umbral es un **fallo que se reporta**,
   nunca un motivo para bajar la barra.
3. `npm test` fija el suelo: 0 falsos positivos en el grupo que debe escalar.

## Bucle de evaluación (medición, no más lógica)

El enrutado de respuestas aprobadas (`classify` → `findApprovedAnswer`) se mide con un **bucle de evaluación**: un dataset etiquetado de 43 casos de la FAQ y 30 de la base de conocimiento en `src/eval.dataset.ts` (pregunta del lead → respuesta aprobada esperada + intent esperado) que se ejecuta contra el código real y se puntúa.

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
- [ ] `npm test` pasa: 158 tests, cero fallos, sin red.
- [ ] `npm run eval` imprime el informe del bucle de evaluación (43 casos de la FAQ + 30 de la base de conocimiento) sin regresar por debajo de los suelos de recall/precisión.
- [ ] `npm run sim -- --smoke` sale con código 0 e imprime un intercambio de un turno.
- [ ] Ningún archivo de este arnés contiene importes, umbrales de conversión ni cadencias como constantes.

## Comprobación automática (CI)

`.github/workflows/ci.yml` se ejecuta en cada push a `main` y en cada pull request:
`npm ci` → `npm run typecheck` → `npm test` (la puerta: 158 tests, incluidos los
suelos del bucle de evaluación) → `npm run eval` (informe para el registro) →
`npm run build:ui`. El comando `eval` siempre sale con código 0: los suelos los
exige `tests/eval.test.ts`, no el informe.

Antes del canal real con leads reales, la lista de cierre está en
`docs/checklist-canal-real.md`.

## Siguiente paso

Cerrar con Nicolas las decisiones de contenido pendientes (duración, mensaje inicial, cualificación) y las de operación mediante la demo en el REPL, antes de pensar en canal real o muestra con leads reales.
