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
(`guardReply`) y tests obligatorios. El contenido aprobado vive en
`src/content.ts`; el perfil de muestra, solo con `--demo`, en `src/content.demo.ts`.

## Decisiones abiertas (no asumir; dejar configurable y marcar `TODO(decisión)`)

Tamaño de muestra y fecha de lanzamiento · cadencia de seguimiento y reglas de
parada · texto del mensaje inicial · copy de cualificación del perfil aprobado ·
nombres definitivos de las etiquetas conversacionales · cobertura de Laura para los
avisos · configuración del canal WhatsApp · base legal / privacidad / transparencia
del lote real · umbrales de éxito.

Ahora mismo hay cuatro `TODO(decisión)` vivos en `src/content.ts`: mensaje inicial,
presentación de MUSK y las dos preguntas de cualificación. **Un `TODO(decisión)`
nunca se envía**: se informa como decisión abierta de MUSK. Ver
`docs/pedido-nicolas.md`.

Importante: los "6 intentos" de la reunión del 18/09 NO son una regla del MVP. El
~3 % de conversión, el coste (>300 €) y los volúmenes (12-15 / 35 al mes) son
contexto histórico sin denominador; no son objetivos ni parámetros.

## Convenciones técnicas

- **Capa de base de conocimiento (Fase 0).** `src/kb.ts` guarda la base de
  conocimiento aprobada como datos (pasajes con id, título, respuesta para el
  lead, términos de recuperación y procedencia) y `src/retrieval.ts` la consulta
  de forma determinista (BM25 + cobertura de términos, sin LLM, sin embeddings
  ni dependencias). Reglas de la capa: la base de conocimiento decide si una
  pregunta puede responderse y con qué pasaje; **el umbral vive en el código,
  como constante con nombre** (`MIN_BM25_SCORE`, `MIN_TERM_COVERAGE`), nunca en
  un prompt; los temas prohibidos (precio, condiciones de pago, horas, fechas de
  inicio, devoluciones, becas, ubicación, requisitos) se rechazan siempre y
  escalan (regla 5), con la excepción expresa del plazo aprobado de dos años para
  completar la formación con flexibilidad. El
  contenido es **copy pendiente de firma de MUSK** (reglas 4 y 11): vive solo
  en el perfil DEMO (`src/content.demo.ts`); el perfil aprobado
  (`src/content.ts`) no lo lleva y, sin base de conocimiento, se comporta
  exactamente como antes. Ninguna respuesta de la base de conocimiento puede
  contener una cifra (lo fija un test). La FAQ escrita a mano conserva
  prioridad sobre la base de conocimiento.
- **Fuente de la fundamentación del LLM.** La regla es: el modelo solo puede usar
  lo que se le mostró. La fuente de una llamada es la respuesta aprobada de la
  entrada casada **más el contexto aprobado del perfil** (`generalDescription` y
  `methodology`), y se compone en un solo sitio
  (`composeGroundingSource`, en `src/entailment.ts`) para que el prompt y la
  comprobación nunca discrepen. Quedan **fuera** de la fuente y del prompt: el
  nombre de la formación (en el perfil DEMO es un marcador interno, "muestra de
  demo", que no puede llegar al lead), las listas de habilidades y salidas (son
  largas y desvían al modelo del tema de la pregunta) y las demás entradas de la
  FAQ (la fuga entre entradas se mantiene cerrada). El contexto del perfil va en
  la parte estable del prompt (no cambia entre llamadas, se cachea); la
  respuesta casada, en la parte volátil.
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

- Antes de tocar nada: `npm run typecheck`, `npm test` (243 tests) y `npm run eval`
  (43 casos etiquetados del bucle de evaluación de la FAQ + 30 de la base de
  conocimiento + 22 de fundamentación, que comprueban que la reformulación del
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
| `INSTRUCCIONES.md` | Guía para que el equipo de MUSK lo pruebe en su equipo |
| `docs/musk-mvp-spec.md` | Especificación completa del MVP |
| `docs/pedido-nicolas.md` | Lo que falta que apruebe Nicolás (contenido) |
| `docs/decisiones-operativas-nicolas.md` | Decisiones de operación (llamada, aviso, cadencia) |
| `docs/checklist-canal-real.md` | Qué cerrar antes de tocar un lead real |
| `docs/musk-agente-informe-tecnico.md` | Informe técnico del motor |
| `docs/musk-catalogo-cursos-propuesta.md` | Propuesta de catálogo (fase 2) |
