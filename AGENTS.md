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

Las once están codificadas como datos en `app/rules.py`, con guardián de salida
(`guard_reply`) y tests obligatorios. El perfil único de contenido vive en
`app/content.py` (`APPROVED_CONTENT`): reúne el copy del simulador y la base de
conocimiento, y es **copy unificado pendiente de firma de MUSK**. Es el único
contenido del motor: no hay perfil de demo alternativo ni flag `--demo`.

## Decisiones abiertas (no asumir; dejar configurable y marcar `TODO(decisión)`)

Tamaño de muestra y fecha de lanzamiento · cadencia de seguimiento y reglas de
parada · nombres definitivos de las etiquetas conversacionales · cobertura de Laura
para los avisos · configuración del canal WhatsApp · base legal / privacidad /
transparencia del lote real · umbrales de éxito.

Ya no queda ningún `TODO(decisión)` en `app/content.py`. El mensaje inicial, la
presentación de MUSK, la FAQ y los 35 pasajes de la base de conocimiento están
escritos y se usan en el perfil único, pero todo ello sigue siendo **copy unificado
pendiente de firma de MUSK** (reglas 4 y 11), no contenido aprobado. La protección
se mantiene para futuros huecos: **un `TODO(decisión)` nunca se envía**, se informa
como decisión abierta de MUSK. Ver `docs/cliente/pedido-nicolas.md`.

Importante: los "6 intentos" de la reunión del 18/09 NO son una regla del MVP. El
~3 % de conversión, el coste (>300 €) y los volúmenes (12-15 / 35 al mes) son
contexto histórico sin denominador; no son objetivos ni parámetros.

## Stack y versiones (no cambiar sin pedirlo)

El stack está decidido y **no se cambia sin petición explícita del responsable del
proyecto**: ni frameworks, ni librerías troncales, ni versiones mínimas, ni el
gestor de paquetes. Si una tarea parece exigir otro stack, para y pregunta.

- **Motor:** Python >= 3.12 · FastAPI >= 0.115 · Uvicorn · Pydantic Settings ·
  SQLModel + aiosqlite · structlog · ReportLab. Gestor y ejecución: **uv**.
- **Calidad:** ruff (line-length 100, target py312) · mypy en modo **strict** ·
  pytest con pytest-asyncio y pytest-cov sobre `tests/`.
- **Frontend:** estático servido por la app (`app/static/`). Sin bundler ni
  framework de UI.
- **Despliegue:** imagen Docker (`Dockerfile`, host 4173 → contenedor 8000),
  `docker compose up` con Caddy delante, o Vercel (`index.py` + `vercel.json`,
  preset FastAPI, Postgres obligatorio porque no hay disco ni memoria compartida).
- **Integraciones:** ninguna real todavía (sin WhatsApp, sin CRM, sin proveedor de
  agenda). El LLM es opcional; sin él, el motor cae a modo determinista.

Dependencia nueva o subida de versión mínima = pedir permiso y justificar por qué
no vale con lo que ya hay.

## Convenciones técnicas

- **Motor LLM con RAG.** `app/agent.py` dirige la conversación: cada turno
  recupera los pasajes más cercanos (`retrieve_top_k`, BM25) y los pasa al modelo
  como contexto, anclando siempre la presentación de la escuela (`kb-escuela`)
  para que una pregunta corta («¿qué formación?») no se conteste con un pasaje
  suelto. El prompt de sistema lleva el rol, el tono, las once reglas duras, el
  catálogo cerrado, la descripción y la metodología aprobadas y las respuestas de
  la FAQ. El modelo responde **primero** a lo preguntado, en texto plano y breve,
  y termina con una sola pregunta, **orientada siempre a agendar la llamada**:
  conversa y aclara dudas, pero cada mensaje lleva al lead a hablar con una
  persona (directiva de Miguel —socio de Script9, no el cliente— del 30/10/2026).
  La regla es explícita: **tras cada pregunta del lead**, el agente responde y
  recomienda una llamada para darle más y mejor información; si la pregunta es
  trivial (calle, horario, redes), contesta en una frase solo con información
  aprobada y reconduce al curso y a la llamada. Un respaldo determinista colapsa
  cualquier respuesta con dos o más preguntas a una sola pregunta de llamada, y
  añade la invitación a la llamada cuando el modelo respondió con una afirmación
  o con una pregunta de interés, rotando la formulación para no repetirse. Si el
  proveedor falla o el guard rechaza la salida y el lead pregunta **qué ofrece la
  escuela**, se responde con el catálogo cerrado aprobado en lugar de escalar a
  la plantilla de duda (una pregunta de catálogo tiene respuesta cerrada).
- **Guard de salida (`app/rules.py`).** `guard_reply` descarta cualquier respuesta
  con importes, promesas de empleo, promociones o temario no aprobado. Distingue
  una negación honesta («no garantizamos empleo») de una promesa: el patrón
  `garantiz*` se revisa mirando la negación inmediatamente anterior (sin
  lookbehind, que rompería Safari antiguo). Parada, petición de humano, teléfono
  y aceptación de llamada son deterministas y no pasan por el modelo.
- **Capa de base de conocimiento (Fase 0).** `app/kb.py` guarda los pasajes como
  datos (id, título, respuesta para el lead, términos de recuperación y
  procedencia) y `app/retrieval.py` los consulta de forma determinista (BM25 +
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
  escalar a la regla 5 si nada lo hace. `retrieve_top_k()` es el ranking sin umbral
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
- **Un solo normalizador.** `app/text.py` es el módulo hoja que posee
  `normalize_es` (minúsculas, sin acentos, puntuación a espacios, espacios
  colapsados). Lo usan la capa de disparadores (`app/rules.py`) y la recuperación
  (`app/retrieval.py`) sin ciclo de importación. `_fold_for_guard` en `app/rules.py`
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

## Definición de hecho

Un cambio está hecho cuando se cumple todo esto y lo has ejecutado tú, no lo has
supuesto:

1. `uv run ruff check .` limpio y `uv run mypy app` sin errores (strict).
2. `uv run pytest` en verde, con los tests nuevos y los existentes que comparten
   el código tocado.
3. `uv run python -m app.eval` sin regresiones de recuperación.
4. `uv run python -m app.pilot_gate` no falla (lo ejecuta la CI).
5. Ninguna regla dura nueva sin test; ningún `TODO(decisión)` enviado al lead.
6. Sin secretos, tokens ni datos personales reales en código, tests, logs ni
   commits.
7. Si cambia comportamiento visible, la documentación afectada (`docs/`,
   `README.md`, `INSTRUCCIONES.md`) se actualiza en el mismo cambio.
8. Resumen final: qué cambió, qué quedó fuera y qué riesgo tiene.

## Criterios de aceptación

Todo cambio, grande o pequeño, trae al menos un criterio de aceptación
**ejecutable**: un comando, un test concreto o una comprobación que se pueda
mostrar con su salida real.

- Malo: «el agente responde mejor».
- Bueno: `uv run pytest tests/test_agent.py -k precio` en verde y `/chat` con
  «¿cuánto cuesta?» sin cifras en la respuesta.
- Si el criterio no se puede ejecutar, dilo antes de empezar y propón cómo
  verificarlo; no lo inventes después.
- Si no se cumple, el cambio no está terminado: se reporta como pendiente con el
  fallo observado.

## Cómo trabajar en este repositorio

- **Motor: app Python** (`app/`, FastAPI + uv) servida en el puerto
  **4173** (`uv run uvicorn app.main:app --reload --port 4173`, o Docker con
  `Dockerfile`). Antes de tocar nada: `uv run ruff check .`, `uv run mypy app`,
  `uv run pytest` (201 tests) y `uv run python -m app.eval`. CI de Python en
  `.github/workflows/python-ci.yml` (incluye `uv run python -m app.pilot_gate`).
- **Test primero en lógica de negocio.** Escribe el test rojo que falla, implanta
  lo mínimo para que pase y refactoriza con la suite en verde. No se acepta un
  cambio de comportamiento sin un test que lo fije.
- **Cita el requisito de la spec.** Cuando el cambio afecta al comportamiento del
  MVP, el test y el mensaje del commit referencian la sección de
  `docs/producto/musk-mvp-spec.md` (p. ej. «spec §4»), para que la especificación
  siga siendo la fuente de verdad.
- Si una petición choca con las reglas duras o el alcance, avisa antes de
  implementar.
- Si falta una decisión de las listadas arriba, propón una opción por defecto
  configurable y márcala `TODO(decisión)`; no la presentes como acordada.
- Mantén simple: registro básico y supervisión básica antes que automatización.
- El arnés no está conectado a WhatsApp, ni a leads reales, ni a ningún CRM. Laura
  aparece únicamente como destinataria simulada. El LLM es opcional y dirige la
  conversación con RAG; sin él, el agente cae al modo determinista con los pasajes
  aprobados.
- El deploy vigente es la **imagen Docker** (`Dockerfile`, host `4173` → contenedor
  `8000`), `docker compose up` con Caddy delante (TLS automático) y HTTP Basic
  opcional, o **Vercel** (`index.py`, preset FastAPI) con Postgres en
  `DATABASE_URL`: el estado de sesión se guarda en `agent_session` porque las
  instancias no comparten memoria. Ninguna vía despliega sola.

## Mapa de documentación

Índice completo en `docs/README.md`. Resumen:

| Fichero | Contenido |
|---|---|
| `README.md` | Qué hace el arnés, comandos y verificación |
| `INSTRUCCIONES.md` | Guía para que el equipo de MUSK lo pruebe en su equipo |
| `docs/producto/musk-mvp-spec.md` | Especificación completa del MVP |
| `docs/producto/musk-catalogo-cursos-propuesta.md` | Propuesta de catálogo (fase 2) |
| `docs/producto/matriz-validacion-cursos.md` | Validación por curso (origen de `app/content.py`) |
| `docs/producto/escuela-musk-base-conocimiento.md` | Fuente de los 35 pasajes de `app/kb.py` |
| `docs/producto/glosario-dominio.md` | Vocabulario canónico: negocio, motor, métricas y proceso |
| `docs/producto/nfr-piloto.md` | Requisitos no funcionales del piloto (rendimiento, seguridad, privacidad, coste) |
| `docs/cliente/pedido-nicolas.md` | Lo que falta que apruebe Nicolás (contenido) |
| `docs/cliente/aprobacion-nicolas.md` | Qué necesita firma de Nicolás (resumen) |
| `docs/cliente/conversaciones-tipo-nicolas.md` | Diez conversaciones tipo con transcripción real para que MUSK las valide |
| `docs/cliente/guia-comercial.md` | Guía de uso para el comercial |
| `docs/cliente/gamma-preguntas-musk.md` | Batería de preguntas para probar el agente (demo) |
| `docs/operacion/decisiones-operativas-nicolas.md` | Decisiones de operación (llamada, aviso, cadencia) |
| `docs/operacion/checklist-canal-real.md` | Qué cerrar antes de tocar un lead real |
| `docs/operacion/reset-datos.md` | Reinicio, conservación y migración de `musk.db`; requisitos antes de datos reales |
| `docs/guiones/GUION_DEMO.md` | Guion de demo con las respuestas observadas |
| `docs/guiones/guion-neuroventas.md` | Guion por momento: texto real, objetivo y mecanismo |
| `docs/archivo/` | Material histórico (plan de retrieval híbrido, guía de costes, export obsoleto) |