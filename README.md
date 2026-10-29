# MUSK — Asistente conversacional de WhatsApp (MVP)

Arnés independiente en Node/TypeScript para simular el agente de WhatsApp del primer MVP de Escuela Musk: reactivar leads antiguos, presentar las cinco formaciones a nivel general y conducir la conversación a una llamada humana. El cierre de la venta es siempre humano; el agente nunca vende por WhatsApp.

No está conectado a WhatsApp, no usa leads reales ni integra CRM. El motor conversacional lo dirige un LLM opcional (con RAG sobre la base de conocimiento aprobada); sin LLM, el agente cae a un modo determinista que solo responde con pasajes aprobados que superan los umbrales.

## Qué hace y qué no hace

| Aspecto | Estado |
|---|---|
| Canal WhatsApp | No conectado: simulación local |
| Leads y CRM | Datos simulados en memoria (`LeadContact` de prueba) |
| Motor conversacional | Dirigido por LLM (RAG sobre la base de conocimiento) con suelo de seguridad determinista |
| Reglas duras 1-11 de `AGENTS.md` | Codificadas en `src/rules.ts` y verificadas por tests |
| Sin LLM | Modo determinista: solo pasajes aprobados que superan umbrales; el resto escala a la regla 5 |
| Contenido de la formación | Cinco formaciones presentadas a nivel general. Perfil único en `src/content.ts`, **copy pendiente de firma de MUSK** |
| Derivación a humano | Disparadores deterministas: el lead pide hablar con una persona, da su teléfono o acepta una llamada ya propuesta |
| Registro | Registros de conversación, dudas y resultado + vista de supervisión básica en la UI |
| Aviso al equipo | Simulado: destinataria configurada (Laura), sin envío real, con contacto y bolsa de origen |

## Rápido camino

1. `npm install` (desde la raíz de este repositorio).
2. `npm run typecheck` → debe pasar sin errores.
3. `npm test` → 129 tests en 6 ficheros, sin red ni API key.
4. `npm run eval` → informe del bucle de evaluación de la base de conocimiento (recall, falsos positivos y ablación léxica).
5. `npm run sim -- --smoke` → un turno guiado, sale con código 0 sin leer stdin.
6. `npm run sim` → REPL interactivo (usa el LLM si `.env` está configurado; si no, modo determinista).
7. `npm run ui` → interfaz de chat en `http://localhost:4173`; en local usa el modelo real vía proxy (`/api/rephrase`).

## Cómo funciona el motor

Un turno = una llamada a `converse()` (`src/agent.ts`):

1. **Recuperación** (`retrieveTopK`): los pasajes más cercanos por BM25 se pasan al modelo como contexto, junto con la presentación de la escuela (`kb-escuela`) para que una pregunta corta («¿qué formación?») no se responda con un pasaje suelto.
2. **Prompt**: rol + tono + reglas duras + catálogo + descripción/metodología + respuestas de la FAQ. El modelo debe responder **primero** a lo preguntado, en texto plano y breve, y terminar con una sola pregunta.
3. **Guard de salida** (`guardReply`): si la respuesta contiene importes, promesas de empleo, promociones o temario no aprobado, se descarta y se escala a la regla 5. El guard distingue una negación honesta («no garantizamos empleo») de una promesa.
4. **Derivación determinista**: parada, petición de humano, teléfono y aceptación de llamada no pasan por el modelo.
5. **Sin modelo** (o fallo del proveedor): modo determinista que solo responde con un pasaje que **supera los umbrales** de `retrieve()`; lo demás escala o usa un puente seguro, nunca un pasaje débil recitado.

## Reglas duras (suelo de seguridad, `src/rules.ts`)

1. Nunca precios ni importes: respuesta aprobada + invitación a la llamada.
2. Nunca temario detallado; sí contenido general, habilidades y salidas.
3. Financiación y tiempo: existen opciones y dos años flexibles; nunca importes, intereses ni cuotas.
4. Solo información aprobada por MUSK.
5. Sin respuesta aprobada: registrar la duda y proponer contacto humano.
6. Sin ofertas no aprobadas para no compradores.
7. Respetar el rechazo (parada).
8. Sin presión artificial.
9. Derivación a humano cuando el lead lo pide o acepta una llamada.
10. Una guía fuente no autoriza enviarla íntegra.
11. Sin aprendizaje autónomo: el contenido nuevo se revisa antes de incorporarse.

El guard de salida y los disparadores están como datos y cubiertos por tests.

## Base de conocimiento y recuperación (`src/kb.ts` + `src/retrieval.ts`)

- 35 pasajes como datos (`id`, `title`, `answer`, `terms`, `source`). El `answer` va al lead; `terms` es vocabulario de recuperación y no se envía.
- Recuperación determinista (BM25 + cobertura), sin LLM, sin embeddings, sin dependencias.
- **Temas prohibidos** (`FORBIDDEN_TOPIC_PATTERNS`): precio, compensación, financiación, duración/horarios, fechas de inicio, devoluciones, ubicación, temario detallado, requisitos y condiciones de prácticas → siempre escalan (regla 5).
- **Umbrales con nombre** en código: `MIN_BM25_SCORE` (3.5) y `MIN_TERM_COVERAGE` (0.5). Un pasaje responde solo si supera ambos.
- Ninguna respuesta de la base de conocimiento contiene una cifra (lo fija un test) y todas pasan `guardReply`.
- `retrieve()` = puerta con umbrales (usa el modo determinista); `retrieveTopK()` = ranking para el contexto del LLM.

## Evaluación (`src/eval.ts` + `src/eval.dataset.ts`)

Instrumento de medición, no lógica de producción: mide recall, falsos positivos, pasaje equivocado e interceptación de temas protegidos sobre la base de conocimiento, más una ablación léxica (held-out). `npm run eval` imprime el resumen; `--verbose` y `--json` dan detalle. Los suelos están fijados en `tests/eval.test.ts`.

## Configuración del LLM (opcional)

Copia `.env.example` a `.env` y rellena:

| Variable | Descripción |
|---|---|
| `MUSK_LLM_BASE_URL` | Endpoint compatible con OpenAI, con https y segmento de versión (se añade `/chat/completions`) |
| `MUSK_LLM_API_KEY` | Clave del proveedor |
| `MUSK_LLM_MODEL` | Modelo (por defecto `gpt-4o-mini`) |
| `MUSK_LLM_TEMPERATURE` | Temperatura (por defecto `0.2`) |
| `MUSK_DEMO_TOKEN` | Token de la demo: protege el proxy `/api/rephrase` en producción |

Hacen falta `MUSK_LLM_BASE_URL` y `MUSK_LLM_API_KEY` para activar el modelo; sin ellas, modo determinista. **Groq** funciona sin tocar código: `https://api.groq.com/openai/v1` con `openai/gpt-oss-120b` (más capaz) o `openai/gpt-oss-20b` (más barato).

`.env` está en `.gitignore` (la clave nunca se commitea).

## UI local y proxy

- `npm run ui` → construye `ui/dist` y levanta `ui/dev-server.ts` en `http://localhost:4173`.
- El navegador no puede llamar a Groq directamente (CORS + la clave quedaría en el cliente), así que habla con `POST /api/rephrase`.
- En local, `ui/dev-server.ts` responde `/api/rephrase` con el **mismo** handler puro de producción (`src/rephrase-endpoint.ts`) y omite el token (enlazado a `127.0.0.1`).
- En producción, la función `api/rephrase.js` valida `x-demo-token` contra `MUSK_DEMO_TOKEN`.

## Despliegue (Vercel)

Manual: `npm run deploy` (= `npm run pilot-gate` + `vercel deploy --prod`). El repositorio no despliega solo. `vercel.json` recompila el API y la UI desde el código fuente; `api/rephrase.js` es un bundle commiteado que debe regenerarse con `npm run build:api` cuando cambia `src/rephrase-endpoint.ts`.

## Verificación

- [ ] `npm run typecheck` pasa con cero errores.
- [ ] `npm test` pasa: 129 tests, cero fallos, sin red.
- [ ] `npm run eval` imprime el informe sin regresar por debajo de los suelos.
- [ ] `npm run sim -- --smoke` sale con código 0.
- [ ] Ningún archivo contiene importes, umbrales de conversión ni cadencias como constantes.

## Comprobación automática (CI)

`.github/workflows/ci.yml` en cada push a `main` y cada PR: `npm ci` → `npm run typecheck` → `npm test` → `npm run eval` → `npm run build:ui` y `npm run build:api`. El comando `eval` sale siempre con código 0; los suelos los exige `tests/eval.test.ts`.

## Decisiones pendientes

`docs/decisiones-operativas-nicolas.md` (cobertura de Laura, cadencia y reglas de parada, canal, base legal/privacidad, tamaño de muestra y fecha de lanzamiento). El copy del perfil único sigue **pendiente de firma de MUSK**. La lista de cierre antes del canal real está en `docs/checklist-canal-real.md`.

## Contexto histórico (no son objetivos ni parámetros)

Las cifras de las reuniones del 18/09/2026 — «6 intentos», ~3 % de conversión, coste >300 €, volúmenes de 12-15 / 35 al mes — son contexto sin denominador ni periodo. **No son objetivos, umbrales ni parámetros del MVP**, y no aparecen como constantes en el código.
