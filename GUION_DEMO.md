# MUSK — Guion de demo (validación con Nicolás)

Guion verificado contra el agente real (`MuskAgent`, `APPROVED_CONTENT` curado, `provider=null`). Todo el flujo es **determinista y offline** (sin LLM, sin red, sin API key). Última verificación: 2026-10-22, 227/266 tests.

> **Apertura y cualificación**: el agente ya consume `initialMessage` (apertura) y `qualificationQuestions` (una pregunta por turno). En el perfil aprobado, los marcadores `TODO(decisión)` siguen sin enviarse. El flujo DEMO tiene una pregunta de objetivo, orientada a la llamada. La presentación general puede incluir las cinco formaciones; el catálogo detallado sigue fuera de alcance.

## Preparación (una vez)

```powershell
npm install          # desde la raíz del repositorio
npm run typecheck
npm test
```

## Ejecución en vivo

La demo se corre en **una terminal real** (Windows Terminal / PowerShell) porque el REPL necesita TTY:

```powershell
npm run sim
```

Al arrancar muestra: `Content: Curso de Desarrollo Full Stack (curated from MUSK dossier; final wording sign-off pending).` y, debajo, el bloque `--- opening ---` con la apertura (o el aviso de que el mensaje inicial sigue pendiente con MUSK) y la lista `pending` de `TODO(decisión)`.

> **Gotcha conocido**: el REPL no consume stdin pipeado en modo no-TTY (readline/promises lee solo la primera línea y el proceso muere con `unsettled top-level await`). Si la automatización rompe, no es el agente: es la limitación del REPL interactivo. Para validación no interactiva, ver "Verificación automatizada" abajo.

## Conversación 1 — el flujo completo hasta la llamada (objetivo del MVP)

| # | Escribe el lead | El agente responde (observado) | Regla |
|---|---|---|---|
| 1 | `Hola` | ¡Hola! Soy el asistente de MUSK. ¿En qué puedo ayudarte? Si prefieres, puedes hablar con una persona del equipo cuando quieras. | Saludo |
| 2 | `¿es online o presencial?` | La formación es online, con clases en directo y workshops, además de recursos y una comunidad de desarrollo. Los detalles de horarios y disponibilidad los concretamos contigo en una llamada. | FAQ modalidad (contenido curado) |
| 3 | `¿cuánto cuesta?` | No puedo compartir precios por aquí. Sí hay opciones de financiación y tienes dos años para completar la formación con flexibilidad. El equipo te lo explica en una llamada. | Regla 1 (precio; sin importes) |
| 4 | `¿hay financiación?` | Sí, hay opciones de financiación. Tienes dos años para completar la formación con flexibilidad. El equipo puede explicarte las opciones en una llamada. | Regla 3 (financiación y tiempo) |
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
| `hola, dame información sobre Musk` | Te escribimos desde Escuela Musk. Por aquí puedo contarte todo sobre el Curso de Desarrollo Full Stack: en qué consiste, qué habilidades trabajas y qué salidas tiene. Cualquier detalle sobre MUSK o el equipo te lo confirma una persona cuando quieras. | FAQ `sobre-musk` (identidad + formación + humano; la presentación de MUSK sigue pendiente) |
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

## Conversación 3 — traza de demo: catálogo, elección de formación y llamada

Esta traza reproduce el texto compartido para la demo. La pregunta `goal` admite tanto un objetivo como una formación elegida; la respuesta exacta del lead se conserva bajo `goal` y conduce directamente a acordar la llamada.

| # | Escribe el lead | El agente responde (observado) | Mecanismo |
|---|---|---|---|
| 1 | `Si, me interesa. Dame informacion sobre los cursos` | Cinco programas: Python, Front End, Back End, Full Stack y el máster de videojuegos. Todos online y desde cero, con IA en los de desarrollo y videojuegos. ¿Tienes ya alguna formación en mente o qué te gustaría conseguir? Así el equipo puede orientarte en una llamada. | FAQ `catalogo-formaciones` + pregunta `goal` **en el mismo mensaje** (un único mensaje saliente por turno) |
| 2 | `el curso de full stack` | Entiendo, te interesa Full Stack. El equipo puede orientarte sobre ese programa en una llamada. ¿Qué día y a qué hora te viene bien que el equipo te llame? | Elección capturada bajo `goal` + reacción específica + cierre configurable |
| 3 | `los cursos pueden finanaciarse?` | Sí, hay opciones de financiación. Tienes dos años para completar la formación con flexibilidad. El equipo puede explicarte las opciones en una llamada. | Regla 3: alias estrecho del error tipográfico; usa la respuesta de financiación del perfil |

La respuesta de catálogo ya no termina con «Dime qué te atrae y te oriento.»: esa invitación pedía lo mismo que la pregunta `goal` que sale a continuación, y desde el 22-10 ambos textos viajan en un solo mensaje (`src/outbound.ts`). Cuando la respuesta ya es una pregunta, la pregunta de cualificación NO se apila: una sola pregunta por mensaje.

La respuesta de financiación sigue siendo la configurada en el perfil y no genera un registro de KB. No se envía un WhatsApp real ni se integra el CRM. Las pruebas de regresión son sintéticas: no se presentan como tráfico observado adicional.

Lo que **no** se captura como respuesta (y deja la pregunta pendiente). Verificado en crudo para precio y parada; el resto, cubierto por `tests/reception.test.ts`:

| Escribe el lead | Qué sigue haciendo |
|---|---|
| `¿cuánto cuesta?` | Regla 1: plantilla de precio, sin importes |
| `¿me pasáis el temario?` | Regla 2: contenido general, sin temario detallado |
| `me va bien una llamada` | Regla 9: dispara el handoff al comercial |
| `no me escribáis más` | Regla 7: detiene la conversación |
| `¿tenéis campus en Valencia?` | Regla 5: registra la duda y propone contacto humano (una pregunta real no se traga como respuesta) |

Y en la respuesta a la propuesta de llamada (ampliado 18-10, tras la traza del cliente) — lo que **sí** cierra el handoff y lo que no:

| Escribe el lead | Qué sigue haciendo |
|---|---|
| `mañana` / `el jueves` / `por las tardes` | Regla 9: momento dado = acuerdo, handoff `call_accepted` |
| `687 723 287` / `mi móvil es 687 723 287` | Regla 9: el contacto ES la llamada, handoff `call_accepted` |
| `hasta mañana` | **NO** cierra: es una despedida, cae en la regla 5 (una despedida nunca agenda una llamada) |
| `no puedo por la tarde` | **NO** cierra: non-availability, regla 5 |
| ante la respuesta de duda, `si` | El agente **sigue escuchando** esa pregunta: `si` → handoff (antes: saludo social) |
| una respuesta aprobada repetida (`cuéntame más` x2) | Se repite la respuesta: la invitación ya no la sustituye |
| tras pedir humano, el teléfono | No responde (habla el comercial), pero el contacto queda registrado para el aviso |
| tras la **duda** (regla 5), `si` | Regla 9: el "sí" es el acuerdo con que le contacten → handoff `call_accepted`. Antes se guardaba como respuesta a la pregunta de cualificación y la conversión se perdía |
| tras la **duda** (regla 5), la siguiente pregunta | No se apila: la pregunta de cualificación se aplaza hasta que el lead conteste a la duda (dos preguntas seguidas no se responden) |
| tras la **derivación**, `mañana a las 9:00` | No responde (habla el comercial), pero el momento queda registrado y el aviso al comercial se corrige con esa hora |

> **Cambiado el 20-10 (defectos D5 y D6):** tras una duda (regla 5), un "sí" suelto **deriva ahora a humano** (regla 9): antes se archivaba como respuesta a la pregunta de cualificación y el lead se perdía. Y todo mensaje que llega **después** de la derivación queda registrado (el momento acordado suele llegar tarde: "mañana" y después "mañana a las 9:00"), amending el aviso al comercial; antes solo se guardaba el teléfono y el resto se perdía en silencio. El agente sigue sin escribir nada después de la derivación (regla 9).


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

(A) **Contenido** (el contenido aprobado mantiene sus marcadores abiertos):
 1. **Presentación de MUSK** (`companyPresentation`), mensaje inicial (`initialMessage`) y las dos preguntas del perfil aprobado (`qualificationQuestions`).
 2. Los demás textos de la DEMO y los pasajes de la base de conocimiento siguen pendientes de firma, salvo el plazo de dos años con flexibilidad confirmado por Nicolás.
 3. Los detalles de horas, fechas de inicio y condiciones de pago siguen sin aprobarse y deben escalar.

(B) **Operación/producto** (no bloquean la demo):
  1. La destinataria del aviso es Laura y ella decide la asignación; falta confirmar su cobertura.
  2. Cadencia de seguimiento + reglas de parada.
  3. Etiquetas conversacionales definitivas.
  4. Configuración del canal WhatsApp + base legal/privacidad/transparencia del lote real.
  5. Tamaño de muestra y fecha de lanzamiento.

(C) **NO reabrir:** las cifras del 18/09 (6 intentos, ~3 %, >300 €, 12-15/35) son contexto histórico sin denominador; nunca entran como constantes.

## Verificación automatizada (sin tipear)

```powershell
npm run typecheck   # cero errores
npm test             # 266 tests, sin red
npm run eval        # 43 casos de FAQ + 30 de KB + 22 de fundamentación
npm run sim -- --smoke   # un turno guiado, exit 0
npm run build:ui    # empaqueta el simulador de navegador
npm run ui          # sirve el simulador en http://localhost:4173
```

El **bucle de evaluación** (`npm run eval`) mide el enrutado de respuestas aprobadas con un dataset de 43 casos (pregunta del lead → respuesta esperada). No añade embeddings ni LLM: es una medición, no un recuperador. Hoy marca recall 1.00 y precisión 1.00, con 0 violaciones del guard. La comparación léxica de Fase 2 sigue siendo un benchmark sintético, bloqueado para producción; el modo de runtime permanece en `baseline`.

Para reproducir el guion completo de forma no interactiva se usa un driver temporal `.mts` que importa `MuskAgent` (mismo código del agente, sin la limitación del REPL).
