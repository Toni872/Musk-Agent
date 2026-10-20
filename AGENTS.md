# MUSK Technologies — Primer MVP conversacional (WhatsApp + IA)

Proyecto de Script9 para MUSK Technologies (interlocutor: Nicolás Stella). Este
fichero es la fuente de verdad del alcance **en este repositorio**. El detalle
completo está en `docs/musk-mvp-spec.md`; léelo antes de tocar flujo, prompts del
agente, estados o métricas.

Fuente: reunión del 28/09/2026 (prevalece) + contexto de la reunión del 18/09/2026.

## Objetivo

Comprobar si WhatsApp reactiva leads antiguos de UNA formación y los convierte en
llamadas humanas útiles, respetando los límites de información y la cercanía de
MUSK. No se busca "vender más": se busca contacto, confianza y encaje del alumno. El
cierre de la venta es siempre humano.

## Alcance del MVP (dentro)

- Una sola formación (aún por elegir) y dos bolsas de leads antiguos:
  **ilocalizables** y **personas que no compraron**.
- Primer contacto por WhatsApp → dudas y preguntas breves → propuesta de llamada →
  aviso al comercial con identificación del contacto → registro del resultado.
- Pocas preguntas de cualificación (propuestas: experiencia de partida y tiempo de
  interés). Sin examen, sin puntuación, sin exclusión automática.
- Registro simple de conversaciones y resultados + vista de supervisión básica.
- Primero simulaciones sin datos reales con Nicolás; después muestra controlada con
  leads reales.

## Fuera de alcance (NO implementar sin decisión expresa)

Integración completa con Clientify (CRM actual), creación/asignación automática de
oportunidades, agenda automática (Calendly u otra), agente de voz, dashboard
analítico avanzado, catálogo completo de cursos, automatización de matrículas,
atención de leads nuevos fuera de horario o desde la web, integración con la empresa
externa de llamadas, integración con el CRM propio de MUSK (en desarrollo).

## Reglas duras del agente conversacional (confirmadas por Nicolás)

1. **Nunca comunicar precios ni importes.** Ante preguntas de precio: respuesta
   aprobada + invitación a la llamada.
2. **Nunca comunicar temario detallado.** El contenido general, habilidades y
   salidas sí se pueden explicar.
3. **Financiación:** solo indicar que existen opciones y remitir a la llamada. No
   desarrollar condiciones.
4. Responder SOLO con información aprobada por MUSK. No inventar condiciones,
   promociones, garantías ni promesas de empleo.
5. Si no hay respuesta aprobada: registrar la duda y proponer contacto humano.
6. Ninguna oferta para no compradores salvo mensaje aprobado previamente por
   Nicolás. Pedir precio o mencionar una oferta no autoriza a dar importes.
7. Respetar el rechazo: si el lead pide parar, se detiene el seguimiento y se
   registra.
8. Sin presión artificial. No prometer atención inmediata: solo el compromiso de
   contacto que MUSK pueda atender.
9. Disparadores de derivación a humano (confirmados): el lead pide hablar con una
   persona, o acepta/acuerda una llamada. Otros escalados son propuestas por definir.
10. Una guía usada como fuente de conocimiento NO autoriza enviarla íntegra al lead.
    Si un dossier tiene temario, se excluye del contexto del agente.
11. No hay aprendizaje autónomo de políticas comerciales: las respuestas nuevas se
    revisan antes de incorporarse al contenido aprobado.

Las once están codificadas como datos en `src/rules.ts`, con guardián de salida
(`guardReply`) y tests obligatorios. El contenido aprobado vive en
`src/content.ts`; el perfil de muestra, solo con `--demo`, en `src/content.demo.ts`.

## Decisiones abiertas (no asumir; dejar configurable y marcar `TODO(decisión)`)

Formación elegida · tamaño de muestra y fecha de lanzamiento · cadencia de
seguimiento y reglas de parada · texto del mensaje inicial · lista final de preguntas
de cualificación · nombres definitivos de las etiquetas conversacionales · receptor
de los avisos y su cobertura · mecanismo de llamada (solicitar contacto vs acordar
momento) · configuración del canal WhatsApp · base legal / privacidad / transparencia
del lote real · umbrales de éxito.

Ahora mismo hay cuatro `TODO(decisión)` vivos en `src/content.ts`: mensaje inicial,
presentación de MUSK y las dos preguntas de cualificación. **Un `TODO(decisión)`
nunca se envía**: se informa como decisión abierta de MUSK. Ver
`docs/pedido-nicolas.md`.

Importante: los "6 intentos" de la reunión del 18/09 NO son una regla del MVP. El
~3 % de conversión, el coste (>300 €) y los volúmenes (12-15 / 35 al mes) son
contexto histórico sin denominador; no son objetivos ni parámetros.

## Convenciones técnicas

- Las etiquetas conversacionales del asistente son distintas de los estados del CRM
  (nuevo, pendiente, beca, perdido…). No las mezcles ni las mapees por API en esta
  fase.
- El aviso al comercial por WhatsApp debe incluir contacto o teléfono para que lo
  localice en el CRM.
- El lote de prueba debe estar aislado de otras campañas y de la empresa externa de
  llamadas (evitar impactos simultáneos).
- Antes de cualquier envío real: comprobar canal, mensaje inicial, seguimiento,
  parada, receptor del aviso y que la derivación funciona. Hasta entonces, solo
  simulación sin datos personales reales. La lista de cierre está en
  `docs/checklist-canal-real.md`.
- Registrar por separado: respuesta al WhatsApp, solicitud/aceptación de llamada y
  llamada realizada. Siempre con denominador y periodo. Comparar ilocalizables y no
  compradores por separado.
- Idioma: código, identificadores, comentarios y commits en **inglés**; textos de
  cara al lead y documentación en **español de España** (tuteo).

## Cómo trabajar en este repositorio

- Antes de tocar nada: `npm run typecheck`, `npm test` (124 tests) y `npm run eval`
  (40 casos etiquetados del bucle de evaluación). La comprobación automática corre
  también en cada push (`.github/workflows/ci.yml`).
- Si una petición choca con las reglas duras o el alcance, avisa antes de
  implementar.
- Si falta una decisión de las listadas arriba, propón una opción por defecto
  configurable y márcala `TODO(decisión)`; no la presentes como acordada.
- Mantén simple: registro básico y supervisión básica antes que automatización.
- El arnés no está conectado a WhatsApp, ni a leads reales, ni a ningún CRM. El LLM
  es opcional y solo reformula respuestas ya aprobadas.
- El deploy a Vercel es **manual** (`vercel deploy --prod`): el repositorio no
  despliega solo.

## Mapa de documentación

| Fichero | Contenido |
|---|---|
| `README.md` | Qué hace el arnés, comandos y verificación |
| `GUION_DEMO.md` | Guion de demo con las respuestas observadas |
| `INSTRUCCIONES.md` | Guía para que el equipo de MUSK lo pruebe en su equipo |
| `docs/musk-mvp-spec.md` | Especificación completa del MVP |
| `docs/pedido-nicolas.md` | Lo que falta que apruebe Nicolás (contenido) |
| `docs/decisiones-operativas-nicolas.md` | Decisiones de operación (llamada, aviso, cadencia) |
| `docs/checklist-canal-real.md` | Qué cerrar antes de tocar un lead real |
| `docs/musk-agente-informe-tecnico.md` | Informe técnico del motor |
| `docs/musk-catalogo-cursos-propuesta.md` | Propuesta de catálogo (fase 2) |
