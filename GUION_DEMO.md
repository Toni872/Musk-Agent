# MUSK — Guion de demo (validación con Nicolás)

Guion verificado contra el agente real (`MuskAgent`, `APPROVED_CONTENT` curado, `provider=null`). Todo el flujo es **determinista y offline** (sin LLM, sin red, sin API key). Última verificación: 2026-10-16, 65/65 tests.

> **Apertura y cualificación (14-10)**: el agente ya consume `initialMessage` (apertura) y `qualificationQuestions` (una pregunta por turno). En el contenido del piloto ambos siguen a `TODO(decisión)`, así que **no se envían**: al arrancar se informa de lo que está abierto con Nicolás. La lista `pending` incluye además `companyPresentation` (la **presentación de MUSK**: la spec §3.6 la exige y §8.1 la deja como información a aportar por Nicolás — no se inventa). El flujo **completo** (apertura + 2 preguntas) se ve con el perfil DEMO: `npm run sim:demo`.

## Preparación (una vez)

```powershell
cd musk
npm install
npm run typecheck
npm test
```

## Ejecución en vivo

La demo se corre en **una terminal real** (Windows Terminal / PowerShell) porque el REPL necesita TTY:

```powershell
cd musk
npm run sim
```

Al arrancar muestra: `Content: Curso de Desarrollo Full Stack (curated from MUSK dossier; final wording sign-off pending).` y, debajo, el bloque `--- opening ---` con la apertura (o el aviso de que el mensaje inicial sigue pendiente con MUSK) y la lista `pending` de `TODO(decisión)`.

> **Gotcha conocido**: el REPL no consume stdin pipeado en modo no-TTY (readline/promises lee solo la primera línea y el proceso muere con `unsettled top-level await`). Si la automatización rompe, no es el agente: es la limitación del REPL interactivo. Para validación no interactiva, ver "Verificación automatizada" abajo.

## Conversación 1 — el flujo completo hasta la llamada (objetivo del MVP)

| # | Escribe el lead | El agente responde (observado) | Regla |
|---|---|---|---|
| 1 | `Hola` | ¡Hola! Soy el asistente de MUSK. ¿En qué puedo ayudarte? Si prefieres, puedes hablar con una persona del equipo cuando quieras. | Saludo |
| 2 | `¿es online o presencial?` | La formación es online, con clases en directo y workshops, además de recursos y una comunidad de desarrollo. Los detalles de horarios y disponibilidad los concretamos contigo en una llamada. | FAQ modalidad (contenido curado) |
| 3 | `¿cuánto cuesta?` | No puedo compartir el precio ni los importes por aquí. Lo conversamos con detalle en una llamada con el equipo... | Regla 1 (precio) |
| 4 | `¿hay financiación?` | Sí, existen opciones de financiación. No puedo darte condiciones ni importes por aquí... | Regla 3 (financiación) |
| 5 | `¿me pasáis el temario?` | No puedo enviarte el temario detallado por aquí. Sí te puedo contar el contenido general... | Regla 2 (temario) |
| 6 | `¿dais un título oficial?` | Buena pregunta. No tengo una respuesta aprobada sobre eso, así que lo dejo anotado como duda... ¿Te viene bien que te contacten para aclararlo? | **Regla 5 (duda) — PIVOTE** |
| 7 | `¿necesito experiencia previa?` | No necesitas conocimientos previos: la metodología es progresiva y práctica, pensada para empezar desde la base. | FAQ requisitos |
| 8 | `me parece muy caro` | No puedo compartir el precio ni los importes por aquí... | Objeción de dinero (sin la palabra "precio") |
| 9 | `bueno, me va bien una llamada` | Perfecto, dejo anotado que te va bien la llamada. El equipo se pone en contacto contigo para acordar el detalle. | **Handoff `call_accepted` — objetivo** |

Estado final observado de la conversación 1: `stopped=false records=11`.

## Conversación 1b — cobertura de información (14-10)

Cada frase de abajo se comprobó contra el agente real (`provider=null`). Todas alcanzan **contenido ya aprobado** del dossier: no se inventa nada. Enrutado por palabras clave, de lo específico a lo general:

| Escribe el lead | El agente responde (observado) | Ruta |
|---|---|---|
| `hola, dame información sobre Musk` | Te escribimos desde MUSK Technologies. Por aquí puedo contarte todo sobre el Curso de Desarrollo Full Stack: en qué consiste, qué habilidades trabajas y qué salidas tiene. Cualquier detalle sobre MUSK o el equipo te lo confirma una persona cuando quieras. | FAQ `sobre-musk` (identidad + formación + humano; la presentación de MUSK sigue pendiente) |
| `¿de qué va el curso?` | Claro. El Curso de Desarrollo Full Stack te forma para crear aplicaciones web completas, desde la parte visual (front end) hasta la lógica del servidor (back end)... | FAQ `informacion` (genérica, la última) |
| `¿qué voy a aprender?` | Trabajas desarrollo web (front end y back end), diseño de interfaces (UI/UX), integración de APIs, gestión de bases de datos... | FAQ `contenido` (regla 2: habilidades sí) |
| `¿qué salidas tiene?` | La formación apunta a perfiles como Full Stack Developer, Frontend Developer, Backend Developer... | FAQ `salidas` (sin promesa de empleo) |
| `¿cómo son las clases?` | Se aprende haciendo: retos, quizzes y puzzles de lógica en un método práctico y gamificado... | FAQ `metodologia` |
| `¿cuánto dura el curso?` | La duración, el calendario y las fechas de inicio los concretamos contigo en una llamada, para ajustarlo a tu punto de partida. Por aquí no puedo darte cifras. | FAQ `duracion` (sin dato aprobado: no inventa) |
| `quiero información sobre los precios` | No puedo compartir el precio ni los importes por aquí... | Precisión: sigue siendo **regla 1** (precio) |
| `¿dais un título oficial?` | Buena pregunta. No tengo una respuesta aprobada sobre eso... | **Regla 5 (duda)** — lo que no está aprobado sigue derivando |

## Conversación 2 — el lead pide parar (regla 7)

| # | Escribe el lead | El agente responde (observado) |
|---|---|---|
| 10 | `no me escribáis más` | Entendido, respeto tu decisión: no vuelvo a escribirte. Queda registrado como "no continuar". |
| 11 | `gracias` | *(sin mensaje: conversación detenida — turno suprimido)* |

Estado final observado de la conversación 2: `stopped=true records=2`.

## Conversación 3 — perfil DEMO: recepción de respuestas (16-10)

La incoherencia que apareció al probar en el navegador estaba en el **motor**, no en la interfaz: el agente preguntaba y después trataba la respuesta del lead como una consulta sin respuesta aprobada («Buena pregunta…»), porque no recordaba qué había preguntado. Corregido y **verificado en crudo** contra `MuskAgent` con `DEMO_CONTENT`: **cero dudas**.

Con el perfil DEMO (apertura + dos preguntas), los tres primeros mensajes del lead:

| # | Escribe el lead | El agente responde (observado) | Mecanismo |
|---|---|---|---|
| 1 | `Si` | *(sin mensaje propio: sigue la 1ª pregunta)* | Respuesta a la **apertura** (ya no re-saluda) |
| 2 | `parto de 0` | *(sin mensaje propio: sigue la 2ª pregunta)* | Respuesta a `starting-experience` (no es duda) |
| 3 | `lo antes posible` | ¿Me dejas tu contacto o un momento en el que te venga bien que te llamen? | Respuesta a `time-interest` + **propuesta de llamada** (no es texto nuevo: es la misma frase que ya cierra la respuesta de precio) |
| 4 | `bueno, me va bien una llamada` | Perfecto, dejo anotado que te va bien la llamada. El equipo se pone en contacto contigo para acordar el detalle. | Regla 9: handoff `call_accepted` — **el objetivo del flujo** |

Línea de operador observada: `intent=general/unknown action=none suppressed=false doubts=0` más `received = answer to <id> (no doubt registered)`. Total de dudas del flujo: **0**. Registro final observado: `stopped=false records=8`.

> **Cambiado el 16-10 (al probarlo en el navegador):** el agente acusaba recibo de cada respuesta con la misma línea —«Gracias, lo apunto.»— enviada como mensaje aparte. Repetida tres veces seguidas, y hablando de nuestro propio registro, delataba al bot. **Ese mensaje ya no existe**: la respuesta se anota y la conversación sigue con la pregunta siguiente.
>
> Y al agotar las preguntas el agente **sí** cierra proponiendo la llamada, que era el único paso del flujo sin mensaje. Lo hace con una frase **ya aprobada**: la misma invitación con la que termina la respuesta de precio. `REPLY_TEMPLATES.callProposal` la reutiliza desde una única constante (`CALL_INVITATION`), así que las dos copias no pueden desviarse. **No hay texto nuevo que firmar** (regla 11); aun así, que Nicolás vea dónde aparece.

Lo que **no** se captura como respuesta (y deja la pregunta pendiente). Verificado en crudo para precio y parada; el resto, cubierto por `tests/reception.test.ts`:

| Escribe el lead | Qué sigue haciendo |
|---|---|
| `¿cuánto cuesta?` | Regla 1: plantilla de precio, sin importes |
| `¿me pasáis el temario?` | Regla 2: contenido general, sin temario detallado |
| `me va bien una llamada` | Regla 9: dispara el handoff al comercial |
| `no me escribáis más` | Regla 7: detiene la conversación |
| `¿tenéis campus en Valencia?` | Regla 5: registra la duda y propone contacto humano (una pregunta real no se traga como respuesta) |

Con el **contenido real (piloto)** la apertura y las preguntas siguen en `TODO(decisión)`, así que no se envían y el mecanismo no altera nada del guion de la conversación 1.

## Frase de apertura recomendada

> "No te traigo un bot terminado — te traigo el motor y las reglas funcionando, para que las validemos juntas antes de conectar nada real."

## Puntos a destacar en sesión

1. **Pivote natural (turno 6):** una pregunta sin respuesta aprobada (p. ej. el título oficial) dispara la regla 5 y abre la lista de decisiones de contenido. La duración ya no cae en la regla 5: se responde sin cifras y se deriva a la llamada (ver conversación 1b).
2. **Sin importes en ningún momento:** precio, financiación y objeción responden sin cifras; todo reconduce a la llamada.
3. **Objetivo cerrado:** el flujo acaba en handoff (`call_accepted`), nunca en venta por WhatsApp.
4. **Parada respetada:** regla 7, incluido el vosotros ("no me escribáis").
5. **Cobertura ampliada (14-10):** "dame información", "de qué va", "qué aprendo", "qué salidas" y "cómo son las clases" se responden con contenido **ya aprobado** del dossier (conversación 1b); solo lo que no está aprobado cae en la regla 5. Ninguna respuesta nueva inventa condiciones, promociones ni promesas.

## Decisiones a cerrar con Nicolás

(A) **Contenido** (piloto FullStack ya curado; solo quedan):
 1. **Presentación de MUSK** (`companyPresentation`): la spec §3.6 la exige como contenido mínimo y §8.1 la deja como información a aportar por Nicolás. Hoy "sobre MUSK" responde con identidad + formación + humano, y el ítem queda visible como pendiente.
 2. Texto del mensaje inicial (`initialMessage`).
 3. Preguntas de cualificación finales (propuestas: experiencia de partida, tiempo de interés).
 4. Duración del curso: no hay respuesta aprobada con datos; hoy se responde sin cifras y se deriva a la llamada.
 5. Redacción final de "prácticas garantizadas" si se confirma.
  6. Plantilla de rechazo amable (IMPLEMENTADA el 12-10): un "no me interesa" seco → `decline` con copy dedicado ("Entendido, lo respeto…"), registra duda y NO para la conversación. Revisar wording con Nicolás.
  7. **Frase de cierre de la cualificación** (16-10, IMPLEMENTADO): al agotar las preguntas el agente **sí** cierra — propone la llamada, que era el único paso del flujo sin mensaje. **No hay copy nueva**: reutiliza palabra por palabra la invitación ya aprobada con la que termina la respuesta de precio (`REPLY_TEMPLATES.callProposal`, que comparte la constante `CALL_INVITATION`), así que la regla 11 no introduce texto por aprobar. Mostrarle a Nicolás **dónde** aparece (hoy solo se ve con el perfil DEMO: el real espera `initialMessage`).

(B) **Operación/producto** (no bloquean la demo):
 1. Receptor de los avisos (handoff) y su cobertura.
 2. Mecanismo de llamada (solicitar contacto vs acordar momento).
 3. Cadencia de seguimiento + reglas de parada.
 4. Etiquetas conversacionales definitivas.
 5. Configuración del canal WhatsApp + base legal/privacidad/transparencia del lote real.
 6. Tamaño de muestra y fecha de lanzamiento.

(C) **NO reabrir:** las cifras del 18/09 (6 intentos, ~3 %, >300 €, 12-15/35) son contexto histórico sin denominador; nunca entran como constantes.

## Verificación automatizada (sin tipear)

```powershell
cd musk
npm run typecheck   # cero errores
npm test            # 65 tests, sin red
npm run eval        # bucle de evaluación: 40 casos etiquetados, informe de recall/precisión sobre el enrutado real
npm run sim -- --smoke   # un turno guiado, exit 0
```

El **bucle de evaluación** (`npm run eval`) mide el enrutado de respuestas aprobadas con un dataset de 40 casos (pregunta del lead → respuesta esperada). No añade embeddings ni LLM: es una medición, no un recuperador. Hoy marca recall 1.00 y precisión 1.00, con 0 violaciones del guard: las paráfrasis sin palabra clave que fallaban (C19-C22, C34-C35) se cerraron ampliando el ruteo, sin tocar ningún texto de cara al lead.

Para reproducir el guion completo de forma no interactiva se usa un driver temporal `.mts` que importa `MuskAgent` (mismo código del agente, sin la limitación del REPL).