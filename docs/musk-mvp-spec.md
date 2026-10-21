# MUSK — Validación funcional del primer MVP (especificación)

Documento de referencia detallado. Resumen operativo y reglas duras en `AGENTS.md`.
Fuente: documento "Validación funcional" de Script9 actualizado tras la reunión del 28/09/2026. Referencias horarias sin fecha = reunión del 18/09/2026.
Fuente original (copia de referencia): `docs/MUSK_Validacion_Funcional_MVP_Script9_28092026.pdf`. Los diagramas UML (Figuras 1-3) están solo en el PDF, no en este markdown.

## 1. Contexto y problema

- MUSK capta leads principalmente con campañas en Meta (Google Ads es caro y no es el canal principal). Nicolas desarrolla además un canal de marca personal (iniciativa en evolución, flujo distinto al general).
- Problema: cada vez más leads no atienden el teléfono o se enfrían antes de que el equipo pueda explicar la propuesta. Es un problema de **contacto y confianza**, no solo de conversión.
- Valores a preservar: cercanía, transparencia, ausencia de promesas que MUSK no pueda garantizar (sin promesas de empleo), acompañamiento, alumnos con voluntad real de completar el proceso, capacidad del equipo para mantener calidad.
- Un crecimiento que incorpore alumnos poco adecuados o degrade la atención NO resuelve el problema de negocio.

### Cifras (contexto del 18/09, NO objetivos)

| Dato | Valor | Nota |
|---|---|---|
| Tiempo hasta primer intento de contacto | ~1 h (fines de semana, hasta el lunes) | |
| Intentos antes de dar un lead por perdido | 6 (18/09) | No se confirma como máximo fijo el 28/09 |
| Conversión lead -> matrícula | ~3 % | Sin periodo, fuente ni denominador definidos |
| Coste de conseguir un alumno | >300 € | Estimación, depende del canal |
| Volumen manejable | ~12-15 alumnos nuevos/mes | Referencia de capacidad |
| Volumen que degradó la atención | ~35 alumnos/mes | |

## 2. Proceso actual (As-Is)

1. Persona ve campaña -> deja datos -> lead entra al proceso comercial.
2. El equipo comercial intenta llamar al entrar el lead (domingo -> lunes).
3. Sin respuesta: se repiten llamadas en distintos horarios; después WhatsApp para presentar MUSK; sin interacción, lead perdido.
4. Atención con comerciales internos + una empresa externa que prepara su propia solución de llamadas automatizadas.
5. CRM actual: **Clientify**. Estados comerciales existentes: nuevo (sin entrevista), pendiente (entrevista/respuesta pendiente), beca (permite nueva acción), perdido (con razón: ghosting, ilocalizable, precio, matrícula en otra escuela) y otros del ciclo del alumno.
6. En el MVP se mantiene este proceso para leads nuevos; el primer contacto sigue a cargo del equipo comercial.

Fricciones: lead no atiende; saturación comercial previa y desconfianza; pérdida del impulso inicial; difícil transmitir diferenciación sin conversar; la venta masiva choca con el servicio deseado.

## 3. Solución propuesta (To-Be)

### 3.1 Entrada del lead
Leads antiguos de las bolsas **ilocalizables** y **no compradores**. Las cinco formaciones pueden aparecer en una presentación general; no hace falta preparar ahora un catálogo detallado. Para no compradores se menciona la posibilidad de una oferta, pero no hay ninguna aprobada y no autoriza a dar precios o descuentos.

### 3.2 Automatización (propuesta)
Iniciar contacto por WhatsApp · registrar entrega y respuesta · seguimientos aprobados si no hay respuesta · mantener estado del lead · detectar cuándo parar · transferir a persona bajo condiciones · registrar resultado. La cadencia está pendiente. No trasladar a WhatsApp afirmaciones no verificadas sobre intervalos de llamadas de la herramienta externa.

### 3.3 Capacidades de la IA
Comprender la pregunta del lead · responder con información aprobada · identificar dudas/objeciones · usar contenido breve aprobado (guías/multimedia opcionales) · mantener una conversación breve que entienda qué busca el lead y lo conduzca directamente a la entrevista o llamada · reconocer cuándo debe intervenir una persona · generar resumen de la conversación para el equipo comercial. Las preguntas son prompts de conversación, no un examen ni un filtro.

**Límites:** no precios, no temario detallado; solo información aprobada; conducir a la llamada; no inventar condiciones, promociones, garantías ni promesas de empleo; si falta respuesta, registrar la duda y proponer contacto humano.

### 3.4 Intervención humana
- Finalidad: conseguir una llamada comercial; el cierre es humano. Cualificación breve, no examen ni admisión automática.
- Disparadores claros: el lead pide hablar con una persona; el lead acepta/acuerda una llamada. Otros escalados y etiquetas de urgencia: por concretar.
- Pedir precio -> respuesta aprobada + invitación a conversar; no equivale a superar criterios de admisión.
- Conversaciones visibles inicialmente para administración; pasan al comercial al cumplirse un disparador. Nicolás confirmó que Laura recibe el aviso y decide a quién asignarlo. En este repositorio el aviso es simulado: no se envía un WhatsApp real ni se integra el CRM. La cobertura de Laura sigue pendiente.

### 3.5 CRM e integraciones
Nicolás confirmó a Laura como destinataria del aviso; ella decide a quién asignarlo. En este repositorio solo se simula esa notificación con contacto y bolsa de origen: no se envía un WhatsApp real ni se integra el CRM. Etiquetas del asistente ≠ estados del CRM; correspondencia por API = evolución posterior. El CRM propio de MUSK es dependencia futura: no diseñar alrededor de él.

### 3.6 Contenidos mínimos de MUSK
Presentación general de las cinco formaciones (habilidades/salidas, sin temario detallado) · presentación de MUSK y metodología · modalidad, clases y funcionamiento · acompañamiento y tutorías autorizadas · preguntas breves para conducir a la llamada · respuesta aprobada sobre precio (sin importes) · respuesta de financiación que puede indicar opciones y dos años flexibles para completar la formación, sin precios, importes, intereses, cuotas ni otras condiciones de pago · FAQs · objeciones frecuentes · materiales adicionales solo si aportan valor · guía/enlaces autorizados como fuente · condiciones de intervención humana. Nicolás dispone de guías y ofrece la web como fuente. No hace falta dossier nuevo ni catálogo detallado.

## 4. Alcance del primer MVP

**Hipótesis:** una conversación por WhatsApp recupera el interés de leads antiguos de una formación y consigue llamadas humanas útiles.

**Flujo mínimo:** lote seleccionado y separado de otras campañas -> contacto WhatsApp sobre las formaciones presentadas a nivel general -> dudas y preguntas breves -> propuesta de llamada -> aviso simulado con identificación -> registro del resultado. Si no responde o pide parar, se aplica la regla de seguimiento/parada definida para la prueba.

**Comportamiento mínimo:** explicar MUSK y las formaciones a nivel general con contenido aprobado y reconducir a la llamada · no precios ni temario; ante financiación, indicar opciones y el plazo flexible de dos años confirmado por Nicolás, sin condiciones de pago · conversación breve orientada a la entrevista o llamada, sin examen/puntuación/exclusión automática · detectar petición de humano o aceptación de llamada y generar aviso simulado con destinataria, contacto, bolsa y contexto · supervisión de administración y habilitar intervención comercial · registrar conversación, resultado y peticiones de no continuar.

**No se exige:** integración completa con Clientify, agenda automática, agente de voz, dashboard avanzado, catálogo completo, automatización de matrículas. Calendly y la creación/asignación automática de oportunidades son opciones discutidas, no decisiones cerradas.

**Preparación y prueba:** 1) preparar contenido de una formación y validar el flujo con simulaciones con Nicolas; 2) configurar el canal y habilitar una muestra controlada. Las simulaciones deben comprobar precio, temario, financiación, desconocimiento de respuesta, petición de humano y petición de parada (criterios propuestos por Script9, no umbrales pactados).

## 5. Evolución posterior (no condiciona el arranque)

- Leads nuevos fuera de horario y acceso directo desde la web (coordinar llamadas y chat para evitar contactos simultáneos).
- Automatizar oportunidades, asignación, estados y resúmenes en el CRM; mecanismo de agenda.
- Dashboard avanzado, cuestionario ampliado y puntuación de encaje (ningún criterio de admisión automático aprobado).
- Más formaciones, guías y multimedia (se conservan límites de precio y temario salvo decisión expresa de MUSK).
- Agente de voz y coordinación con la empresa externa de llamadas.

## 6. Métricas de validación (propuestas de Script9, no acordadas con MUSK)

- Resultado principal: llamadas humanas útiles desde las dos bolsas. Registrar por separado: respuesta al WhatsApp, solicitud/aceptación de llamada, llamada realizada.
- Registro mínimo: bolsa de origen y formación; leads incluidos; mensajes enviados/entregados; leads que responden, dudas principales y resultado; solicitudes/aceptaciones de llamada, avisos emitidos y llamadas realizadas (según devolución del comercial); valoración del comercial sobre utilidad, respuestas incorrectas, intervenciones manuales y peticiones de no continuar.
- Cálculo: respuesta sobre leads contactados; llamadas realizadas sobre leads que aceptaron/solicitaron llamada. Siempre denominador y periodo. Comparar ilocalizables y no compradores por separado.
- No se acordaron umbrales de éxito. Acordar muestra y momento de revisión antes de activar contactos reales. Una prueba con leads antiguos no demuestra impacto sobre leads nuevos.

## 7. Dependencias, restricciones y riesgos

- **Contenido:** elegir formación y validar material; retirar temario de dossiers; excluir importes y promociones no autorizadas.
- **Capacidad humana:** Laura recibe el aviso y decide la asignación; su cobertura y el mecanismo real de aviso siguen pendientes. Riesgo: prometer una llamada inmediata sin cobertura.
- **CRM y campañas:** no se definieron campos, permisos ni integración técnica. Base de prueba separada de la empresa externa y otras gestiones activas.
- **Canal y contactos reales:** configuración de WhatsApp sin concretar; comprobar disponibilidad, condiciones aplicables al contacto, mensaje inicial, seguimiento y parada. Las reglas de intervalos para llamadas no valen para WhatsApp. Privacidad y transparencia (relevantes desde el 18/09) deben confirmarse antes del envío real, incluido acceso y tratamiento de conversaciones; no impiden simulaciones sin datos personales reales.
- **Calidad:** aceptación de la IA y utilidad comercial son hipótesis. Llevar a la llamada no autoriza presión artificial. Resultados de una formación/base no se generalizan al embudo.

## 8. Información mínima para arrancar

### Necesario de Nicolas para la primera versión
1. Compartir guía, dossier o enlaces; información básica de MUSK y metodología. La presentación general puede cubrir las cinco formaciones; Script9 prepara una versión sin precios ni temario detallado para su revisión.
2. Nicolás confirmó que la conversación debe conducir directamente a la entrevista o llamada, con preguntas breves que orienten y no filtren. Edad, estudios o documentación se mencionaron pero NO son cuestionario obligatorio.
3. Dudas y objeciones frecuentes con su respuesta habitual; validar la frase de precio/temario y la respuesta genérica de financiación.
4. Nicolás confirmó a Laura como destinataria del aviso; ella decide la asignación. Confirmar cobertura y datos mínimos para localizar al lead. No hace falta elegir agenda ni asignación automática del CRM.

### Solo antes de probar con leads reales
1. Lote antiguo de la formación elegida, separando ilocalizables y no compradores, con teléfono, curso y motivo de pérdida; confirmar que puede usarse y que no se solapa con la empresa externa u otras campañas.
2. Canal de WhatsApp disponible; cerrar con MUSK texto inicial, seguimiento y parada, y condiciones de uso de contactos y acceso a conversaciones.
3. Confirmar receptor del aviso, cobertura y datos mínimos para localizarlo en el CRM; probar aviso y derivación antes de enviar el lote.

Oferta a no compradores: solo con mensaje y límites aprobados por Nicolas; si no, la primera prueba se centra en recuperar interés sin ofertas ni importes.

### Se aplaza (no bloquea)
Tasa de contacto histórica, denominador del 3 %, volumen mensual, rentabilidad, objetivos numéricos, integración API del CRM, dashboard avanzado, agenda automática, todos los cursos, voz, nuevos leads fuera de horario / web.

### Próximo paso
Nicolas aporta curso, contenidos y reglas breves -> Script9 prepara flujo y simulaciones -> Nicolas valida respuestas y derivación -> piloto con base antigua tras completar la sección "Solo antes de probar con leads reales". No hay fecha de entrega acordada (la "semana siguiente" es orientativa).
