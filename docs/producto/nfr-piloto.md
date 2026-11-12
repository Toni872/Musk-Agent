# Requisitos no funcionales del piloto

Valores de referencia para decidir si el piloto es aceptable más allá de «responde
bien». Cada fila indica el objetivo, cómo se comprueba y en qué momento. Cuando
el valor es una propuesta de Script9 y no un dato medido, la columna «Estado» lo
dice: no se presenta como acordado con MUSK.

El piloto es una única instancia de FastAPI con SQLite, servida por
`docker compose` con Caddy delante. Los objetivos se dimensionan para eso, no
para un producto en producción abierta.

## Rendimiento

| Requisito | Objetivo | Cómo se verifica | Estado |
|---|---|---|---|
| Latencia del turno con LLM | p95 ≤ 10 s | Duración de `POST /chat` de extremo a extremo, sobre al menos 50 turnos reales de la muestra | Propuesta; no medido |
| Latencia del turno en modo determinista | p95 ≤ 1 s | Mismo procedimiento, forzando el fallback (sin `MUSK_LLM_API_KEY`) | Propuesta; no medido |
| Tiempo máximo por llamada al proveedor | 30 s, con reintentos y backoff | `_TIMEOUT_SECONDS` en `app/llm.py` | Implementado |
| Latencia de recuperación BM25 | < 50 ms por turno | `uv run python -m app.eval` mide la recuperación sobre el dataset de evaluación | Propuesta; la eval mide aciertos, no tiempo |
| Tamaño de contexto enviado al modelo | ≤ 4 pasajes recuperados y ventana de conversación de 20 mensajes | `_RAG_TOP_K`, `_HISTORY_WINDOW` en `app/agent.py` | Implementado |

## Capacidad y caudal

| Requisito | Objetivo | Cómo se verifica | Estado |
|---|---|---|---|
| Límite por cliente | 30 llamadas por minuto al endpoint de chat | `max_calls_per_minute` en `app/config.py`, `app/ratelimit.py` | Implementado; el límite es por proceso |
| Volumen del piloto | Decenas de conversaciones diarias, no miles | Carga real de la muestra; no hay prueba de carga | Supuesto |
| Concurrencia | Un proceso de uvicorn; SQLite con escrituras cortas por turno | `docker-compose.yml`, `app/db.py` | Implementado; medir si se sube el volumen |
| Escalado horizontal | No soportado en el piloto (el límite es por proceso y SQLite es local) | — | Limitación conocida |

## Disponibilidad y recuperación

| Requisito | Objetivo | Cómo se verifica | Estado |
|---|---|---|---|
| Disponibilidad del piloto | 99 % en el horario acordado con MUSK | Revisiones manuales del servicio durante el piloto | Propuesta; sin SLO formal |
| Sondas | Endpoint `/health` responde 200 | `curl` o el propio navegador contra el despliegue | Implementado, pero devuelve `ok` fijo: no comprueba la base de datos |
| Reinicio tras caída | Recuperación automática del contenedor | `restart: unless-stopped` en `docker-compose.yml` | Implementado |
| RPO (pérdida máxima aceptable) | 0 conversaciones en el piloto simulado | Sin backup automático hoy: la pérdida sería total si se elimina el volumen | **No cumplido** |
| RTO (tiempo de recuperación) | < 1 h con acceso al servidor | `docker compose up -d --build` sobre el volumen existente | Propuesta; no ensayado |
| Copia de seguridad | Diaria, fuera del servidor, restauración probada | Procedimiento pendiente | **No implementado** |

## Seguridad

| Requisito | Objetivo | Cómo se verifica | Estado |
|---|---|---|---|
| Transporte cifrado | TLS en el dominio público, HTTP plano solo en la red interna | Configuración de Caddy (`Caddyfile`, `docker-compose.yml`) | Implementado en el despliegue con Compose |
| Autenticación de acceso | HTTP Basic opcional en todas las rutas salvo `/health` | `MUSK_BASIC_AUTH_USER` y `MUSK_BASIC_AUTH_PASSWORD`; test de `app/auth.py` | Implementado |
| Cabeceras reenviadas | `X-Forwarded-For` solo se acepta desde la red interna | `FORWARDED_ALLOW_IPS` en `docker-compose.yml` y test de confianza | Implementado |
| Secretos | Ningún secreto en el repositorio, en la imagen ni en los logs | Revisión del diff y `.gitignore`; variables de entorno en Compose | Implementado (clave del LLM en el entorno del servidor) |
| Salida del agente | Ninguna respuesta con importes, promesas de empleo, promociones ni temario no aprobado | `guard_reply` y tests de `app/rules.py` | Implementado |
| Datos en logs | Sin texto de conversación ni datos personales | Evento `llm_call`: solo latencia, intentos, tokens y coste | Implementado |
| Registro de vulnerabilidades de dependencias | Avisos y PRs automáticos | `.github/dependabot.yml`; activo al estar en la rama principal | Implementado |

## Privacidad y cumplimiento

| Requisito | Objetivo | Cómo se verifica | Estado |
|---|---|---|---|
| Inventario de datos personales | Teléfono del lead y texto de la conversación, documentados | `docs/operacion/reset-datos.md` | Documentado |
| Base legal y transparencia | Definida por MUSK antes del lote real | Decisión del cliente | **Pendiente (bloqueante)** |
| Retención y borrado | Plazo definido y procedimiento de supresión | Requiere decisión y procedimiento técnico | **Pendiente (bloqueante)** |
| Derechos de acceso y portabilidad | Exportación por lead | No implementado | **Pendiente** |
| Datos en simulación | Sin datos personales reales | Regla del proyecto en `AGENTS.md` | Cumplido |

## Observabilidad

| Requisito | Objetivo | Cómo se verifica | Estado |
|---|---|---|---|
| Logs estructurados | JSON con nivel, evento y campos de negocio, sin PII | `app/observability.py`; evento `llm_call` | Implementado |
| Trazabilidad de coste | Tokens y coste por llamada al modelo | Métricas en `TurnOut.metrics` y log `llm_call` | Implementado |
| Métricas agregadas y alertas | Panel con tasa, errores y latencia; alertas por umbral | No existe | **No implementado** |
| Sonda con dependencias | `/health` comprueba base de datos y proveedor | Hoy devuelve un valor fijo | Limitación conocida |

## Calidad y mantenibilidad

| Requisito | Objetivo | Cómo se verifica | Estado |
|---|---|---|---|
| Lint y tipos | Limpios, sin excepciones | `uv run ruff check .` y `uv run mypy app` | Implementado; en CI |
| Suite de pruebas | Verde, incluidos los tests que comparten el código tocado | `uv run pytest` (201 tests) | Implementado; en CI |
| Calidad de recuperación | Recall ≥ 0.9 y cero falsos positivos sobre el dataset de evaluación | `uv run python -m app.eval` (`KB_RECALL_TARGET`, `KB_FALSE_POSITIVE_TARGET`) | Implementado; en CI |
| Puerta de piloto | Sin fallos bloqueantes antes de operar | `uv run python -m app.pilot_gate` | Implementado; en CI |
| Cobertura | No se exige un porcentaje global; se prioriza lógica de negocio, reglas y errores | Revisión manual del diff | Decisión del proyecto |
| Accesibilidad | Sin auditoría formal; la interfaz es un formulario simple y texto | Revisión manual; sin axe ni Lighthouse | **No verificado** |

## Coste

| Requisito | Objetivo | Cómo se verifica | Estado |
|---|---|---|---|
| Coste por turno | Registrado por llamada, sin objetivo cerrado | `cost_usd` en el evento `llm_call` | Implementado |
| Techo de gasto | Decidido por MUSK antes del lote real | Decisión del cliente | **Pendiente** |
| Infraestructura | Un servidor con Docker y Caddy | `docker-compose.yml` | Implementado |

## Fuera de alcance de estos requisitos

No se fijan objetivos de multitenencia, alta disponibilidad multi-zona,
internacionalización, PWA ni SEO: el piloto no los necesita y añadirlos ahora
sería complejidad sin uso.

## Criterios de aceptación ejecutables

- `uv run pytest` en verde y `uv run python -m app.eval` sin regresiones: la
  recuperación y las reglas siguen cumpliendo sus umbrales.
- `uv run python -m app.pilot_gate` sin fallos: ninguna condición bloqueante del
  piloto está abierta.
- `curl -s http://localhost:4173/health` devuelve `{"status":"ok"}`.
- Los cuatro puntos marcados como bloqueantes (base legal, retención, backup y
  copia probada) siguen abiertos hasta que MUSK y Script9 los cierren; el
  documento no los da por hechos.
