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
| Trazas de tokens, latencia y coste | Parcial |
| Fiabilidad (timeouts, reintentos, fallback) | Parcial |
| Herramientas con efectos | No aplica todavía |
| Permisos, lotes y datos personales | Pendiente |
| Aprobaciones de MUSK | Pendiente |
| Protección del bundle público | Disparador armado (§9) |

## 1. Entrada: lo que llega del lead

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Tamaño y frecuencia por lead | Pendiente | No hay tope de longitud ni límite de cadencia. La cadencia de seguimiento sigue abierta con Nicolás. |
| Contenido no confiable | Pendiente | El mensaje del lead se trata siempre como texto y nunca como instrucción (el motor solo clasifica y responde con textos aprobados), pero no hay una defensa explícita documentada contra un mensaje que intente reescribir el guion. |
| Material no aprobado fuera del contexto | Hecho | El dossier con temario no entra en el contexto del agente (regla 10) y `src/content.ts` no tiene campos de precio ni de temario: hay tests estructurales que lo vigilan. |
| Datos personales | Pendiente | El aviso al comercial incluye el contacto del lead. Con leads reales eso es dato personal: hace falta base legal, control de acceso y plazo de conservación (decisión de MUSK; ver `AGENTS.md`, "Decisiones abiertas"). |
| Otros idiomas | Sin cubrir | El clasificador es español de España y no hay casos de prueba en otro idioma. Antes del lote real conviene añadir 3-4 casos al banco de evaluación. |

## 2. Salida: lo que dice el agente

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Guard de salida | Hecho | `guardReply` bloquea 8 familias de patrones prohibidos; si bloquea, se envía el texto aprobado. |
| Reglas duras como datos | Hecho | Las 11 reglas viven en `src/rules.ts` y hay tests obligatorios por cada una. |
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
| Comprobación en cada push | Hecho | `.github/workflows/ci.yml`: instalación, tipos, 140 tests, informe del bucle de evaluación, disparador de protección del bundle (§9) y empaquetado de la interfaz. |
| Traza de tokens, latencia y coste | Parcial | Hoy el modo por defecto es determinista (0 tokens). Si se enciende la reformulación con LLM, cada turno debe registrar tokens, latencia y coste. |
| Alertas de coste y de errores | Pendiente | Sin proveedor activo no hay coste que vigilar; hace falta antes de encender el LLM. |
| Presupuesto por conversación | Pendiente | El motor no itera (un turno por mensaje), pero conviene fijar un tope de llamadas al proveedor por conversación. |

## 5. Fiabilidad

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Degradación elegante | Parcial | Sin proveedor el agente funciona igual, y si el guard bloquea cae al texto aprobado. Falta definir qué se hace si el proveedor LLM falla. |
| Timeouts, reintentos y backoff | Pendiente | No implementados. |
| Caché | No aplica | Las respuestas deterministas ya son reproducibles; la caché tendría sentido para embeddings y para el LLM. |

## 6. Permisos y lotes

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Aislamiento por lote o campaña | Pendiente | Hoy es un lote único en memoria. Si entran varios lotes, el aislamiento debe aplicarse en la recuperación, no después de generar. |
| Lote aislado de otras campañas y de la empresa externa | Pendiente | Es requisito de operación de `AGENTS.md`; hay que confirmarlo con Nicolás antes del envío. |

## 7. Evaluación

| Punto | Estado | Cómo se comprueba o qué falta |
|---|---|---|
| Conjunto propio versionado | Hecho | 79 casos etiquetados (46 de la FAQ + 33 de la base de conocimiento) en `src/eval.dataset.ts`, con las expectativas derivadas de las reglas duras. |
| Métricas de recuperación | Hecho | recall 1.00, precisión 1.00, aciertos de intención 1.00, 0 violaciones del guard, 0 falsos positivos. |
| Fidelidad de la respuesta generada | No aplica hoy | Sin generación libre no hay nada que medir. Si se enciende el LLM, hay que medir que no se salga del texto aprobado. |
| Evaluación en cada cambio | Hecho | Se ejecuta en cada push (ver `.github/workflows/ci.yml`). |

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

## 9. Protección del bundle público

El simulador es un sitio estático: **todo lo que necesita en el navegador viaja en el
bundle**. Hoy es aceptable porque no contiene precios, importes ni datos de leads
reales, el enlace se comparte a mano y el copy unificado sigue pendiente de firma.
Antes de cruzar esa frontera, proteger el despliegue es lo único que oculta de verdad
el artefacto, porque una comprobación en JavaScript se salta leyendo el `app.js`.

**Qué vigila el disparador.** `npm run pilot-gate` —y el paso equivalente de CI— falla
cuando hay un `.env` versionado (salvo `.env.example`): configuración real dentro del
repositorio. Es la única señal que vigila el gate.

**Cómo te enteras.** Tres avisos, no uno:

- **En cada push**, el paso «Pilot gate (bundle exposure)» pone CI en rojo y GitHub
  manda el aviso de ejecución fallida a quien hizo el push.
- **Antes de desplegar**, `npm run deploy` ejecuta el gate y se detiene si dispara.
  `vercel deploy --prod` a mano se salta ese aviso; CI lo coge en el push siguiente.
- **En local**, `npm run pilot-gate` imprime el motivo y el estado actual.

**Qué hacer cuando dispara.** Antes de la siguiente publicación: activar protección de
despliegue en Vercel (contraseña o SSO), comprobar que el alias público ya no sirve el
bundle sin credenciales y anotarlo aquí con fecha y con quién lo decidió. Solo entonces
poner `PILOT_GATE_ACK=1` en el paso del gate de `.github/workflows/ci.yml`: esa línea es
el registro de que la decisión se tomó, y hasta que exista el gate falla a propósito.

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
