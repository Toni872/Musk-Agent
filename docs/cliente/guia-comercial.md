# Guía para el comercial - Agente MUSK

## Objetivo
Usar el simulador/flujo del agente para filtrar leads antiguos, derivarlos al comercial cuando corresponda y registrar el resultado de forma clara.

## Cuándo actuar
- **Handoff generado**: cuando el agente avise con "AVISO COMERCIAL", actuar lo antes posible.
- **Lead pide hablar con persona**: el agente ya lo habrá derivado.
- **Lead acepta/procede a llamada**: el agente ya lo habrá derivado.

## Qué revisar en el aviso
En el aviso copiado o en el PDF encontrarás:

| Campo | ¿Qué mirar? |
|---|---|
| **Contacto** | Teléfono/canal proporcionado por el lead. Verificar antes de llamar. |
| **Bolsa / origen** | `ilocalizables` o `no compradores`. Tenerlo en cuenta para el seguimiento. |
| **Formación detectada** | Orientación del lead (si se ha podido detectar). |
| **Respuestas de cualificación** | Qué ha respondido el lead a las preguntas del agente. |
| **Dudas registradas** | Preguntas que el agente no ha podido responder con contenido aprobado. Hay que resolverlas en la llamada. |
| **Resumen para el comercial** | Síntesis rápida para entrar en conversación sin empezar de cero. |
| **Mensajes post-handoff** | Si el lead ha seguido escribiendo tras el aviso, revisar siempre. |

## Cómo usar el simulador
1. Abrir http://127.0.0.1:4174 o la URL del piloto.
2. Conversar con el lead tal como llegue por WhatsApp (copiar mensajes).
3. Cuando haya handoff, pulsar "Copiar aviso" y pegarlo por el canal que corresponda.
4. También puedes "Descargar informe" (PDF) o "Descargar JSON" para archivar la sesión.

## Reglas a tener en cuenta
- **Nunca precios ni importes.** El agente ya los bloquea, pero conviene mantener el tono.
- **No dar temario detallado.** Explicar generalidades, habilidades y salidas.
- **Financiación.** Solo se puede decir que existen opciones de financiación y que se puede completar en dos años con flexibilidad.
- **Respetar rechazo.** Si el lead pide parar, se detiene el seguimiento.
- **Sin presión.** Ir directo, claro y humano.

## Registro del resultado
Anotar siempre:
- **Respuesta al WhatsApp / contacto:** Sí/No
- **Solicitud/Aceptación de llamada:** Sí/No
- **Llamada realizada:** Sí/No
- **Resultado:** Interesado / No interesado / Sin respuesta / Derivado / Otro
- **Observaciones:** Dudas resueltas, formación de interés, siguiente paso

## Notas
- El simulador es solo para trazar la conversación. El envío real por WhatsApp se gestiona fuera.
- Hay un único perfil de contenido, sin selector DEMO/REAL. Su copy unificado está pendiente de firma de MUSK; no uses el simulador con leads reales hasta completar las validaciones de `docs/operacion/checklist-canal-real.md`.
