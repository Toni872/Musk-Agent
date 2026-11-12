# Glosario de dominio

Vocabulario canónico del piloto MUSK. El objetivo es que el mismo concepto se
llame igual en la especificación, en el código, en la interfaz y en las
conversaciones con el cliente. Cuando exista conflicto, manda este documento.

Dos reglas de uso:

- Un término con «sinónimos prohibidos» no debe aparecer con esas formas en
  código nuevo, textos de interfaz ni documentación.
- Los nombres de la columna «Nombre en código» son los que existen hoy en el
  repositorio; no se renombran sin un cambio justificado.

## Negocio y lote

| Término | Definición | Nombre en código | Sinónimos prohibidos |
|---|---|---|---|
| Lead | Contacto de un lote antiguo de MUSK con el que se intenta reabrir conversación | `lead`, `lead_id` | contacto, cliente, usuario |
| Bolsa | Origen del lead dentro del lote antiguo. Solo existen dos en el MVP | `LeadBucket` | lista, segmento, campaña |
| Ilocalizable | Lead del que no se tenía respuesta previa | `ilocalizable` (etiqueta: «ilocalizables») | perdido, desaparecido |
| No comprador | Lead que mantuvo contacto pero no compró | `no_comprador` (etiqueta: «no compradores») | no cliente, interesado |
| Motivo de pérdida | Razón por la que el lead no compró, cuando se conoce | `loss_reason` | causa, excusa |
| Muestra | Subconjunto del lote que se usa en el piloto | — | lote, grupo |
| Simulación | Conversación con datos ficticios, sin WhatsApp ni CRM | — | demo, prueba, test |
| Piloto | Muestra controlada con leads reales, tras cerrar la checklist de canal | — | producción, lanzamiento |

## Motor conversacional

| Término | Definición | Nombre en código | Sinónimos prohibidos |
|---|---|---|---|
| Conversación | Hilo completo de un lead. Es la fila de `conversation` y se identifica por `session_id` | `Conversation`, `session_id` | chat, sesión de usuario |
| Turno | Un mensaje del lead y la respuesta del agente, con su registro | `TurnOut` | mensaje, intercambio |
| Regla dura | Cada una de las once reglas de comportamiento aprobadas por MUSK | reglas 1 a 11 | política, norma interna |
| Regla 5 | Regla que obliga a registrar la duda y ofrecer contacto humano cuando no hay respuesta aprobada | `doubt` | escalado genérico |
| Tema prohibido | Asunto que el agente nunca responde con contenido (precio, condiciones de pago, fechas, horas, ubicación, becas…) y que siempre deriva | `FORBIDDEN_TOPIC_PATTERNS` | tema sensible, restricción |
| Duda registrada | Pregunta del lead sin respuesta aprobada, anotada para el equipo humano | `registered_doubt`, `doubt` | incidencia, consulta |
| Derivación | Paso de la conversación a una persona de MUSK. Solo se dispara si el lead pide hablar con alguien o acepta una llamada | `handoff` | escalado, transferencia, traspaso |
| Motivo de derivación | Causa concreta de la derivación: petición de humano o llamada aceptada | `human_requested`, `call_accepted` | tipo de escalado |
| Parada | El lead pide no continuar. Se detiene el seguimiento y se registra | `stop`, `is_stopped` | baja, baja voluntaria, opt-out |
| Aviso a Laura | Notificación simulada al comercial con contacto, bolsa y resumen | `HandoffOut`, `recipient` | alerta, notificación push |
| Etiqueta conversacional | Marca que describe el estado del diálogo (interés, duda, derivación, parada) | `intent`, `action` | estado del CRM |
| Estado del CRM | Estado comercial en Clientify u otro CRM (nuevo, pendiente, beca, perdido). **No se mapea en esta fase** | — | etiqueta, etapa |

## Conocimiento y respuestas

| Término | Definición | Nombre en código | Sinónimos prohibidos |
|---|---|---|---|
| Pasaje de conocimiento | Fragmento aprobado y recuperable de la base de conocimiento (35 en total) | pasaje, `app/kb.py` | artículo, documento, FAQ |
| Base de conocimiento | Conjunto de pasajes con procedencia y términos de recuperación | KB | corpus, dataset |
| Recuperación | Selección determinista de pasajes por BM25 y cobertura de términos, sin embeddings | `retrieve`, `retrieve_top_k` | búsqueda semántica |
| Umbral | Puntuación mínima para responder con un pasaje en modo determinista | `MIN_BM25_SCORE` (3.5), `MIN_TERM_COVERAGE` (0.5) | límite, corte |
| Modo determinista | Respuesta sin LLM: solo con un pasaje que supera ambos umbrales, o derivación | fallback determinista | modo seguro, modo offline |
| Grounding | Registro que deja constancia de que se respondió con el respaldo determinista porque el proveedor falló o devolvió vacío | `grounding` | traza, log interno |
| Guard de salida | Filtro que descarta respuestas con importes, promesas de empleo, promociones o temario no aprobado | `guard_reply` | validador, filtro de seguridad |
| Respuesta aprobada | Texto que MUSK ha firmado y que el agente puede enviar | copy aprobado | mensaje oficial |
| Duda estándar | Plantilla fija que se envía cuando no hay respuesta aprobada. No se reformula | `build_reply("doubt")` | fallback genérico |

## Registro y métricas

| Término | Definición | Nombre en código | Sinónimos prohibidos |
|---|---|---|---|
| Registro | Anotación interna de lo ocurrido en un turno, con tipo y detalle | `RecordOut`, `RecordKind` | evento, log |
| Tipos de registro | `reply`, `kb`, `handoff`, `stop`, `doubt`, `grounding` | `RecordKind` | categorías |
| Respuesta al WhatsApp | Primer resultado medible: el lead contestó al mensaje inicial | — | tasa de respuesta, engagement |
| Solicitud de llamada | El lead pide o acepta una llamada | `call_accepted` | lead caliente |
| Llamada realizada | La llamada ocurrió según el comercial. Se registra aparte de la solicitud | — | conversión |
| Denominador y periodo | Cada métrica se informa sobre el total del lote y el rango de fechas. Sin ellos, el porcentaje no significa nada | — | tasa suelta |
| Informe PDF | Documento descargable con la conversación, los registros y la derivación | `/sessions/{id}/pdf`, `/report.pdf` | export, acta |

## Proceso de proyecto

| Término | Definición | Nombre en código | Sinónimos prohibidos |
|---|---|---|---|
| Decisión abierta | Punto que MUSK no ha decidido. Se marca `TODO(decisión)` y **nunca se envía al lead** | `pending_decisions` | pendiente, por definir |
| Copy unificado | Perfil único de contenido pendiente de firma. No es contenido aprobado | `APPROVED_CONTENT` | contenido oficial |
| Fuera de alcance | Funcionalidad explícitamente excluida del MVP; requiere decisión expresa para entrar | — | fase 2, backlog |
