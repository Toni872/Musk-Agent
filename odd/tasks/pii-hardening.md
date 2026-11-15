# Feature: pii-hardening — seguridad antes de datos reales

Objetivo: cerrar los agujeros que impiden manejar PII real (auth fail-closed,
IDOR, cabeceras) y dejar documentado el resto del plan de endurecimiento.
Rama: `security/pii-hardening`. Entrega: work-unit commits en la rama; push y
merge los decide el humano. Runner: `uv run pytest`.

## Specs

- **S1.** Sin credenciales ni `MUSK_PUBLIC_DEMO=true`, la app responde `401` en
  todas las rutas salvo `/health` (fail-closed) y registra
  `authentication_not_configured`.
- **S2.** Con `MUSK_PUBLIC_DEMO=true` y sin Basic auth, la app sirve la demo
  pública (solo datos sintéticos).
- **S3.** Con `MUSK_BASIC_AUTH_USER` y `MUSK_BASIC_AUTH_PASSWORD`, Basic auth
  protege todas las rutas salvo `/health`.
- **S4.** El `session_id` lo emite el servidor (`secrets.token_urlsafe(32)`) y
  `POST /sessions` no acepta uno del cliente.
- **S5.** `POST /chat` y `GET /session/state` responden `404` ante un id
  desconocido y no crean sesiones.
- **S6.** `Caddyfile` envía `Content-Security-Policy` con `'self'` + fuentes de
  Google Fonts y `frame-ancestors 'none'`.
- **S7.** La documentación técnica y de negocio queda actualizada y el gate
  completo sigue verde; las once reglas duras no cambian.
- **S8.** El límite de peticiones cubre **todas** las rutas del router (no solo
  `/chat`): superarlo devuelve `429`.
- **S9.** `RequestSizeLimitMiddleware` rechaza con `413` un cuerpo mayor de
  256 KiB antes de parsearlo, y topes por campo (`MAX_MESSAGE_CHARS = 1000`, id de
  lead, contacto, motivo) devuelven `422`.
- **S10.** El `session_id` no viaja en la URL ni en el log: las lecturas usan la
  cabecera `X-Session-Id` (`401` si falta), las rutas `/sessions/{id}...`
  desaparecen, el log escribe `session_ref` (sha256 truncado) y el PDF de aviso
  usa un nombre de fichero fijo.

## Tasks

| ID | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|
| T1 | S1, S2, S3 | inline | hecho | `app/config.py`, `app/auth.py`, `app/main.py`, `tests/test_api.py` |
| T2 | S4, S5 | inline | hecho | `app/session.py`, `app/models.py`, `app/routers/chat.py`, `app/agent.py`, `app/static/app.js`, `tests/test_api.py` |
| T3 | S6 | inline | hecho | `Caddyfile` |
| T4 | S7 | inline | hecho | `docs/operacion/endurecimiento-pii.md`, `docs/README.md`, `README.md`, `AGENTS.md`, `docs/producto/nfr-piloto.md`, `docs/operacion/checklist-canal-real.md`, `.env.example` |
| T5 | gate | inline | hecho | ruff, mypy strict, 222 tests, eval sin cambios, pilot_gate limpio |
| T6 | S8, S9, S10 | inline | hecho | `app/limits.py` (nuevo), `app/models.py`, `app/routers/chat.py`, `app/main.py`, `app/static/app.js`, `app/static/index.html`, `tests/test_limits.py` (nuevo), `tests/test_api.py`, `tests/test_ratelimit.py` |
| T7 | gate | inline | hecho | ruff limpio, mypy strict (24 ficheros), 231 tests, eval sin cambios, pilot_gate limpio |

## Log

- **L1** (petición original): «en temas de ciberseguridad pensando a futuro, que
  podemos hacer? aqui se van a meter datos reales».
- **L2** (decisión): datos reales → Docker + Caddy; Vercel solo demo con datos
  sintéticos. El gate y la autenticación viven en la app, no en el proxy.
- **L3** (petición): «Si, pero ves documentando todo por que quiero entender lo
  que vamos a ir haciendo» → se documenta a nivel técnico y de negocio.
- **L4** (evidencia): gate en verde — ruff, mypy strict, 222 tests, `app.eval`
  sin regresiones de recuperación, `pilot_gate` sin disparadores.
- **L5** (siguiente): Fase A4 — límite de peticiones en todos los endpoints,
  topes de tamaño y sacar `session_id` de los logs; después Fase B (retención,
  cifrado, redacción antes del LLM, cuentas y DPA).
- **L6** (verificación independiente, 15-11-2026): bloqueante encontrado — el
  campo `public_demo` no tenía alias, así que `pydantic-settings` leía
  `PUBLIC_DEMO` y no `MUSK_PUBLIC_DEMO`; el flag documentado no funcionaba en el
  despliegue real. Corregido con `validation_alias="MUSK_PUBLIC_DEMO"` y cubierto
  por `tests/test_security_env.py` (S2, S3).
- **L7** (15-11-2026, autorización): «continua» tras el informe de Fase A → se
  implementa A4 en TDD (rojo en `tests/test_limits.py`, verde tras `app/limits.py`
  y los topes). El límite pasa a dependencia del router, el tamaño se corta en
  middleware (401 antes que 413 porque auth es el middleware exterior), el id de
  sesión sale de la URL hacia `X-Session-Id` y el log usa `session_ref`. Rutas
  antiguas `/sessions/{id}...` eliminadas; `index.html` sube a `v=py4`.
