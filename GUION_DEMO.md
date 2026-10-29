# MUSK — Guion de demo (validación con Nicolás)

Guion verificado contra el agente real (`MuskAgent`, `APPROVED_CONTENT` curado, `provider=null`). Todo el flujo es **determinista y offline** (sin LLM, sin red, sin API key). Última verificación: 2026-10-29, 372/372 tests.

> **Apertura y cualificación**: el perfil único ya incluye `initialMessage` (apertura) y una única pregunta de cualificación `goal`, orientada a la llamada. No quedan marcadores `TODO(decisión)` en el contenido; el copy unificado está escrito, pero sigue pendiente de firma de MUSK. La presentación general puede incluir las cinco formaciones; el catálogo detallado sigue fuera de alcance.

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

Al arrancar muestra `Content: Escuela Musk unified profile (curated from MUSK material; final wording sign-off pending).`, después `LLM provider: none - deterministic approved replies only. Set MUSK_LLM_BASE_URL and MUSK_LLM_API_KEY to enable.` (la demo va sin LLM) y debajo el bloque `--- opening ---` con la apertura ya redactada. No aparece la antigua lista `pending` de `TODO(decisión)`: el perfil único ya no contiene esos marcadores, pero el copy unificado sigue pendiente de firma de MUSK.

> **Gotcha conocido**: el REPL no consume stdin pipeado en modo no-TTY (readline/promises lee solo la primera línea y el proceso muere con `unsettled top-level await`). Si la automatización rompe, no es el agente: es la limitación del REPL interactivo. Para validación no interactiva, ver "Verificación automatizada" abajo.

## Conversación 1 — el flujo completo hasta la llamada (objetivo del MVP)

| # | Escribe el lead | El agente responde (observado) | Regla |
|---|---|---|---|
| 1 | `Hola` | ¡Hola! Soy el asistente de MUSK. ¿En qué puedo ayudarte? Si prefieres, puedes hablar con una persona del equipo cuando quieras. | Saludo |
| 2 | `¿es online o presencial?` | Todo es online: campus virtual, comunidad y tutores personales que te acompañan. No hay horarios fijos de conexión, así que puedes compaginarlo con tu rutina. | FAQ modalidad (contenido curado) |
| 3 | `¿cuánto cuesta?` | El precio prefiero que te lo explique una persona. Sí hay opciones de financiación y dos años flexibles para completarla. Si quieres, te paso con el equipo y te lo cuenta en una llamada. | Regla 1 (precio; sin importes) |
| 4 | `¿hay financiación?` | Sí, hay opciones de financiación. Tienes dos años para completar la formación con flexibilidad. El equipo puede explicarte las opciones en una llamada. | Regla 3 (financiación y tiempo) |
| 5 | `¿me pasáis el temario?` | No puedo enviarte el temario detallado por aquí. Sí te puedo contar el contenido general: las habilidades que trabajas, lo que aprendes y las salidas profesionales. Si te encaja, lo vemos con más detalle en una llamada. | Regla 2 (temario) |
| 6 | `¿dais un título oficial?` | Buena pregunta. No tengo una respuesta aprobada sobre eso, así que lo dejo anotado como duda para que una persona del equipo te lo confirme. ¿Te viene bien que te contacten para aclararlo? | **Regla 5 (duda) — PIVOTE** |
| 7 | `¿necesito experiencia previa?` | No necesitas conocimientos previos: la metodología es progresiva y práctica, pensada para empezar desde la base. | FAQ requisitos |
| 8 | `me parece muy caro` | El precio prefiero que te lo explique una persona. Sí hay opciones de financiación y dos años flexibles para completarla. Si quieres, te paso con el equipo y te lo cuenta en una llamada. | Objeción de dinero (sin la palabra "precio"): misma respuesta del perfil que el turno 3 |
| 9 | `bueno, me va bien una llamada` | Perfecto, dejo anotado que te va bien la llamada. El equipo se pone en contacto contigo para acordar el detalle. | **Handoff `call_accepted` — objetivo** |

Estado final observado de la conversación 1: `stopped=false records=13 doubts=1`.

## Conversación 1b — cobertura de información

Cada frase se comprobó contra el agente real (`provider=null`), **una sesión nueva por frase**. Todas alcanzan **contenido ya aprobado** del perfil: no se inventa nada.

Desde el perfil único, toda respuesta de la FAQ viaja en el mismo mensaje que la pregunta `goal` (una sola pregunta por turno, ver `src/outbound.ts`), así que estas filas terminan con el mismo cierre: **"Antes de contarte nada, me gustaría entender qué buscas. Si no encaja, te lo digo yo. ¿Tienes algo en mente?"**. Se escribe completo en la primera fila y en el resto se abrevia como `+ pregunta` `goal` para no repetirlo ocho veces.

| Escribe el lead | El agente responde (observado) | Ruta |
|---|---|---|
| `hola, dame información sobre Musk` | Te escribimos desde Escuela Musk. Por aquí puedo contarte todo sobre la formación: en qué consiste, qué se trabaja y qué salidas tiene. Cualquier detalle sobre el equipo te lo confirma una persona cuando quieras. Antes de contarte nada, me gustaría entender qué buscas. Si no encaja, te lo digo yo. ¿Tienes algo en mente? | FAQ identidad (general) |
| `¿de qué va el curso?` | Las formaciones son online y prácticas: aprendes con proyectos reales y acompañamiento. Hay programas de programación, videojuegos e IA; el equipo puede orientarte sobre cuál encaja contigo. + pregunta `goal` | FAQ `informacion` (genérica) |
| `¿qué voy a aprender?` | Trabajas fundamentos sólidos de programación, proyectos con metodologías ágiles y resolución de problemas reales en equipo. + pregunta `goal` | FAQ `contenido` (regla 2: habilidades sí) |
| `¿qué salidas tiene?` | La formación prepara perfiles junior para incorporarse a un equipo real, construir su propio portafolio y especializarte en el área que elijas. El encaje concreto lo ves con el equipo. + pregunta `goal` | FAQ `salidas` (sin promesa de empleo) |
| `¿cómo son las clases?` | Se aprende con proyectos guiados y clases en directo, con acompañamiento y tutorías durante todo el programa. + pregunta `goal` | FAQ `metodologia` |
| `¿cuánto dura el curso?` | Tienes dos años para completarla con flexibilidad, a tu ritmo entre sesiones. El calendario y las fechas de inicio los concretamos contigo en una llamada. Por aquí no puedo darte cifras. + pregunta `goal` | FAQ `duracion` (plazo aprobado; fechas siguen escalando) |
| `quiero información sobre los precios` | El precio prefiero que te lo explique una persona. Sí hay opciones de financiación y dos años flexibles para completarla. Si quieres, te paso con el equipo y te lo cuenta en una llamada. + pregunta `goal` | Precisión: sigue siendo **regla 1** (precio) |
| `¿dais un título oficial?` | Buena pregunta. No tengo una respuesta aprobada sobre eso, así que lo dejo anotado como duda para que una persona del equipo te lo confirme. ¿Te viene bien que te contacten para aclararlo? | **Regla 5 (duda)** — lo no aprobado sigue derivando y **no** arrastra la pregunta `goal` |

## Conversación 2 — el lead pide parar (regla 7)

| # | Escribe el lead | El agente responde (observado) |
|---|---|---|
| 10 | `no me escribáis más` | Entendido, respeto tu decisión: no vuelvo a escribirte. Queda registrado como "no continuar". |
| 11 | `gracias` | *(sin mensaje: conversación detenida — turno suprimido y sin registro)* |

Estado final observado de la conversación 2: `stopped=true records=1`. El turno suprimido no deja registro: es la prueba de que la parada es real, no un silencio del agente.

## Conversación 3 — traza de demo: catálogo, elección de formación y llamada

Esta traza reproduce el texto compartido para la demo. La pregunta `goal` admite tanto un objetivo como una formación elegida; la respuesta exacta del lead se conserva bajo `goal` y conduce directamente a acordar la llamada.

| # | Escribe el lead | El agente responde (observado) | Mecanismo |
|---|---|---|---|
| 1 | `Si, me interesa. Dame informacion sobre los cursos` | Cinco programas: Python, Front End, Back End, Full Stack y el máster de videojuegos. Todos online y desde cero, con IA en los de desarrollo y videojuegos. Antes de contarte nada, me gustaría entender qué buscas. Si no encaja, te lo digo yo. ¿Tienes algo en mente? | FAQ `catalogo-formaciones` + pregunta `goal` **en el mismo mensaje** (un único mensaje saliente por turno) |
| 2 | `el curso de full stack` | Entiendo, te interesa Full Stack: la parte visual y la lógica de una aplicación web. ¿Qué día y a qué hora te viene bien que el equipo te llame? | Elección capturada bajo `goal` + reacción específica del programa + cierre configurable |
| 3 | `los cursos pueden finanaciarse?` | Sí, hay opciones de financiación. Tienes dos años para completar la formación con flexibilidad. El equipo puede explicarte las opciones en una llamada. | Regla 3: alias estrecho del error tipográfico; respuesta de financiación del perfil |

La respuesta de catálogo ya no termina con «Dime qué te atrae y te oriento.»: esa invitación pedía lo mismo que la pregunta `goal` que sale a continuación, y ambos textos viajan en un solo mensaje (`src/outbound.ts`). Cuando la respuesta ya es una pregunta, la pregunta de cualificación NO se apila: una sola pregunta por mensaje.

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

Con el **perfil único**, la apertura y la pregunta `goal` ya están redactadas y se usan tanto en `npm run sim` como en la interfaz. No quedan marcadores `TODO(decisión)`; todo el copy unificado sigue pendiente de firma de MUSK.

## Frase de apertura recomendada

> "No te traigo un bot terminado — te traigo el motor y las reglas funcionando, para que las validemos juntas antes de conectar nada real."

## Puntos a destacar en sesión

1. **Pivote natural (turno 6):** una pregunta sin respuesta aprobada (p. ej. el título oficial) dispara la regla 5 y abre la lista de decisiones de contenido. La duración ya no cae en la regla 5: se responde con el plazo aprobado y se deriva la fecha a la llamada (ver conversación 1b).
2. **Sin importes en ningún momento:** precio, financiación y objeción responden sin cifras; todo reconduce a la llamada.
3. **Objetivo cerrado:** el flujo acaba en handoff (`call_accepted`), nunca en venta por WhatsApp.
4. **Parada respetada:** regla 7, incluido el vosotros ("no me escribáis"), y el turno posterior no deja registro.
5. **Cobertura de miedos (28-10):** "no sé si sirvo", "no tengo base técnica" o "soy mayor para estudiar" se responden con el dato aprobado (se empieza de cero, hay tutor personal) y **no** se registran como duda. Un miedo no es una pregunta sin respuesta.

## Decisiones a cerrar con Nicolás

(A) **Contenido** (el contenido aprobado mantiene sus marcadores abiertos):
  1. **Presentación de MUSK** (`companyPresentation`), mensaje inicial (`initialMessage`) y la pregunta de cualificación `goal` del perfil único. La apertura y el `goal` se reescribieron el 28-10 con permiso explícito para retirarse y una sola pregunta.
  2. El resto del copy unificado (FAQ y los 35 pasajes de la base de conocimiento) sigue pendiente de firma de MUSK (reglas 4 y 11).
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
npm test             # 372 tests, sin red
npm run eval        # 46 casos de FAQ + 33 de KB + 23 de fundamentación
npm run sim -- --smoke   # un turno guiado, exit 0
npm run build:ui    # empaqueta el simulador de navegador
npm run ui          # sirve el simulador en http://localhost:4173
```

El **bucle de evaluación** (`npm run eval`) mide el enrutado de respuestas aprobadas con un dataset de 46 casos (pregunta del lead → respuesta esperada). No añade embeddings ni LLM: es una medición, no un recuperador. Hoy marca recall 1.00 y precisión 1.00, con 0 violaciones del guard. La comparación léxica de Fase 2 sigue siendo un benchmark sintético, bloqueado para producción; el modo de runtime permanece en `baseline`.

Para reproducir el guion completo de forma no interactiva se usa un driver temporal `.mts` que importa `MuskAgent` (mismo código del agente, sin la limitación del REPL). Ese driver está en `.gitignore` (`tmp-*.mts`) y no forma parte del entregable.
