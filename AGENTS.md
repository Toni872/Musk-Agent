# MUSK Technologies — Primer MVP conversacional (WhatsApp + IA)

Proyecto de Script9 para MUSK Technologies (interlocutor: Nicolás Stella). Este
fichero es la fuente de verdad del alcance **en este repositorio**. El detalle
completo está en `docs/producto/musk-mvp-spec.md`; léelo antes de tocar flujo, prompts del
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
presentación de MUSK, la FAQ y los 35 pasajes de la base de conocimiento están
escritos y se usan en el perfil único, pero todo ello sigue siendo **copy unificado
pendiente de firma de MUSK** (reglas 4 y 11), no contenido aprobado. La protección
se mantiene para futuros huecos: **un `TODO(decisión)` nunca se envía**, se informa
como decisión abierta de MUSK. Ver `docs/cliente/pedido-nicolas.md`.

Importante: los "6 intentos" de la reunión del 18/09 NO son una regla del MVP. El
~3 % de conversión, el coste (>300 €) y los volúmenes (12-15 / 35 al mes) son
contexto histórico sin denominador; no son objetivos ni parámetros.

## Convenciones técnicas

- **Motor LLM con RAG.** `src/agent.ts` dirige la conversación: cada turno
  recupera los pasajes más cercanos (`retrieveTopK`, BM25) y los pasa al modelo
  como contexto, anclando siempre la presentación de la escuela (`kb-escuela`)
  para que una pregunta corta («¿qué formación?») no se conteste con un pasaje
  suelto. El prompt de sistema lleva el rol, el tono, las once reglas duras, el
  catálogo cerrado, la descripción y la metodología aprobadas y las respuestas de
  la FAQ. El modelo responde **primero** a lo preguntado, en texto plano y breve,
  y termina con una sola pregunta, **orientada siempre a agendar la llamada**:
  conversa y aclara dudas, pero cada mensaje lleva al lead a hablar con una
  persona (directiva confirmada por Nicolás el 30/10/2026). Un respaldo
  determinista colapsa cualquier respuesta con dos o más preguntas a una sola
  pregunta de llamada, para que nunca se encadenen preguntas.
- **Guard de salida (`src/rules.ts`).** `guardReply` descarta cualquier respuesta
  con importes, promesas de empleo, promociones o temario no aprobado. Distingue
  una negación honesta («no garantizamos empleo») de una promesa: el patrón
  `garantiz*` se revisa mirando la negación inmediatamente anterior (sin
  lookbehind, que rompería Safari antiguo). Parada, petición de humano, teléfono
  y aceptación de llamada son deterministas y no pasan por el modelo.
- **Capa de base de conocimiento (Fase 0).** `src/kb.ts` guarda los pasajes como
  datos (id, título, respuesta para el lead, términos de recuperación y
  procedencia) y `src/retrieval.ts` los consulta de forma determinista (BM25 +
  cobertura, sin LLM, sin embeddings ni dependencias). Reglas: **el umbral vive en
  el código, como constante con nombre** (`MIN_BM25_SCORE`, `MIN_TERM_COVERAGE`),
  nunca en un prompt; los temas prohibidos (precio, compensación, financiación,
  horas, fechas de inicio, devoluciones, becas, ubicación, requisitos, condiciones
  de prácticas) se rechazan siempre y escalan (regla 5), con la excepción expresa
  del plazo aprobado de dos años para completar la formación con flexibilidad.
  Ninguna respuesta de la base de conocimiento puede contener una cifra (lo fija
  un test). La FAQ escrita a mano conserva prioridad.
- **Dos recuperadores, un contrato.** `retrieve()` es la puerta con umbrales y
  gate de temas prohibidos: la usa el **modo determinista** (sin modelo o si el
  proveedor falla) para responder solo con un pasaje que supera ambos umbrales, o
  escalar a la regla 5 si nada lo hace. `retrieveTopK()` es el ranking sin umbral
  que alimenta el contexto del LLM; la seguridad se aplica después (prompt +
  guard), no retirando contexto. El modo determinista nunca recita un pasaje débil
  (p. ej. «no es el momento» ante «¿cómo funciona la formación?»): eso escalaría
  de forma deshonesta.
- **Fuente de la respuesta del LLM.** El modelo solo puede usar lo que se le
  mostró: los pasajes recuperados más el contexto aprobado del perfil. Si el
  guard rechaza la salida, el lead recibe la duda (regla 5); si el proveedor
  falla o devuelve vacío, se cae al modo determinista. La duda y la plantilla de
  duda **no** se reformulan: el motor las reconoce por igualdad de texto para
  armar la derivación a humano.
- **Un solo normalizador.** `src/text.ts` es el módulo hoja que posee
  `normalizeEs` (minúsculas, sin acentos, puntuación a espacios, espacios
  colapsados). Lo usan la capa de disparadores (`src/rules.ts`) y la recuperación
  (`src/retrieval.ts`) sin ciclo de importación. `foldForGuard` en `src/rules.ts`
  es deliberadamente distinta: no quita puntuación.
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
  `docs/operacion/checklist-canal-real.md`.
- Registrar por separado: respuesta al WhatsApp, solicitud/aceptación de llamada y
  llamada realizada. Siempre con denominador y periodo. Comparar ilocalizables y no
  compradores por separado.
- Idioma: código, identificadores, comentarios y commits en **inglés**; textos de
  cara al lead y documentación en **español de España** (tuteo).

## Cómo trabajar en este repositorio

- Antes de tocar nada: `npm run typecheck`, `npm test` (125 tests en 6 ficheros) y
  `npm run eval` (bucle de evaluación de la base de conocimiento: recall, falsos
  positivos y ablación léxica held-out). La comprobación automática corre también
  en cada push (`.github/workflows/ci.yml`).
- Si una petición choca con las reglas duras o el alcance, avisa antes de
  implementar.
- Si falta una decisión de las listadas arriba, propón una opción por defecto
  configurable y márcala `TODO(decisión)`; no la presentes como acordada.
- Mantén simple: registro básico y supervisión básica antes que automatización.
- El arnés no está conectado a WhatsApp, ni a leads reales, ni a ningún CRM. Laura
  aparece únicamente como destinataria simulada. El LLM es opcional y dirige la
  conversación con RAG; sin él, el agente cae al modo determinista con los pasajes
  aprobados.
- El deploy a Vercel es **manual** (`npm run deploy`, que ejecuta `pilot-gate` y
  `vercel deploy --prod`): el repositorio no despliega solo.

## Mapa de documentación

Índice completo en `docs/README.md`. Resumen:

| Fichero | Contenido |
|---|---|
| `README.md` | Qué hace el arnés, comandos y verificación |
| `INSTRUCCIONES.md` | Guía para que el equipo de MUSK lo pruebe en su equipo |
| `docs/producto/musk-mvp-spec.md` | Especificación completa del MVP |
| `docs/producto/musk-catalogo-cursos-propuesta.md` | Propuesta de catálogo (fase 2) |
| `docs/producto/matriz-validacion-cursos.md` | Validación por curso (origen de `src/content.ts`) |
| `docs/producto/escuela-musk-base-conocimiento.md` | Fuente de los 35 pasajes de `src/kb.ts` |
| `docs/cliente/pedido-nicolas.md` | Lo que falta que apruebe Nicolás (contenido) |
| `docs/cliente/aprobacion-nicolas.md` | Qué necesita firma de Nicolás (resumen) |
| `docs/cliente/guia-comercial.md` | Guía de uso para el comercial |
| `docs/cliente/gamma-preguntas-musk.md` | Batería de preguntas para probar el agente (demo) |
| `docs/operacion/decisiones-operativas-nicolas.md` | Decisiones de operación (llamada, aviso, cadencia) |
| `docs/operacion/checklist-canal-real.md` | Qué cerrar antes de tocar un lead real |
| `docs/guiones/GUION_DEMO.md` | Guion de demo con las respuestas observadas |
| `docs/guiones/guion-neuroventas.md` | Guion por momento: texto real, objetivo y mecanismo |
| `docs/archivo/` | Material histórico (plan de retrieval híbrido, guía de costes, export obsoleto) |