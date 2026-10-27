# Lo que necesita aprobación de Nicolás para el MVP MUSK

Estado a 27 de octubre de 2026. Ya no quedan huecos `TODO(decisión)` en el
contenido: el perfil único de `src/content.ts` está escrito y lo usan el
simulador, la interfaz y el bucle de evaluación. Lo que falta es la **firma**.

## 1) Firmar el copy unificado (imprescindible)

Todo el texto de cara al lead vive en `src/content.ts` (`APPROVED_CONTENT`) y
está marcado como **copy unificado pendiente de firma de MUSK** (reglas 4 y 11).
Hasta que Nicolás lo firme, el agente no debe atender leads reales.

| Bloque | Qué pedirle |
|---|---|
| Mensaje inicial | Texto literal del primer WhatsApp que retoma el contacto. Corto, en español de España, sin vender. |
| Presentación de Escuela Musk | Cómo quiere que se presente la escuela. |
| Pregunta de cualificación `goal` | La única pregunta de conversación: qué busca el lead, para conducirlo a la llamada. |
| FAQ curada | Las respuestas escritas a mano para las preguntas frecuentes (precio, temario, financiación, modalidad, orientación, etc.). |
| Base de conocimiento (35 pasajes) | Los 35 pasajes de `src/kb.ts`, que ahora viajan en el perfil único. |

El agente solo puede emitir lo que está escrito ahí y cada respuesta pasa por el
guardián de salida (`guardReply`): sin importes, sin condiciones de pago, sin
promesas de empleo ni garantías.

## 2) Un punto concreto que conviene decidir

| Pasaje | Situación | Qué decidir |
|---|---|---|
| `kb-python-contenido` | Enumera tecnologías: Django, Flask, SQL, MongoDB, pandas, NumPy y modelos de lenguaje. | ¿Es contenido general permitido (la regla 2 permite explicar habilidades y salidas) o se considera temario detallado? Si es lo segundo, se sustituye por una descripción genérica sin listado. |

`kb-practicas` ya está corregido: habla de un convenio de colaboración y del
acompañamiento en la búsqueda, sin garantizar prácticas ni empresa.

## 3) Decisiones operativas (checklist de canal real)

Fuera del texto, quedan por confirmar en `docs/checklist-canal-real.md`:

| Punto | Qué se necesita |
|---|---|
| Cadencia de seguimiento | Cuántos intentos y con qué intervalo se vuelve a contactar si no responde. |
| Regla de parada | Ratificar que «para ya» / «no me escribas más» detiene el seguimiento y lo registra (ya está implementado). |
| Cobertura de Laura | Confirmar que Laura sigue siendo la destinataria de los avisos de handoff para esta muestra. |
| Base legal / privacidad | Aprobar el uso del lote para esta prueba controlada, o indicar qué añadir al mensaje. |
| Canal de WhatsApp | Confirmar si se activa el canal real o se sigue en simulación. |
| Paso a lote real | Cuándo se considera cerrado el checklist como para tocar leads reales. |

## Petición concreta

- **Mínimo para poder atender un lead real:** la firma del copy unificado (§1).
- **Para cerrar el punto técnico pendiente:** el criterio sobre `kb-python-contenido` (§2).
- **Para el lote real:** las decisiones operativas de §3 y el checklist de canal.
