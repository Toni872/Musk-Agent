# MUSK — Arnés de simulación conversacional (MVP)

Arnés independiente en Node/TypeScript para simular el agente de WhatsApp del primer MVP de Escuela Musk: reactivar leads antiguos, presentar las cinco formaciones a nivel general y conducir la conversación a una llamada humana. No hace falta preparar ahora el catálogo detallado. El agente nunca vende por WhatsApp.

No está conectado a WhatsApp, no usa leads reales ni integra CRM. El único componente de red opcional es un proveedor LLM compatible con OpenAI, usado únicamente para reformular respuestas ya aprobadas en modo interactivo.

## Rápido camino

1. `npm install` (desde la raíz de este repositorio).
2. `npm run typecheck` → debe pasar sin errores.
3. `npm test` → 358 tests en 9 ficheros (reglas y recepción de respuestas, base de conocimiento y recuperación, fundamentación del LLM, vista de la interfaz, disparador del canal real y bucle de evaluación de retrieval), sin red ni API key.
4. `npm run eval` → informe del **bucle de evaluación**: 46 casos etiquetados de la FAQ (recall, precisión, aciertos de intent y violaciones del guard sobre el enrutado real), 33 casos de la base de conocimiento (recall y falsos positivos, medidos aparte) y 22 casos de fundamentación (0 violaciones, medidos aparte).
5. `npm run sim -- --smoke` → un turno guiado, sale con código 0 sin leer stdin.
6. `npm run sim` → REPL interactivo con el perfil único y el flujo completo (modo determinista sin LLM; ver configuración abajo).
7. `npm run ui` → sirve el simulador en el navegador en `http://localhost:4173` (mismo motor y perfil único, interfaz de chat; sin dependencias de red).

## Qué hace y qué no hace

| Aspecto | Estado |
|---|---|
| Canal WhatsApp | No conectado: simulación local |
| Leads y CRM | Datos simulados en memoria (`LeadContact` de prueba) |
| Reglas duras 1-11 de `AGENTS.md` | Codificadas en `src/rules.ts` y verificadas por tests |
| LLM | Opcional; solo para **reformular** texto ya aprobado: la respuesta de la FAQ casada, el pasaje de la base de conocimiento que respondió y la plantilla de consuelo ante un miedo (usando también el contexto aprobado del perfil). La salida pasa el guard de salida y la comprobación de fundamentación contra exactamente lo que se le mostró al modelo; si falla cualquiera, el lead recibe el texto aprobado |
| Intents protegidos (precio, temario, financiación, parada, humano) y la duda de la regla 5 | Deterministas; nunca llaman al LLM. La duda no se reformula porque el motor la reconoce por igualdad de texto para armar la derivación a humano |
| Contenido de la formación | Las cinco formaciones pueden presentarse a nivel general. El perfil único incluye mensaje inicial, presentación de MUSK, una pregunta de objetivo `goal`, cierre, FAQ y base de conocimiento; todo el copy unificado sigue pendiente de firma de MUSK |
| Cobertura de dudas del lead | Las FAQ actúan como tabla de enrutado (palabra clave → contenido aprobado), de lo específico a lo general: información general, qué se aprende, salidas, metodología, modalidad, acompañamiento, requisitos y duración. Encima de ellas, la **capa de base de conocimiento** (recuperación determinista, sin LLM) responde lo que la base de conocimiento cubre; lo que no está aprobado cae en la regla 5. La recuperación nunca usa el LLM: este solo puede reformular el pasaje que ya respondió |
| Base de conocimiento | 35 pasajes en el perfil único, con recuperación determinista (BM25 + cobertura) y umbrales con nombre. El copy sigue pendiente de firma salvo el plazo confirmado de dos años, escrito con palabras. Horas, fechas de inicio y condiciones de pago siguen escalando; la FAQ escrita a mano conserva prioridad |
| Apertura y cualificación | El agente abre con el mensaje inicial y hace una pregunta breve sobre el objetivo para conducir a la llamada. No es examen ni filtro. El flujo completo se prueba con `npm run sim` |
| Aviso al equipo | La destinataria configurada es Laura, que decide a quién asignarlo. El aviso es simulado: no envía WhatsApp ni integra CRM; muestra el contacto y la bolsa de origen |
| Recepción de respuestas | Mientras hay una pregunta pendiente, la respuesta del lead se registra bajo su id, sin acuse de relleno. Una pregunta real, tema protegido, parada o aceptación de llamada conserva prioridad según las reglas 1–9 |

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `src/rules.ts` | Las 11 reglas duras como datos, disparadores de parada y derivación, plantillas de respuesta aprobada y guard de salida (`guardReply`) |
| `src/content.ts` | Perfil único `APPROVED_CONTENT`: copy unificado pendiente de firma de MUSK; sin importes ni temario detallado, sin marcadores `TODO(decisión)`. Incluye apertura, presentación, pregunta `goal`, cierre, FAQ y base de conocimiento (`kb`). |
| `src/intent.ts` | Clasificador determinista en español (price, temario, financiacion, unknown, human, stop, general, kb) con normalización es-ES |
| `src/text.ts` | Normalización es-ES compartida (`normalizeEs`): minúsculas, sin acentos, puntuación a espacios. Vive en su propio módulo para que la capa de disparadores (`src/rules.ts`) y la capa de intents la usen sin ciclo de importación |
| `src/kb.ts` | Base de conocimiento de la escuela como datos: 35 pasajes con respuesta al lead, términos de recuperación y procedencia, incluidos en el perfil único y pendientes de firma |
| `src/retrieval.ts` | Recuperación determinista sobre la base de conocimiento: tokenización es-ES, BM25, cobertura de términos, temas prohibidos y umbrales con nombre (`MIN_BM25_SCORE`, `MIN_TERM_COVERAGE`) |
| `src/llm.ts` | Interfaz `LLMProvider`, `OpenAICompatibleLLM` vía `fetch` sin SDK, `MockProvider` para tests sin red |
| `src/entailment.ts` | Comprobación de fundamentación de la reformulación del LLM: cada palabra con contenido de la respuesta del modelo debe existir ya en la **fuente** (lo que se le mostró al modelo: la respuesta aprobada de la entrada casada más el contexto del perfil —`generalDescription` y `methodology`—; nunca el nombre de la formación, las listas de habilidades/salidas ni otras entradas). Composición en `composeGroundingSource`. Lista explícita de palabras vacías (`ENTAILMENT_STOPWORDS`), determinista y sin dependencias |
| `src/outbound.ts` | Composición del **único mensaje saliente por turno** (`composeTurnOutbound`): la respuesta y la pregunta de cualificación viajan juntas en ese orden, salvo que la respuesta ya sea una pregunta (una sola pregunta por mensaje) o que la unión no pase `guardReply`. Único punto de decisión, lo usan `ui/chat.ts` y `src/simulator.ts` para que CLI y navegador muestren el mismo texto. No toca la máquina de estados del agente: la pregunta sigue armada igual |
| `src/agent.ts` | Núcleo del agente: prompt de sistema (parte estable cacheable + fuente aprobada por llamada), un turno por llamada, guard de reglas, comprobación de fundamentación, flags de acción (`handoff` / `stop` / `none`), apertura (`opening`), cualificación (`nextQualificationQuestion`) y recepción de la respuesta del lead (`pendingAsk` / `receiveAnswer`) |
| `src/simulator.ts` | CLI: REPL interactivo (`npm run sim`) y modo `--smoke` no interactivo; perfil único |
| `src/eval.dataset.ts` | Dataset etiquetado del bucle de evaluación: 46 casos de la FAQ (pregunta del lead → respuesta aprobada esperada + intent esperado) y 33 casos de la base de conocimiento (22 que debe responder, 8 que deben escalar), con la expectativa derivada de las reglas duras, no del comportamiento actual |
| `src/eval.ts` | Bucle de evaluación de retrieval: scoring puro (hit / miss / wrong-answer / false-positive / correct-null, recall, precisión, intent y guard) + la sección independiente de la base de conocimiento (recall y falsos positivos) + la sección independiente de fundamentación (0 violaciones) + CLI `npm run eval` (`--verbose`, `--json`). Cero efectos al importarlo |
| `ui/chat.ts` | Capa pura (sin DOM) de la interfaz de chat: estado serializable, diagnóstico de turno y banners. Toda la lógica de conversación vive aquí; se puede testear sin navegador |
| `ui/main.ts` | Capa DOM fina del simulador: solo pinta `ChatState` y reenvía eventos. Inserta texto con `textContent`, nunca `innerHTML` |
| `ui/build.mjs` | Empaqueta `ui/main.ts` + `ui/chat.ts` + `src/*` en `ui/dist/app.js` con esbuild (salida minificada, sin `process.env`) |
| `ui/server.mjs` | Servidor estático sin dependencias para `ui/dist` en `http://localhost:4173` |
| `tests/rules.test.ts` | 49 tests: obligatorios + estructurales + apertura/cualificación + regresiones de disparadores + cobertura de información (routing a contenido aprobado) |
| `tests/reception.test.ts` | 129 tests del mecanismo de recepción: la respuesta tras una pregunta se captura y no es duda; precio, parada, aceptación de llamada y pregunta real (regla 5) no se capturan y dejan la pregunta pendiente; cada respuesta envía silencio (nada de acuse) salvo la última, que cierra proponiendo la llamada con la frase **ya aprobada** del precio; flujo demo completo sin dudas, `reset` y fundamentación de la reformulación del LLM (incluida la fuente: contexto del perfil sí, nombre de la formación no) |
| `tests/entailment.test.ts` | 13 tests de la comprobación de fundamentación: reformulación fiel, número inventado, palabra de otra entrada, palabras vacías, candidata vacía, la misma candidata contra una fuente que sí la respalda y la composición de la fuente (respuesta casada + contexto del perfil, sin nombre de formación ni otras entradas) |
| `tests/ui-chat.test.ts` | 14 tests del modelo de vista de la UI (`ui/chat.ts`), sin DOM: mensajes, diagnóstico por turno, banner de perfil, apertura, cambio de perfil, reinicio y la línea de fundamentación |
| `tests/eval.test.ts` | 12 tests que convierten el bucle de evaluación en puerta: invariantes absolutos (0 falsos positivos, 0 violaciones del guard, enrutado exacto de temas prohibidos C23-C31, cobertura de las 9 FAQ) + suelos medidos de recall y precisión + la puerta propia de la base de conocimiento (0 falsos positivos en el grupo que debe escalar) + la puerta de fundamentación (0 violaciones) |
| `tests/retrieval.test.ts` | 20 tests de la capa de base de conocimiento: cada respuesta pasa el guard, ninguna contiene una cifra, ninguna menciona un tema prohibido, resolución de preguntas conocidas, umbral, y el agente de extremo a extremo (responde con el pasaje, registra la procedencia y no registra duda; una pregunta fuera sigue escalando) |
| `tests/outbound.test.ts` | 8 tests del mensaje saliente único por turno (`src/outbound.ts`): respuesta y pregunta de cualificación unidas en ese orden, una sola interrogación, la pregunta NO se apila si la respuesta ya pregunta, turno sin respuesta propia, composición que rompería el guard no se envía unida, y paridad CLI ↔ UI (mismo `composeTurnOutbound`) |

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
- **Es contenido pendiente de firma** (reglas 4 y 11): vive en el perfil único
  (`src/content.ts`). La FAQ escrita a mano conserva la prioridad sobre la base de
  conocimiento.

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

El enrutado de respuestas aprobadas (`classify` → `findApprovedAnswer`) se mide con un **bucle de evaluación**: un dataset etiquetado de 46 casos de la FAQ y 31 de la base de conocimiento en `src/eval.dataset.ts` (pregunta del lead → respuesta aprobada esperada + intent esperado) que se ejecuta contra el código real y se puntúa.

- **Qué mide**: aciertos (hit), respuestas equivocadas (wrong-answer), fallos (miss), falsos positivos (un tema prohibido que alcanza una FAQ) y correct-null, con recall, precisión, aciertos de intent y violaciones del guard de salida. Además, una sección independiente de **fundamentación** (22 casos): con un proveedor que siempre responde con contenido no fundamentado, el lead debe recibir siempre el texto aprobado (0 violaciones, suelo absoluto).
- **Qué NO es**: no añade embeddings, ni base de datos vectorial, ni ninguna llamada al LLM. Es un instrumento de medición, no un recuperador: no cambia el comportamiento en tiempo de ejecución.
- **Etiquetas de oro**: derivadas de las reglas duras de `AGENTS.md`, no de lo que el código hace hoy. Cuando una etiqueta y el comportamiento actual no coinciden, la diferencia **es la medición** (los fallos se listan para llevarlos a una lista de bugs).
- **Cómo se usa**: `npm run eval` imprime el resumen y solo los casos que fallan; `npm run eval -- --verbose` imprime todos los casos; `npm run eval -- --json` vuelca el informe completo en JSON.
- **Puerta, no solo informe**: los tests de `tests/eval.test.ts` fijan los invariantes absolutos (0 falsos positivos, 0 violaciones del guard, enrutado exacto de los temas prohibidos C23-C31, cobertura de las 11 FAQ del perfil único) y suelos medidos de recall y precisión. Los suelos solo suben, nunca bajan.

## Configuración del LLM (opcional)

Copia `.env.example` a `.env`, pon la clave y arranca el REPL. `npm run sim` lee
`.env` automáticamente si existe (si no existe, no pasa nada):

```powershell
Copy-Item .env.example .env
# edita .env y rellena MUSK_LLM_API_KEY
npm run sim
```

| Variable | Descripción |
|---|---|
| `MUSK_LLM_BASE_URL` | Endpoint compatible con OpenAI, **con https** y con el segmento de versión. El cliente añade `/chat/completions` |
| `MUSK_LLM_API_KEY` | Clave del proveedor |
| `MUSK_LLM_MODEL` | Modelo (por defecto `gpt-4o-mini`) |
| `MUSK_LLM_TEMPERATURE` | Temperatura (por defecto `0.2`) |

Hacen falta **las dos** primeras: con solo una, el proveedor no se activa y el
arnés sigue determinista. Una variable exportada en la sesión gana sobre `.env`,
así que puedes sobreescribir un valor para una ejecución concreta.

**Groq** es compatible sin tocar código: `https://api.groq.com/openai/v1` con
`openai/gpt-oss-120b` (el más capaz) o `openai/gpt-oss-20b` (más barato y rápido).
No uses `llama-3.3-70b-versatile` ni `llama-3.1-8b-instant`: Groq los retiró el
16 de agosto de 2026.

Sin estas variables, el agente funciona igual en modo determinista con las respuestas aprobadas. Todo lo protegido por reglas ignora el LLM siempre. `.env` está en `.gitignore`: la clave nunca se commitea, y el proveedor solo se usa en local, nunca en la web publicada.

### El contrato del LLM: solo redactar, nunca añadir

El modelo **no responde**: **redacta**. Su trabajo es dar forma a un texto ya
aprobado, y nada más. Solo se reformulan tres cosas: la respuesta de la FAQ que
casó con la pregunta del lead, el pasaje de la base de conocimiento que respondió
y la plantilla `reassurance` (el consuelo ante un miedo). Precio, financiación,
temario, parada, humano y la duda de la regla 5 **nunca** pasan por el modelo.

1. **La fuente es una sola**: la petición lleva el texto aprobado de esa llamada,
   y nada más. El prompt ya **no incluye la FAQ entera** (antes
   sí, y por eso el modelo podía copiar el contenido de otra entrada a la
   respuesta de otra, o inventar un dato plausible que no incumplía ningún
   patrón prohibido). La parte estable del prompt (rol, tono y las once reglas
   duras) **no cambia entre llamadas**, así que es cacheable; la parte variable
   (la fuente aprobada) cambia en cada llamada. Efecto directo: para la misma
   pregunta, la petición al modelo baja de **5.596 a 2.893 caracteres**
   (−48 %; la parte estable son 2.395), y el modelo ya no puede ver la
   respuesta de otra entrada.
2. **La salida pasa dos filtros**: el guard de salida (`guardReply`: sin
   importes, promociones ni promesas) y la **comprobación de fundamentación**
   (`src/entailment.ts`), que exige que cada palabra con contenido de la
   respuesta del modelo exista ya en la fuente aprobada (los números
   incluidos: un `500` inventado no está respaldado).
3. **Si cualquiera de los dos falla, el lead recibe el texto aprobado**, nunca
   la salida del modelo. El veredicto queda visible para el operador
   (`grounding = ...` en la línea de diagnóstico del simulador y de la UI) y en
   los registros de la conversación (tipo `grounding`), también cuando la
   reformulación se rechaza.
4. **Medido, no supuesto**: `npm run eval` incluye una sección de
   fundamentación que pasa las 23 preguntas casables de la FAQ por el agente
   con un proveedor que siempre responde con contenido no fundamentado, y
   comprueba que el lead recibe siempre el texto aprobado (0 violaciones, suelo
   absoluto).

## TODO(decisión) pendientes

El piloto ya está curado en el perfil único `src/content.ts` (mensaje inicial, presentación, pregunta `goal`, FAQ y base de conocimiento). Quedan por cerrar las decisiones operativas listadas en `docs/decisiones-operativas-nicolas.md` (cobertura de Laura, cadencia y reglas de parada, canal, base legal/privacidad, tamaño de muestra/fecha de lanzamiento). La plantilla de rechazo amable está implementada.

## Contenido DEMO (muestra, no aprobado)

El perfil DEMO se eliminó (`src/content.demo.ts`). Ya solo existe un perfil único en `src/content.ts` con el copy unificado pendiente de firma de MUSK. `npm run sim` lo usa por defecto.

## Contexto histórico (no son objetivos ni parámetros)

Las cifras de las reuniones del 18/09/2026 — "6 intentos", ~3 % de conversión, coste >300 €, volúmenes de 12-15 / 35 alumnos al mes — son contexto histórico sin denominador ni periodo definidos. **No son objetivos, umbrales ni parámetros del MVP, y no aparecen en ningún punto del código como constantes.** Los umbrales de éxito siguen sin acordarse.

## Verificación

- [ ] `npm install` completa sin errores.
- [ ] `npm run typecheck` pasa con cero errores.
- [ ] `npm test` pasa: 358 tests, cero fallos, sin red.
- [ ] `npm run eval` imprime el informe del bucle de evaluación (46 casos de la FAQ + 33 de la base de conocimiento + 23 de fundamentación) sin regresar por debajo de los suelos de recall/precisión.
- [ ] `npm run sim -- --smoke` sale con código 0 e imprime un intercambio de un turno.
- [ ] Ningún archivo de este arnés contiene importes, umbrales de conversión ni cadencias como constantes.

## Comprobación automática (CI)

`.github/workflows/ci.yml` se ejecuta en cada push a `main` y en cada pull request:
`npm ci` → `npm run typecheck` → `npm test` (la puerta: 358 tests, incluidos los
suelos del bucle de evaluación) → `npm run eval` (informe para el registro) →
`npm run build:ui`. El comando `eval` siempre sale con código 0: los suelos los
exige `tests/eval.test.ts`, no el informe.

Antes del canal real con leads reales, la lista de cierre está en
`docs/checklist-canal-real.md`.

## Siguiente paso

Cerrar con Nicolas las decisiones operativas mediante la demo (`npm run sim`), antes de pensar en canal real o muestra con leads reales.
