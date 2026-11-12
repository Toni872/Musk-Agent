# Checklist antes del canal real

Estado: **borrador técnico de Script9** — describe el estado de este repositorio a
día de hoy, no decisiones acordadas. Lo que depende de MUSK se marca como tal.

Fecha: 19 de octubre de 2026.

**Para qué sirve.** Es la lista de cierre **antes de tocar un lead real**. Hoy el
arnés es una simulación (sin canal, sin leads, sin CRM): nada de esta lista hace
falta para la demo, pero todo esto hay que cerrarlo antes del primer envío real.

**De dónde sale.** De una guía práctica de arquitectura de agentes de IA
(orquestación, RAG, guardrails, capa de decisión; octubre 2026), contrastada con las
reglas duras de `AGENTS.md` y con lo que este repositorio ya implementa.

Relacionado: `AGENTS.md`, `docs/producto/musk-mvp-spec.md`, `docs/cliente/pedido-nicolas.md`,
`docs/operacion/decisiones-operativas-nicolas.md`.

## Resumen

| Bloque | Estado hoy |
|---|---|
| Salida (guardrails) | Listo |
| Evaluación continua | Listo (en cada push) |
| Entrada (guardrails) | Pendiente |
| Trazas de tokens, latencia y coste | Listo |
| Fiabilidad (timeouts, reintentos, fallback) | Listo |
| Herramientas con efectos | No aplica todavía |
| Permisos, lotes y datos personales | Pendiente |
| Aprobaciones de MUSK | Pendiente |
| Protección del bundle público | Listo (§9) |

## 1. Entrada: lo que llega del lead

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Tamaño y frecuencia por lead | Pendiente | No hay tope de longitud ni límite de cadencia. La cadencia de seguimiento sigue abierta con Nicolás. |
| Contenido no confiable | Pendiente | El mensaje del lead se trata siempre como texto y nunca como instrucción (el motor solo clasifica y responde con textos aprobados), pero no hay una defensa explícita documentada contra un mensaje que intente reescribir el guion. |
| Material no aprobado fuera del contexto | Hecho | El dossier con temario no entra en el contexto del agente (regla 10) y `app/content.py` no tiene campos de precio ni de temario: hay tests estructurales que lo vigilan. |
| Datos personales | Pendiente | El aviso al comercial incluye el contacto del lead. Con leads reales eso es dato personal: hace falta base legal, control de acceso y plazo de conservación (decisión de MUSK; ver `AGENTS.md`, "Decisiones abiertas"). |
| Otros idiomas | Sin cubrir | El clasificador es español de España y no hay casos de prueba en otro idioma. Antes del lote real conviene añadir 3-4 casos al banco de evaluación. |

## 2. Salida: lo que dice el agente

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Guard de salida | Hecho | `guard_reply` bloquea 8 familias de patrones prohibidos; si bloquea, se envía el texto aprobado. |
| Reglas duras como datos | Hecho | Las 11 reglas viven en `app/rules.py` y hay tests obligatorios por cada una. |
| Sin importes ni condiciones | Hecho | Tests estructurales más el banco de evaluación: 0 falsos positivos sobre los temas prohibidos (C23-C31). |
| Escapado de la salida | Hecho | La interfaz escribe siempre con `textContent`, nunca `innerHTML`. |
| Validación de esquema hacia otros sistemas | No aplica hoy | No hay CRM ni cola conectados. Si se conecta Clientify, hay que validar el payload antes de enviarlo. |

## 3. Herramientas y acciones

Hoy el agente no tiene herramientas con efectos: no agenda, no escribe en ningún CRM
y no envía nada por su cuenta. **No aplica** todavía. Regla para cuando las haya:
mínimo privilegio, esquema de parámetros y confirmación humana en acciones
irreversibles o con coste.

## 4. Operación: trazas y límites

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Bitácora por turno | Hecho | Registros visibles en el simulador: intención, acción, derivación y dudas. |
| Comprobación en cada push | Hecho | `.github/workflows/python-ci.yml`: lint, tipos, 201 tests, informe del bucle de evaluación y disparador de protección del despliegue (§9). |
| Traza de tokens, latencia y coste | Hecho | Cada llamada al proveedor registra tokens, latencia e intentos en las métricas de sesión y en el log `llm_call`; el coste estimado aparece si se configuran los precios. Nunca se envía al lead. |
| Alertas de coste y de errores | Pendiente | Sin proveedor activo no hay coste que vigilar; hace falta antes de encender el LLM. |
| Presupuesto por conversación | Pendiente | El motor no itera (un turno por mensaje), pero conviene fijar un tope de llamadas al proveedor por conversación. |

## 5. Fiabilidad

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Degradación elegante | Hecho | Sin proveedor, o si falla/expira/devuelve vacío, el agente cae al modo determinista; si el guard bloquea, responde la duda (regla 5). |
| Timeouts, reintentos y backoff | Hecho | Timeout de 30 s y reintentos con backoff exponencial y jitter para timeout, error de conexión, 429 y 5xx; los 4xx no se reintentan y el fallo cae a determinista. |
| Caché | No aplica | Las respuestas deterministas ya son reproducibles; la caché tendría sentido para embeddings y para el LLM. |

## 6. Permisos y lotes

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Aislamiento por lote o campaña | Pendiente | Hoy es un lote único en memoria. Si entran varios lotes, el aislamiento debe aplicarse en la recuperación, no después de generar. |
| Lote aislado de otras campañas y de la empresa externa | Pendiente | Es requisito de operación de `AGENTS.md`; hay que confirmarlo con Nicolás antes del envío. |

## 7. Evaluación

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Conjunto propio versionado | Hecho | 33 casos de la base de conocimiento + 259 de desarrollo + 118 held-out (ablación léxica) en `app/eval_dataset.py`, con las expectativas derivadas de las reglas duras. |
| Métricas de recuperación | Hecho | Informe con recall, falsos positivos, pasaje equivocado e interceptación de temas protegidos; los suelos están fijados en `tests/test_eval.py` y se comprueban con `uv run python -m app.eval`. |
| Fidelidad de la respuesta generada | No aplica hoy | Sin generación libre no hay nada que medir. Si se enciende el LLM, hay que medir que no se salga del texto aprobado. |
| Evaluación en cada cambio | Hecho | Se ejecuta en cada push (ver `.github/workflows/python-ci.yml`). |

## 8. Aprobaciones de MUSK (no son técnicas)

1. Firma final de todo el **copy unificado pendiente de firma de MUSK**: mensaje
   inicial, presentación de MUSK, pregunta de cualificación `goal`, FAQ y los 35
   pasajes de la base de conocimiento, junto con el resto de textos del perfil único
   (`docs/cliente/pedido-nicolas.md`). Ya no quedan marcadores `TODO(decisión)`, pero la
   redacción escrita no equivale a una aprobación.
2. Decisiones de operación aún abiertas: cobertura de Laura, cadencia y reglas de
   parada, datos del lote y resultado de la llamada
   (`docs/operacion/decisiones-operativas-nicolas.md`).
3. Base legal, privacidad y transparencia del lote real; tamaño de muestra y fecha de
   lanzamiento.

## 9. Protección del despliegue público

El simulador es una app web (FastAPI) accesible por URL: lo que sirve el navegador
viene del servidor. Hoy es aceptable porque no contiene precios, importes ni datos
de leads reales, el enlace se comparte a mano y el copy unificado sigue pendiente
de firma. Antes de cruzar esa frontera, proteger el despliegue es lo único que
oculta de verdad el servicio, porque una comprobación en el cliente se salta
leyendo el `app.js`.

**Qué hay implementado.** `docker-compose.yml` publica solo Caddy (80/443), que
termina TLS con certificado automático para `MUSK_DOMAIN` y añade cabeceras de
seguridad; la app queda en la red interna y exige HTTP Basic en todas las rutas
salvo `/health` cuando `MUSK_BASIC_AUTH_USER` y `MUSK_BASIC_AUTH_PASSWORD` están
definidas. Sin esas dos variables la autenticación se desactiva, así que publicar
una URL sin ellas vuelve a dejar el simulador abierto.

**Qué vigila el disparador.** `uv run python -m app.pilot_gate` —y el paso
equivalente de CI— falla cuando hay un `.env` versionado (salvo `.env.example`):
configuración real dentro del repositorio. Es la única señal que vigila el gate.

**Cómo te enteras.** Tres avisos, no uno:

- **En cada push**, el paso «Pilot gate» de `.github/workflows/python-ci.yml` pone
  CI en rojo y GitHub manda el aviso de ejecución fallida a quien hizo el push.
- **Antes de publicar**, ejecuta `uv run python -m app.pilot_gate`: se detiene si
  dispara. No hay deploy automático: se construye y ejecuta la imagen Docker (ver
  `README.md`).
- **En local**, `uv run python -m app.pilot_gate` imprime el motivo y el estado
  actual.

**Qué hacer cuando dispara.** Antes de la siguiente publicación: poner el
despliegue detrás de TLS y autenticación (Caddy + HTTP Basic, ya incluidos en
`docker-compose.yml`), comprobar que la URL pública ya no sirve el simulador sin
credenciales y anotarlo aquí con fecha y con quién lo decidió. Solo entonces poner `PILOT_GATE_ACK=1` en
el paso del gate de `.github/workflows/python-ci.yml`: esa línea es el registro de
que la decisión se tomó, y hasta que exista el gate falla a propósito.

**Lo que el gate no puede ver.** Que hayan entrado datos de un lead real. Eso no se
detecta leyendo el repositorio: sigue siendo una condición manual, la 4 del criterio de
salida. Tampoco determina si MUSK ha firmado el copy unificado: esa aprobación se
registra manualmente en la sección 8 y en el criterio de salida.

**Riesgo aceptado hoy.** Sin disparadores: un perfil único con los 35 pasajes de la
base de conocimiento, sin selector de perfil y sin `.env` versionado. Se acepta que el
bundle exponga el nombre de la destinataria del aviso, las etiquetas de bolsa y el copy
unificado pendiente de firma de MUSK, mientras el enlace sea privado y no haya datos de
leads reales.

## Criterio de salida

Estamos listos para el primer envío real cuando se cumplan las seis condiciones:

1. MUSK ha firmado todo el copy unificado del perfil único: mensaje inicial,
   presentación, pregunta `goal`, FAQ, los 35 pasajes de la base de conocimiento y
   el resto de textos de cara al lead.
2. El aviso al comercial tiene receptor y cobertura confirmados.
3. La parada y la cadencia están acordadas.
4. La base legal del lote real está cubierta.
5. La comprobación automática está en verde con el conjunto de evaluación ampliado.
6. El canal, el mensaje inicial y el reenvío del aviso se han probado de punta a punta
   sin datos reales.
