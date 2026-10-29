# Informe técnico — Agente de Musk (`musk/`)

> **NOTA (octubre 2026):** este informe describe el **motor determinista
> anterior** (clasificador de intents `src/intent.ts`, fundamentación
> `src/entailment.ts`, mensaje único `src/outbound.ts` y cualificación). Ese
> motor se sustituyó por un **motor LLM-driven con RAG** (`src/agent.ts` +
> `src/retrieval.ts` + `src/rules.ts`). Para el estado actual, consulta
> `README.md` y `AGENTS.md`. Este documento se conserva como registro histórico.

Estado: **descriptivo del código actual** (no propone cambios). Verificado leyendo
los 20 archivos del agente uno por uno.

Fecha: 18 de octubre de 2026. Cifras y recuento de líneas actualizados el 21 de octubre de 2026, tras el rediseño de la interfaz y el cierre del MVP.

Actualización (27 de octubre de 2026): perfil único en `src/content.ts`; las
referencias al perfil DEMO de más abajo describen el copy que ahora vive ahí,
pendiente de firma.

Alcance: únicamente el agente conversacional de `musk/`. Queda fuera cualquier
otro producto del repositorio.

Relacionado: `AGENTS.md` (alcance y reglas duras), `docs/musk-mvp-spec.md`,
`docs/pedido-nicolas.md`.

---

## 1. Resumen y cifras

Agente conversacional en español, pensado para reactivar leads por WhatsApp, con
dos ideas de diseño que lo gobiernan todo:

1. **Primero las reglas, después la IA.** Todos los temas protegidos (precio,
   temario, financiación, dudas) se responden con textos fijos y deterministas.
2. **La IA es opcional y siempre vigilada.** Si no hay proveedor configurado, el
   agente funciona sin ningún modelo. Si lo hay, su salida pasa por el guardián.

| Cifra | Valor |
|---|---|
| Archivos TypeScript del agente | 13 |
| Tests automáticos | 335 |
| Casos en el banco de evaluación | 79 (46 de la FAQ + 33 de la base de conocimiento) |
| Reglas duras codificadas | 11 |
| Familias de frases prohibidas en el guardián | 8 |
| Huecos `TODO(decisión)` abiertos | 0 (el copy del perfil sigue pendiente de firma de MUSK) |

---

## 2. Inventario de archivos

| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `src/agent.ts` | 1483 | Motor: un turno por llamada, estados, cualificación, traspaso, silencios, bitácora |
| `src/content.ts` | 456 | Perfil único de contenido (FAQ, base de conocimiento y copy de cualificación); copy pendiente de firma de MUSK |
| `src/rules.ts` | 414 | Reglas 1-11, disparadores, guardián, textos fijos |
| `src/intent.ts` | 268 | Clasificador determinista en español; la FAQ gana a la base salvo que el lead nombre un programa |
| `src/kb.ts` | 1029 | Base de conocimiento como datos: 35 pasajes con respuesta, términos y procedencia |
| `src/retrieval.ts` | 411 | BM25 + cobertura de términos; los umbrales son constantes con nombre |
| `src/entailment.ts` | 125 | Fuente de fundamentación del LLM y su comprobación |
| `src/text.ts` | 25 | `normalizeEs`, el único normalizador |
| `src/outbound.ts` | 69 | Un solo mensaje por turno (respuesta y pregunta unidas) |
| `src/simulator.ts` | 192 | Consola interactiva (`--smoke`: un turno y salir) |
| `src/llm.ts` | 100 | Proveedor de IA opcional (compatible OpenAI) + doble para tests |
| `src/eval.ts` | 864 | Medición de recuperación y métricas |
| `src/eval.dataset.ts` | 1192 | 46 casos de la FAQ (C01-C46), 33 de la base de conocimiento (`EVAL_KB_CASES`) y los conjuntos de paráfrasis con su hold-out |
| `tests/rules.test.ts` | 916 | 58 tests |
| `tests/reception.test.ts` | 2000 | 115 tests |
| `tests/retrieval.test.ts` | 520 | 102 tests |
| `tests/ui-chat.test.ts` | 432 | 23 tests |
| `tests/eval.test.ts` | 183 | 12 tests |
| `tests/entailment.test.ts` | 165 | 13 tests |
| `tests/outbound.test.ts` | 118 | 8 tests |
| `tests/pilot-gate.test.ts` | 53 | 4 tests |
| `ui/chat.ts` | 302 | Modelo de vista del chat (sin DOM, testeable) |
| `ui/main.ts` | 478 | Pintado en el navegador |
| `ui/server.mjs` | 71 | Servidor estático local |
| `ui/build.mjs` | 40 | Empaquetado a `ui/dist/app.js` |
| `ui/index.html` / `ui/styles.css` | 27 / 770 | Interfaz |


---

## 3. Flujo de un turno

`runTurn(mensaje)` (`src/agent.ts`, método principal de `MuskAgent`):

1. **Cortes tempranos.** Si el lead pidió parar, turno silencioso (regla 7). Si ya
   se hizo el traspaso a humano, turno silencioso (regla 9).
2. **Clasificación** determinista del mensaje (`src/intent.ts`, `classify`).
3. **Recepción de respuestas.** Si hay una pregunta colgante y el mensaje es una
   respuesta, se captura como respuesta y no como duda nueva
   (`src/agent.ts`, `isReceivableAnswer` y `receiveAnswer`).
4. **Enrutado por intención** dentro de `src/agent.ts` (`runTurn`).
5. **Traspaso a humano** si el lead lo pide o acepta la llamada.
6. **Guardián** sobre el texto a enviar; si falla, se usa el texto aprobado.
7. **Antirrepetición** contra el último mensaje enviado.
8. **Bitácora** del turno y resultado tipado (`TurnResult`).

---

## 4. Clasificador de intenciones

Orden exacto de `classify` (`src/intent.ts`), deliberado: los temas protegidos se
clasifican **antes** de consultar la tabla de respuestas, de modo que ningún
tema sensible puede "caer" en una respuesta informativa.

`stop` → `human` → `price` → `temario` → `financiacion` → aceptación de llamada →
coincidencia en la tabla de respuestas → `decline` → saludo/acuse → `unknown`.

La normalización quita acentos (NFD), pasa a minúsculas y elimina puntuación, así
que "¿CUÁNTO CUESTA?" y "cuanto cuesta" se clasifican igual.

---

## 5. Reglas duras y guardián

Las 11 reglas están codificadas en `src/rules.ts` y **cada respuesta enviada pasa
por `guardReply`** (en `src/rules.ts`), que normaliza el texto y bloquea:

| Patrón bloqueado | Regla protegida |
|---|---|
| Símbolo `€`, la palabra "euros", cifras con moneda | 1 — nunca importes |
| `%`, "sin intereses", "interés cero", "cuotas fijas", "aplazado sin coste" | 3 — financiación sin condiciones |
| "módulo N", "unidad N", "tema N", "semana N", "lección N" | 2 — nada de temario detallado |
| "promoción", "descuento", "2x1", "oferta especial", "precio cerrado" | 4 — nada inventado |
| Cualquier forma de «garantiz*» («garantizamos», «garantizadas», «garantizado»…), además de las promesas de empleo | 4 — nada se promete como garantizado |

Si el guardián detecta una violación, la respuesta se descarta y se usa el texto
aprobado o se registra la duda. La consecuencia práctica: **el agente no puede
comunicar un importe ni por accidente**.

La invitación a la llamada es una única frase aprobada, reutilizada sin cambios
por la plantilla de precio y por la propuesta de cierre (`buildReply('callProposal')`):
*"¿Me dejas tu contacto o un momento en el que te venga bien que te llamen?"*
(la constante `CALL_INVITATION` de `src/rules.ts`).

---

## 6. Máquina de estados

Estado por conversación en los campos de la clase `src/agent.ts` (`MuskAgent`):
si paró (`stopped`), si se traspasó (`handoffFired`), preguntas ya realizadas
(`askedQuestions`), bitácora de turnos (`conversationRecords`), pregunta
colgante (`pendingAsk`), respuestas de cualificación
(`qualificationAnswersById`) y último mensaje enviado (`lastOutbound`).

- **Pregunta colgante** (`pendingAsk`): `opening` → `qualification{id}` →
  `callProposal`.
- **Silencios deliberados**: respuesta a una pregunta sin mensaje propio, después
  del traspaso y después de la parada. No es un fallo: es el comportamiento
  esperado y está cubierto por tests.
- **Antirrepetición**: si el texto iba a repetirse, se sustituye por la invitación;
  si esa también repetiría, el turno queda en silencio (`src/agent.ts`,
  `neverRepeat`).
- **Traspaso** (`HandoffContext`): motivo, lead, contacto, lote, último mensaje y
  resumen. Motivos confirmados: pidió hablar con una persona (`human_requested`) o
  aceptó la llamada (`call_accepted`).
- **Parada**: se detiene, se registra y no vuelve a escribir.

### 6.1 Respuesta a la propuesta de llamada

La propuesta de llamada es una pregunta de sí/no; la respuesta del lead la lee
`src/agent.ts` (`receiveCallAnswer`) en este orden: aceptación explícita →
rechazo → el lead diciendo que no puede u otro día → momento explícito →
teléfono entregado → cualquier otra cosa.

Una aceptación confirmada cierra el traspaso (`call_accepted`, regla 9): un "sí"
explícito, un momento ("por las tardes", "sobre las seis", "cuando puedas"), la
petición de que le llamen ("llámame") o un móvil español entregado con pista de
contacto ("te dejo mi número, 612 345 678").

Una negación cancela el cierre, nunca al revés: la guarda `NEGATED_ACCEPTANCE`
(`src/rules.ts`) reconoce "no", "nunca", "tampoco", "jamás" y "nada" acotando la
aceptación que la precede, y `TRAILING_NEGATOR` (en `src/rules.ts`) captura un
negador suelto al final del mensaje ("me viene bien, no"). Esas respuestas caen
en el camino de duda de la regla 5: la duda queda registrada y se ofrece
contacto humano.

Decisión, explícita: ante la duda el agente **no** cierra. El texto de aceptación
promete a una persona real una llamada; prometerla indebidamente incumple la
regla 9 (que exige una aceptación CONFIRMADA), mientras que el camino de duda
registra la duda y ofrece un humano, que es el objetivo del producto (el cierre
siempre es humano). Este comportamiento sustituye al anterior, en el que
"no, mejor a las seis" cerraba con el texto de aceptación.

Entregar el teléfono o pedir que le llamen anula una objeción de momento y
cierra igualmente ("no el jueves, te dejo mi número …"): el contacto es
exactamente lo que la llamada necesita. Es una decisión intencionada, no un
fallo.

Limitaciones aceptadas y documentadas: un modismo como "no hay problema, me va
bien" o "no sé, me viene bien" se lee como aceptación negada y cae en el camino
de duda (un falso negativo, en la dirección segura); una pista de teléfono junto
a un número de nueve dígitos sin relación ("mi número de cuenta es 612345678")
cierra igualmente; "sobre las 300" cuenta como momento; y un día de la semana
mencionado de pasada ("fui el martes a otra escuela") tras la propuesta también
cierra.

Nada de este módulo usa lookbehind: el bundle de la UI apunta a es2022 y Safari
15.4-16.3 parsea es2022 pero falla con las aserciones lookbehind al cargar, lo
que tumbaría la página entera por una sola guarda (la razón queda explicada en
los comentarios del código).

---

## 7. Modelo de contenido

Un único perfil, `APPROVED_CONTENT` (`src/content.ts`), con el contrato
`ApprovedContent`: presentación de la empresa, descripción general, metodología,
FAQ curada, preguntas de cualificación, mensaje inicial, cierre de llamada y la
base de conocimiento (35 pasajes). Todo el copy es **copy unificado pendiente de
firma de MUSK** (reglas 4 y 11): el agente solo puede emitir lo que está escrito
aquí, y cada respuesta pasa por el guardián.

No queda ningún `TODO(decisión)` abierto en `src/content.ts`. La protección sigue
armada para huecos futuros: `isPendingDecision()` los detecta por patrón, la
apertura (`opening()` en `src/agent.ts`) devuelve `null` si es un hueco y el
getter `pendingDecisions` (en `MuskAgent`) los expone para que la carencia quede
visible. **Un `TODO(decisión)` nunca se envía.**

El orden de la FAQ de `APPROVED_CONTENT` (`src/content.ts`) es de lo específico
a lo general: `findApprovedAnswer()` (`src/intent.ts`) devuelve la **primera**
coincidencia, así una pregunta concreta nunca cae en la respuesta genérica.

Dos matices del enrutado importan para no tocar el copy por accidente:

- **La FAQ gana a la base de conocimiento**, salvo cuando el lead **nombra un
  programa** y la base ofrece un pasaje `-contenido`/`-salidas` de ese programa
  (`isProgrammePassage` en `src/kb.ts`). El guard `mentionsProgramme` evita que
  una familia («programación») se trate como programa.
- **La pregunta pendiente gana al catálogo**: si el mensaje encaja con las
  reacciones de la pregunta armada, se trata como respuesta y no como consulta.

---

## 8. Capa de IA

- Variables de entorno: `MUSK_LLM_BASE_URL`, `MUSK_LLM_API_KEY`,
  `MUSK_LLM_MODEL` (por defecto `gpt-4o-mini`), `MUSK_LLM_TEMPERATURE`.
- Sin `MUSK_LLM_BASE_URL` o sin `MUSK_LLM_API_KEY`, el agente funciona **sin IA**
  (`loadLLMConfigFromEnv` en `src/llm.ts`).
- La IA solo se consulta en turnos `general` que ya coincidieron con una respuesta
  aprobada: la rama `general` de `runTurn` llama a `replyFromApprovedFaq`
  (`src/agent.ts`), el único punto que invoca al proveedor. Los temas protegidos
  **nunca** la llaman, y hay tests que lo comprueban contando llamadas al
  proveedor.
- La salida del modelo se valida siempre con el guardián; si falla, se cae al
  texto aprobado (dentro de `replyFromApprovedFaq`).
- La interfaz web arranca con `provider: null`: **la web publicada es 100%
  determinista**.

---

## 9. Simulador

`npm run sim` (interactivo, con el perfil único) y `npm run sim -- --smoke`
(un turno y salir). Ya no existen `npm run sim:demo` ni el flag `--demo`. Muestra
la apertura y, si apareciera un hueco futuro, lo señala sin enviarlo; también
muestra cada turno con su intención, acción, silencios, dudas registradas,
respuestas capturadas, traspaso y violaciones del guardián. Comandos: `/reset`,
`/state`, `/exit`.

---

## 10. Evaluación

43 casos etiquetados de la FAQ en 5 grupos (`src/eval.dataset.ts`), más 30 casos
de la base de conocimiento en un array aparte (`EVAL_KB_CASES`, grupos F y G):

| Grupo | Casos | Contenido |
|---|---|---|
| A | C01–C18 | Coincidencia directa por palabra clave |
| B | C19–C22, C41–C43 | Paráfrasis |
| C | C23–C31 | Temas prohibidos |
| D | C32–C35 | Sin respuesta aprobada |
| E | C36–C40 | Derivación a humano y rechazo |
| F | 22 casos de la base de conocimiento | Preguntas que la base de conocimiento debe responder |
| G | 8 casos de la base de conocimiento | Preguntas que deben escalar (precio, financiación, devoluciones, becas, fechas, ubicación, requisitos) |

Métricas: aciertos, respuestas erróneas, omisiones, falsos positivos, nulos
correctos, **recuerdo**, **precisión**, exactitud de intención y violaciones del
guardián.

Umbrales que los tests exigen (`tests/eval.test.ts`): **0 falsos positivos**,
**0 violaciones del guardián**, exactitud perfecta en los temas prohibidos
(C23–C31), recuerdo y precisión en 1.0, y cobertura de las 9 entradas de FAQ.

---

## 11. Interfaz web y publicación

- `ui/chat.ts` es un modelo de vista puro (sin DOM) y por eso es testeable;
  `ui/main.ts` solo pinta.
- Marcadores visibles: apertura pendiente, silencio por parada y silencio por
  traspaso (`OPENING_PLACEHOLDER`, `STOPPED_REPLY_PLACEHOLDER` y
  `HANDOFF_REPLY_PLACEHOLDER`, las constantes de `ui/chat.ts`).
- Compilación: `npm run build:ui` → `ui/dist/app.js`. Servidor local:
  `npm run ui` → `http://localhost:4173`.
- La copia publicada se sirve de forma estática (un `app.js` + `index.html` +
  `styles.css` por rutas relativas), por lo que puede alojarse en cualquier
  hosting estático.
- La vista lleva la piel de marca de MUSK (paleta en variables CSS, tipografía
  Outfit, adaptación a móvil y respeto por `prefers-reduced-motion`).
- Publicación actual: Vercel (`vercel.json` empaqueta la interfaz), con **deploy
  manual** desde la raíz del repositorio. El repositorio no despliega solo.

---

## 12. Tests: cobertura y huecos

| Archivo | Tests | Qué garantiza |
|---|---|---|
| `tests/rules.test.ts` | 49 | Reglas obligatorias (precio, temario, financiación, desconocido, humano, parada); variantes y precisión de la parada; guardas estructurales (el contenido no tiene campos de precio ni de temario, ni texto con dinero); presencia de los marcadores `TODO(decisión)`; la FAQ y el contenido de muestra pasan el guardián; apertura y cualificación; cobertura del contenido aprobado; vocabulario de la propuesta de llamada y aceptación negada (regla 9) |
| `tests/reception.test.ts` | 91 | Captura de respuestas, precio mientras hay pregunta colgante, cierre proponiendo llamada, silencio tras el traspaso, antirrepetición, reinicio; y la respuesta a la propuesta de llamada: momento, teléfono entregado, indisponibilidad y negaciones |
| `tests/ui-chat.test.ts` | 14 | Perfiles, marcadores, diagnóstico por turno, dudas (regla 5), parada, reinicio |
| `tests/eval.test.ts` | 12 | Umbrales de evaluación citados arriba |
| `tests/entailment.test.ts` | 13 | Comprobación de fundamentación de la reformulación del LLM |
| `tests/retrieval.test.ts` | 20 | Capa de base de conocimiento: umbrales, temas prohibidos y agente de extremo a extremo |

**No cubierto**: concurrencia entre varios leads, persistencia, reintentos, orden
de mensajes, comportamiento ante errores del proveedor de IA más allá del doble de
pruebas, y los archivos de servidor y empaquetado.

---

## 13. Fragilidades de cara a un canal real

El agente funciona hoy **en memoria y por instancia**: una conversación por objeto,
sin nada compartido.

- Sin persistencia: al reiniciar el proceso se pierde todo el estado.
- Sin identidad de sesión: no hay deduplicación por identificador de mensaje del
  canal ni protección ante reprocesos.
- Sin cola ni reintentos: mensajes desordenados o duplicados no tienen defensa.
- Sin bloqueo: mensajes simultáneos del mismo lead tocarían el mismo estado a la
  vez.
- Sin canal, sin webhook y sin límites de ritmo.
- La interfaz publicada no tiene autenticación.

Nada de esto invalida el diseño: es que el agente está a un paso antes del canal.

---

## 14. Pendientes abiertos

1. Los **cuatro contenidos** de Nicolás: presentación, mensaje inicial y las dos
   preguntas de cualificación (ver `docs/pedido-nicolas.md`).
2. **Duración y fechas**: no hay respuesta aprobada; el agente lo dice con
   honestidad y deriva a la llamada.
3. Si se confirma el texto de "prácticas **garantizadas**", hay que redactarlo: la
   palabra activa el guardián.
4. Decisiones operativas no implementadas: receptor de los avisos, mecanismo de la
   llamada, cadencia de seguimiento y reglas de parada, etiquetas conversacionales,
   canal, base legal y umbrales de éxito.
5. La frase de cierre pide "tu contacto o un momento" aunque en WhatsApp el número
   ya se conoce; si el agente debe pedir el contacto o acordar el momento sigue
   siendo una decisión abierta (`AGENTS.md`, decisiones abiertas: mecanismo de
   llamada) y requiere el visto bueno de Nicolás, no un cambio unilateral
   (regla 11).

---

## 15. Cómo trabajar con este agente

```bash
npm test          # 335 tests
npm run eval      # 79 casos con métricas (46 de la FAQ + 33 de la base de conocimiento) más 22 de grounding
npm run sim       # conversar con el agente (perfil único, copy pendiente de firma)
npm run ui        # interfaz local en http://localhost:4173
npm run typecheck # comprobación de tipos
npm run pilot-gate # comprueba que no hay .env versionado
```

Orden de lectura recomendado para entenderlo de verdad (unas 8.000 líneas de
TypeScript en total: las de `src/` y `tests/`, sin contar las de `ui/`, que son
la capa de vista de la simulación, no el agente; todas comentadas explicando el
porqué):

`src/rules.ts` → `src/intent.ts` → `src/content.ts` → `src/agent.ts` →
`ui/chat.ts`.

Lo que **no** hace falta investigar para trabajar aquí: cómo construir un bot de
WhatsApp, frameworks de agentes ni ingeniería de prompts. El diseño es
deliberadamente el inverso: primero las reglas, después (y opcionalmente) la IA.
