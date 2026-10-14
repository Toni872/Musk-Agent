# MUSK — Guion de demo (validación con Nicolás)

Guion verificado contra el agente real (`MuskAgent`, `APPROVED_CONTENT` curado, `provider=null`). Todo el flujo es **determinista y offline** (sin LLM, sin red, sin API key). Última verificación: 2026-10-14, 24/24 tests.

> **Apertura y cualificación (14-10)**: el agente ya consume `initialMessage` (apertura) y `qualificationQuestions` (una pregunta por turno). En el contenido del piloto ambos siguen a `TODO(decisión)`, así que **no se envían**: al arrancar se informa de lo que está abierto con Nicolás. El flujo **completo** (apertura + 2 preguntas) se ve con el perfil DEMO: `npm run sim:demo`.

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
| 6 | `¿cuánto dura el curso?` | Buena pregunta. No tengo una respuesta aprobada sobre eso, así que lo dejo anotado como duda... ¿Te viene bien que te contacten para aclararlo? | **Regla 5 (duda) — PIVOTE** |
| 7 | `¿necesito experiencia previa?` | No necesitas conocimientos previos: la metodología es progresiva y práctica, pensada para empezar desde la base. | FAQ requisitos |
| 8 | `me parece muy caro` | No puedo compartir el precio ni los importes por aquí... | Objeción de dinero (sin la palabra "precio") |
| 9 | `bueno, me va bien una llamada` | Perfecto, dejo anotado que te va bien la llamada. El equipo se pone en contacto contigo para acordar el detalle. | **Handoff `call_accepted` — objetivo** |

Estado final observado de la conversación 1: `stopped=false records=11`.

## Conversación 2 — el lead pide parar (regla 7)

| # | Escribe el lead | El agente responde (observado) |
|---|---|---|
| 10 | `no me escribáis más` | Entendido, respeto tu decisión: no vuelvo a escribirte. Queda registrado como "no continuar". |
| 11 | `gracias` | *(sin mensaje: conversación detenida — turno suprimido)* |

Estado final observado de la conversación 2: `stopped=true records=2`.

## Frase de apertura recomendada

> "No te traigo un bot terminado — te traigo el motor y las reglas funcionando, para que las validemos juntas antes de conectar nada real."

## Puntos a destacar en sesión

1. **Pivote natural (turno 6):** la pregunta de duración dispara la regla 5 y abre la lista de decisiones de contenido.
2. **Sin importes en ningún momento:** precio, financiación y objeción responden sin cifras; todo reconduce a la llamada.
3. **Objetivo cerrado:** el flujo acaba en handoff (`call_accepted`), nunca en venta por WhatsApp.
4. **Parada respetada:** regla 7, incluido el vosotros ("no me escribáis").

## Decisiones a cerrar con Nicolás

(A) **Contenido** (piloto FullStack ya curado; solo quedan):
 1. Duración del curso (hoy por regla 5: duda).
 2. Texto del mensaje inicial (`initialMessage`).
 3. Preguntas de cualificación finales (propuestas: experiencia de partida, tiempo de interés).
 4. Redacción final de "prácticas garantizadas" si se confirma.
 5. Plantilla de rechazo amable (IMPLEMENTADA el 12-10): un "no me interesa" seco → `decline` con copy dedicado ("Entendido, lo respeto…"), registra duda y NO para la conversación. Revisar wording con Nicolás.

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
npm test            # 24 tests, sin red
npm run sim -- --smoke   # un turno guiado, exit 0
```

Para reproducir el guion completo de forma no interactiva se usa un driver temporal `.mts` que importa `MuskAgent` (mismo código del agente, sin la limitación del REPL).