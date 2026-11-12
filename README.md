# MUSK — Asistente conversacional de WhatsApp (MVP)

Arnés independiente para simular el agente de WhatsApp del primer MVP de Escuela Musk (motor en **Python/FastAPI**): reactivar leads antiguos, presentar las cinco formaciones a nivel general y conducir la conversación a una llamada humana. El cierre de la venta es siempre humano; el agente nunca vende por WhatsApp.

No está conectado a WhatsApp, no usa leads reales ni integra CRM. El motor conversacional lo dirige un LLM opcional (con RAG sobre la base de conocimiento aprobada); sin LLM, el agente cae a un modo determinista que solo responde con pasajes aprobados que superan los umbrales.

## Estado actual: motor en Python

El motor es una aplicación **FastAPI en Python** (`app/`), con el suelo de seguridad, los endpoints y **201 tests**. Es la única versión del proyecto: el arnés TypeScript se retiró.

Arranque local (Python 3.12 + uv):

```
uv sync
uv run uvicorn app.main:app --reload --port 4173
```

Abre `http://localhost:4173`. También en Docker:

```
docker build -t musk-agent .
docker run --rm --env-file .env -v musk-data:/app/data -p 4173:8000 musk-agent
```

Verificación: `uv run pytest` (201 tests), `uv run mypy app` y `uv run ruff check .`. Evaluación de la recuperación: `uv run python -m app.eval`.

## Qué hace y qué no hace

| Aspecto | Estado |
|---|---|
| Canal WhatsApp | No conectado: simulación local |
| Leads y CRM | Datos simulados en memoria (`LeadContact` de prueba) |
| Motor conversacional | Dirigido por LLM (RAG sobre la base de conocimiento) con suelo de seguridad determinista |
| Reglas duras 1-11 de `AGENTS.md` | Codificadas en `app/rules.py` y verificadas por tests |
| Sin LLM | Modo determinista: solo pasajes aprobados que superan umbrales; el resto escala a la regla 5 |
| Contenido de la formación | Cinco formaciones presentadas a nivel general. Perfil único en `app/content.py`, **copy pendiente de firma de MUSK** |
| Derivación a humano | Disparadores deterministas: el lead pide hablar con una persona, da su teléfono o acepta una llamada ya propuesta |
| Registro | Registros de conversación, dudas y resultado + vista de supervisión básica en la UI |
| Aviso al equipo | Simulado: destinataria configurada (Laura), sin envío real, con contacto y bolsa de origen |

## Cómo funciona el motor

Un turno = una llamada a `run_turn()` (`app/agent.py`):

1. **Recuperación** (`retrieve_top_k`): los pasajes más cercanos por BM25 se pasan al modelo como contexto, junto con la presentación de la escuela (`kb-escuela`) para que una pregunta corta («¿qué formación?») no se responda con un pasaje suelto.
2. **Prompt**: rol + tono + reglas duras + catálogo + descripción/metodología + respuestas de la FAQ. El modelo debe responder **primero** a lo preguntado, en texto plano y breve, y terminar con una sola pregunta.
3. **Guard de salida** (`guard_reply`): si la respuesta contiene importes, promesas de empleo, promociones o temario no aprobado, se descarta y se escala a la regla 5. El guard distingue una negación honesta («no garantizamos empleo») de una promesa.
4. **Derivación determinista**: parada, petición de humano, teléfono y aceptación de llamada no pasan por el modelo.
5. **Sin modelo** (o fallo del proveedor): modo determinista que solo responde con un pasaje que **supera los umbrales** de `retrieve()`; lo demás escala o usa un puente seguro, nunca un pasaje débil recitado.

## Reglas duras (suelo de seguridad, `app/rules.py`)

1. Nunca precios ni importes: respuesta aprobada + invitación a la llamada.
2. Nunca temario detallado; sí contenido general, habilidades y salidas.
3. Financiación y tiempo: existen opciones y dos años flexibles; nunca importes, intereses ni cuotas.
4. Solo información aprobada por MUSK.
5. Sin respuesta aprobada: registrar la duda y proponer contacto humano.
6. Sin ofertas no aprobadas para no compradores.
7. Respetar el rechazo (parada).
8. Sin presión artificial.
9. Derivación a humano cuando el lead lo pide o acepta una llamada.
10. Una guía fuente no autoriza enviarla íntegra.
11. Sin aprendizaje autónomo: el contenido nuevo se revisa antes de incorporarse.

El guard de salida y los disparadores están como datos y cubiertos por tests.

## Base de conocimiento y recuperación (`app/kb.py` + `app/retrieval.py`)

- 35 pasajes como datos (`id`, `title`, `answer`, `terms`, `source`). El `answer` va al lead; `terms` es vocabulario de recuperación y no se envía.
- Recuperación determinista (BM25 + cobertura), sin LLM, sin embeddings, sin dependencias.
- **Temas prohibidos** (`FORBIDDEN_TOPIC_PATTERNS`): precio, compensación, financiación, duración/horarios, fechas de inicio, devoluciones, ubicación, temario detallado, requisitos y condiciones de prácticas → siempre escalan (regla 5).
- **Umbrales con nombre** en código: `MIN_BM25_SCORE` (3.5) y `MIN_TERM_COVERAGE` (0.5). Un pasaje responde solo si supera ambos.
- Ninguna respuesta de la base de conocimiento contiene una cifra (lo fija un test) y todas pasan `guard_reply`.
- `retrieve()` = puerta con umbrales (usa el modo determinista); `retrieve_top_k()` = ranking para el contexto del LLM.

## Evaluación (`app/eval.py` + `app/eval_dataset.py`)

Instrumento de medición, no lógica de producción: mide recall, falsos positivos, pasaje equivocado e interceptación de temas protegidos sobre la base de conocimiento, más una ablación léxica (held-out). `uv run python -m app.eval` imprime el resumen; `--verbose` y `--json` dan detalle. Los suelos están fijados en `tests/test_eval.py`.

## Configuración del LLM (opcional)

Copia `.env.example` a `.env` y rellena:

| Variable | Descripción |
|---|---|
| `MUSK_LLM_BASE_URL` | Endpoint compatible con OpenAI, con https y segmento de versión (se añade `/chat/completions`) |
| `MUSK_LLM_API_KEY` | Clave del proveedor |
| `MUSK_LLM_MODEL` | Modelo (por defecto `gpt-4o-mini`) |
| `MUSK_LLM_TEMPERATURE` | Temperatura (por defecto `0.2`) |
| `MUSK_LLM_MAX_TOKENS` | Tope de tokens de salida (por defecto `700`) |
| `MUSK_LLM_MAX_RETRIES` | Reintentos ante fallos transitorios: timeout, conexión, 429 y 5xx (por defecto `2`); los 4xx no se reintentan |
| `MUSK_LLM_BACKOFF_BASE_SECONDS` | Base del backoff exponencial con jitter, en segundos (por defecto `0.5`) |
| `MUSK_LLM_BACKOFF_MAX_SECONDS` | Tope del backoff, en segundos (por defecto `4.0`) |
| `MUSK_LLM_PRICE_INPUT_PER_1M` | Precio de entrada por 1M tokens en USD (opcional; activa el trazado de coste) |
| `MUSK_LLM_PRICE_OUTPUT_PER_1M` | Precio de salida por 1M tokens en USD (opcional) |

Hacen falta `MUSK_LLM_BASE_URL` y `MUSK_LLM_API_KEY` para activar el modelo; sin ellas, modo determinista. **Groq** funciona sin tocar código: `https://api.groq.com/openai/v1` con `openai/gpt-oss-120b` (más capaz) o `openai/gpt-oss-20b` (más barato).

Cada llamada al proveedor reintenta los fallos transitorios con backoff y registra tokens, latencia e intentos; si configuras los precios, también el coste estimado. Es telemetría de supervisión (métricas de sesión y log `llm_call`): nunca se envía al lead.

En la app Python, `MAX_CALLS_PER_MINUTE` limita las llamadas a `/chat` por IP (por defecto `30`).

`.env` está en `.gitignore` (la clave nunca se commitea).

## UI local

La interfaz (`app/static/`) la sirve la propia app FastAPI en `/` al arrancar con uvicorn: abre `http://localhost:4173`. No hay bundle aparte ni proxy de desarrollo; el navegador habla con `POST /chat` de la misma app y el LLM se invoca en el servidor, así que la clave nunca llega al cliente.

## Despliegue (Docker)

Manual: construye la imagen y ejecútala (ver «Estado actual»). El repositorio no despliega solo.

**Con TLS y contraseña** — `docker-compose.yml` deja la app en la red interna y pone **Caddy** delante, que obtiene y renueva el certificado automáticamente. Añade a `.env`:

| Variable | Descripción |
|---|---|
| `MUSK_DOMAIN` | Dominio público que resuelve a este servidor, con los puertos 80 y 443 abiertos |
| `MUSK_BASIC_AUTH_USER` | Usuario único de acceso |
| `MUSK_BASIC_AUTH_PASSWORD` | Contraseña única de acceso |

```bash
docker compose up -d --build
```

La app exige HTTP Basic en todas las rutas salvo `/health`, así que el mismo par de credenciales protege también un `uv run uvicorn` directo; si dejas esas dos variables vacías, la autenticación se desactiva (solo para simulación local). Caddy reenvía la IP real del cliente y la app confía en `X-Forwarded-For` solo desde redes privadas de Docker (`FORWARDED_ALLOW_IPS`), de modo que el límite por IP del chat sigue siendo por cliente y no un cupo compartido. Antes de publicar una URL accesible, `uv run python -m app.pilot_gate` bloquea el arranque si hay configuración real versionada.

## Verificación

- [ ] `uv run ruff check .` sin hallazgos.
- [ ] `uv run mypy app` sin errores.
- [ ] `uv run pytest` pasa: 201 tests, cero fallos, sin red.
- [ ] `uv run python -m app.eval` imprime el informe sin regresar por debajo de los suelos.
- [ ] `uv run python -m app.pilot_gate` no encuentra configuración real versionada.
- [ ] Ningún archivo contiene importes, umbrales de conversión ni cadencias como constantes.

## Comprobación automática (CI)

`.github/workflows/python-ci.yml` ejecuta `uv run ruff check .`, `uv run mypy app`, `uv run python -m app.eval`, `uv run python -m app.pilot_gate` y `uv run pytest` en cada push y PR.

## Decisiones pendientes

`docs/operacion/decisiones-operativas-nicolas.md` (cobertura de Laura, cadencia y reglas de parada, canal, base legal/privacidad, tamaño de muestra y fecha de lanzamiento). El copy del perfil único sigue **pendiente de firma de MUSK**. La lista de cierre antes del canal real está en `docs/operacion/checklist-canal-real.md`.

## Contexto histórico (no son objetivos ni parámetros)

Las cifras de las reuniones del 18/09/2026 — «6 intentos», ~3 % de conversión, coste >300 €, volúmenes de 12-15 / 35 al mes — son contexto sin denominador ni periodo. **No son objetivos, umbrales ni parámetros del MVP**, y no aparecen como constantes en el código.
