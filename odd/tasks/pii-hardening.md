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
- **S5.** `POST /chat` y `GET /state/{id}` responden `404` ante un id desconocido
  y no crean sesiones.
- **S6.** `Caddyfile` envía `Content-Security-Policy` con `'self'` + fuentes de
  Google Fonts y `frame-ancestors 'none'`.
- **S7.** La documentación técnica y de negocio queda actualizada y el gate
  completo sigue verde; las once reglas duras no cambian.

## Tasks

| ID | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|
| T1 | S1, S2, S3 | inline | hecho | `app/config.py`, `app/auth.py`, `app/main.py`, `tests/test_api.py` |
| T2 | S4, S5 | inline | hecho | `app/session.py`, `app/models.py`, `app/routers/chat.py`, `app/agent.py`, `app/static/app.js`, `tests/test_api.py` |
| T3 | S6 | inline | hecho | `Caddyfile` |
| T4 | S7 | inline | hecho | `docs/operacion/endurecimiento-pii.md`, `docs/README.md`, `README.md`, `AGENTS.md`, `docs/producto/nfr-piloto.md`, `docs/operacion/checklist-canal-real.md`, `.env.example` |
| T5 | gate | inline | hecho | ruff, mypy strict, 222 tests, eval sin cambios, pilot_gate limpio |

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
