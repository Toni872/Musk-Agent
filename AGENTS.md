# MUSK Technologies — Primer MVP conversacional (WhatsApp + IA)

Proyecto de Script9 para MUSK Technologies (interlocutor: Nicolás Stella). Este
fichero es la fuente de verdad del alcance **en este repositorio**. El detalle
completo está en `docs/musk-mvp-spec.md`; léelo antes de tocar flujo, prompts del
agente, estados o métricas.

Fuente: reunión del 28/09/2026 (prevalece), contexto del 18/09/2026 y respuestas
inline de Nicolás al correo de Miguel (fecha no indicada en el material compartido).

## Objetivo

Comprobar si WhatsApp reactiva leads antiguos y los convierte en entrevistas o
llamadas humanas útiles, respetando los límites de información y la cercanía de
MUSK. El flujo busca llegar directamente a la conversación humana; no se busca
"vender más" ni hacer una cualificación extensa. El cierre de la venta es siempre
humano.

## Alcance del MVP (dentro)

- Las cinco formaciones pueden aparecer en una presentación general; no hace falta
  preparar ahora un catálogo completo ni detalle de cada curso. Se mantienen dos
  bolsas de leads antiguos: **ilocalizables** y **personas que no compraron**.
- Primer contacto por WhatsApp → dudas y preguntas breves → propuesta de llamada →
  aviso al comercial con identificación del contacto → registro del resultado.
- Preguntas de conversación breves para entender qué busca el lead y conducirlo a la
  entrevista o llamada; no son un examen ni un filtro. Sin puntuación ni exclusión
  automática.
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
3. **Financiación y tiempo:** se puede indicar que existen opciones de financiación
   y que la formación puede completarse en dos años con flexibilidad. Nunca comunicar
   precios, importes, intereses, condiciones de cuotas ni otras condiciones de pago
   no aprobadas.
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
(`guardReply`) y tests obligatorios. El perfil único de contenido vive en
`src/content.ts` (`APPROVED_CONTENT`): reúne el copy del simulador y la base de
conocimiento, y es **copy unificado pendiente de firma de MUSK**.
`src/content.demo.ts` y `DEMO_CONTENT` se eliminaron; ya no existe el flag `--demo`.

## Decisiones abiertas (no asumir; dejar configurable y marcar `TODO(decisión)`)

Tamaño de muestra y fecha de lanzamiento · cadencia de seguimiento y reglas de
parada · nombres definitivos de las etiquetas conversacionales · cobertura de Laura
para los avisos · configuración del canal WhatsApp · base legal / privacidad /
transparencia del lote real · umbrales de éxito.

Ya no queda ningún `TODO(decisión)` en `src/content.ts`. El mensaje inicial, la
presentación de MUSK, la pregunta de cualificación `goal`, la FAQ y los 35 pasajes
de la base de conocimiento están escritos y se usan en el perfil único, pero todo
ello sigue siendo **copy unificado pendiente de firma de MUSK** (reglas 4 y 11),
no contenido aprobado. La protección se mantiene para futuros huecos: **un
`TODO(decisión)` nunca se envía**, se informa como decisión abierta de MUSK. Ver
`docs/pedido-nicolas.md`.

Importante: los "6 intentos" de la reunión del 18/09 NO son una regla del MVP. El
~3 % de conversión, el coste (>300 €) y los volúmenes (12-15 / 35 al mes) son
contexto histórico sin denominador; no son objetivos ni parámetros.

## Convenciones técnicas

- **Capa de base de conocimiento (Fase 0).** `src/kb.ts` guarda la base de
  conocimiento como datos (pasajes con id, título, respuesta para el lead,
  términos de recuperación y procedencia) y `src/retrieval.ts` la consulta de
  forma determinista (BM25 + cobertura de términos, sin LLM, sin embeddings ni
  dependencias). Reglas de la capa: la base de conocimiento decide si una pregunta
  puede responderse y con qué pasaje; **el umbral vive en el código, como
  constante con nombre** (`MIN_BM25_SCORE`, `MIN_TERM_COVERAGE`), nunca en un
  prompt; los temas prohibidos (precio, condiciones de pago, horas, fechas de
  inicio, devoluciones, becas, ubicación, requisitos) se rechazan siempre y
  escalan (regla 5), con la excepción expresa del plazo aprobado de dos años para
  completar la formación con flexibilidad. Los 35 pasajes viajan en el perfil
  único (`APPROVED_CONTENT.kb`, en `src/content.ts`) y forman parte del **copy
  unificado pendiente de firma de MUSK** (reglas 4 y 11). Ninguna respuesta de la
  base de conocimiento puede contener una cifra (lo fija un test). La FAQ escrita
  a mano conserva prioridad sobre la base de conocimiento.
- **Un programa nombrado gana a la FAQ genérica.** La entrada `informacion` existe
  para las formas que no nombran nada ("¿en qué consiste?", "¿de qué va el
  curso?"). Cuando el lead escribe el curso ("¿en qué consiste python?"), la
  misma forma pregunta por ESE curso, así que `classify()` deja pasar antes al
  pasaje `*-contenido`/`*-salidas` del programa (`isProgrammePassage` en
  `src/kb.ts`, guardado por `mentionsProgramme`). El guard es lo que mantiene
  "¿de qué trata el de programación?" en la FAQ `programacion`: "programación"
  es una familia, no un programa, y sin él la base contestaba con el máster de
  videojuegos. Un tema prohibido sigue escalando (regla 5) aunque nombre curso.
  Si el pasaje del programa no supera el umbral (una consulta de un solo
  término), la FAQ genérica responde: nunca silencio.
- **La pregunta pendiente gana al catálogo.** `isReceivableAnswer` recibe como
  respuesta del lead cualquier mensaje que case con las reacciones de la pregunta
  armada, **antes** de mirar la FAQ. Sin esa prioridad, "quiero cambiar de sector"
  (que es a la vez palabra clave del catálogo de orientación y respuesta válida a
  la pregunta de objetivo) se respondía desde la FAQ y la respuesta del lead se
  perdía. Corolario para el copy: una palabra clave del catálogo puede ser una
  frase que el lead use al abrir; si además es una respuesta legítima a una
  pregunta de cualificación, la regla de prioridad la resuelve, no el orden del
  array.
- **Orientación sin tocar los umbrales.** La FAQ lleva una entrada `orientacion`
  (`no sé por dónde empezar`, `cuál me conviene`, `orientadme`, `cambio
  profesional`, `cambiar de carrera`, `cambio de sector`…) porque la base de
  conocimiento ya lista esos términos pero BM25 **no puede** aceptar una consulta
  cuyo contenido se reduce a un solo término: se queda en ~2.4 y el umbral de 3.5
  la rechaza. Los umbrales son una decisión calibrada y validada con hold-out, así
  que la respuesta se da en la capa de catálogo curada y la barra **no se mueve**.
  La respuesta de orientación no termina en pregunta: el motor ya pregunta el
  objetivo en el mismo turno (`src/outbound.ts`).
- **Plantillas de pregunta de contenido.** Las formas con las que el lead pide
  contenido de un programa ("de qué trata…", "qué es el curso de…", "de qué va
  el curso de…", "háblame de…", "en qué consiste…", "qué se aprende en…") están
  como términos extra en los pasajes `*-contenido` (`CONTENT_QUESTION_TERMS` en
  `src/kb.ts`), no como carril propio ni como umbral aparte. Medido el
  2026-10-27: sin ellas, "¿de qué trata el de python?" se respondía con el
  pasaje de **otra** certificación y "¿de qué trata el de videojuegos?" quedaba
  por debajo del umbral (3.43 frente a 3.5). El contrato que fijan los tests no
  es "siempre gana `-contenido`", sino: **con un programa nombrado, la respuesta
  es de ese programa o la capa genérica, nunca de otro programa y nunca silencio
  cuando la base sí cubre el tema**; y las plantillas con palabra de contenido
  ("trata", "curso") llegan al pasaje `-contenido`. El duelo `-contenido` contra
  `-salidas` del mismo programa lo decide BM25, y en los programas de dos
  palabras ("full stack") gana el pasaje corto: es preferencia de ranking dentro
  del programa correcto, no un fallo. "En qué consiste…" y "de qué va…" sin
  programa siguen en la FAQ `informacion`, que es la que gana al KB por diseño.
- **Fuente de la fundamentación del LLM.** La regla es: el modelo solo puede usar
  lo que se le mostró. La fuente de una llamada es el texto aprobado que va a
  reformular **más el contexto aprobado del perfil** (`generalDescription` y
  `methodology`), y se compone en un solo sitio (`composeGroundingSource` para una
  entrada de FAQ y `composeGroundingSourceFromText` para un pasaje o una plantilla,
  en `src/entailment.ts`) para que el prompt y la comprobación nunca discrepen.
  Solo se reformulan tres cosas: la respuesta de la FAQ casada, el pasaje de la base
  de conocimiento que respondió y la plantilla `reassurance`. **Nunca** `price`,
  `financiacion`, `temario`, `stop`, `human` ni `decline`, y **nunca** la plantilla
  `doubt`: el motor la reconoce por igualdad de texto (`asksForContact`,
  `isDoubtReply` en `src/agent.ts`) para armar la derivación a humano, así que
  reformularla rompería el handoff duda → «sí». Quedan **fuera** de la fuente y del
  prompt: el nombre de la formación (en el perfil único es un dato interno para el
  resumen comercial, no texto que pueda llegar al lead), las listas de habilidades
  y salidas (son largas y desvían al modelo del tema de la pregunta) y las demás
  entradas de la FAQ (la fuga entre entradas se mantiene cerrada). El contexto del
  perfil va en la parte estable del prompt (no cambia entre llamadas, se cachea);
  el texto aprobado de la llamada, en la parte volátil.
- **Un miedo no es una duda.** Cuando el lead dice que no se ve capaz («no sé si
  sirvo», «no tengo base», «soy mayor para estudiar»), la duda va por dos caminos
  y en ese orden: primero el enganche léxico, que lleva esos términos al pasaje
  `kb-sin-experiencia` (`src/kb.ts`) y responde con el dato aprobado; después, si
  el mensaje es `unknown` pero casa con `expressesFear()` (`src/rules.ts`), la
  plantilla `reassurance` responde y **no** se registra la duda. Registrar una duda
  ahí ensuciaría la métrica del piloto (una regla 5 falsa) y el motor contestaría
  «no tengo respuesta aprobada» a algo que sí cubre. El cierre para agendar sigue
  pidiendo día y hora (`closingInvitation`), porque es el dato que necesita el aviso
  a Laura; las opciones cerradas se usan al abrir y al preguntar el objetivo, no
  cuando hace falta un momento concreto.
- **Un solo normalizador.** `src/text.ts` es el módulo hoja que posee `normalizeEs`
  (minúsculas, sin acentos, puntuación a espacios, espacios colapsados). Vive
  aparte para que la capa de disparadores (`src/rules.ts`) y la capa de intents
  (`src/intent.ts`) la usen sin ciclo de importación. `src/intent.ts` la
  reexporta, de modo que los importadores existentes no cambian. `foldForGuard`
  en `src/rules.ts` es deliberadamente distinta: no quita puntuación.
- Las etiquetas conversacionales del asistente son distintas de los estados del CRM
  (nuevo, pendiente, beca, perdido…). No las mezcles ni las mapees por API en esta
  fase.
- Laura es la destinataria configurada del aviso simulado y decide a quién asignarlo.
  La línea del simulador no envía un WhatsApp real ni integra el CRM; debe incluir
  contacto y bolsa de origen para facilitar el enrutado manual.
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

- Antes de tocar nada: `npm run typecheck`, `npm test` (358 tests) y `npm run eval`
  (46 casos etiquetados del bucle de evaluación de la FAQ + 33 de la base de
  conocimiento + 23 de fundamentación, que comprueban que la reformulación del
  LLM se mantiene fundamentada en la fuente aprobada). La comprobación automática corre
  también en cada push (`.github/workflows/ci.yml`).
- Si una petición choca con las reglas duras o el alcance, avisa antes de
  implementar.
- Si falta una decisión de las listadas arriba, propón una opción por defecto
  configurable y márcala `TODO(decisión)`; no la presentes como acordada.
- Mantén simple: registro básico y supervisión básica antes que automatización.
- El arnés no está conectado a WhatsApp, ni a leads reales, ni a ningún CRM. Laura
  aparece únicamente como destinataria simulada. El LLM es opcional y solo
  reformula respuestas ya aprobadas.
- El deploy a Vercel es **manual** (`vercel deploy --prod`): el repositorio no
  despliega solo.

## Mapa de documentación

| Fichero | Contenido |
|---|---|
| `README.md` | Qué hace el arnés, comandos y verificación |
| `GUION_DEMO.md` | Guion de demo con las respuestas observadas |
| `docs/guion-neuroventas.md` | Guion por momento conversacional: texto real, objetivo y mecanismo |
| `INSTRUCCIONES.md` | Guía para que el equipo de MUSK lo pruebe en su equipo |
| `docs/musk-mvp-spec.md` | Especificación completa del MVP |
| `docs/pedido-nicolas.md` | Lo que falta que apruebe Nicolás (contenido) |
| `docs/decisiones-operativas-nicolas.md` | Decisiones de operación (llamada, aviso, cadencia) |
| `docs/checklist-canal-real.md` | Qué cerrar antes de tocar un lead real |
| `docs/musk-agente-informe-tecnico.md` | Informe técnico del motor |
| `docs/musk-catalogo-cursos-propuesta.md` | Propuesta de catálogo (fase 2) |
