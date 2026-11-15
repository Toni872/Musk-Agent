# Endurecimiento antes de datos reales (PII)

Estado: **Fase A en curso** (rama `security/pii-hardening`).
Última actualización: 15-11-2026.

Este documento explica, en dos niveles, qué protegemos antes de que entren leads
reales y por qué. El nivel técnico dice qué cambia en el código; el de negocio,
qué riesgo cubre para MUSK y Script9. No sustituye a `nfr-piloto.md` (requisitos)
ni a `checklist-canal-real.md` (lista de cierre): los resume y añade el plan por
fases.

## Por qué esto importa

Un lead real es **dato personal**: nombre, teléfono y el texto de la conversación.
En cuanto aparece uno, el sistema entra en el ámbito del RGPD y la LOPDGDD. Un
fallo aquí no es "un bug": es una brecha de datos, con obligación de notificar, y
un daño reputacional directo a MUSK y a Script9.

La regla de oro que ordena todo lo demás:

- **Datos reales → Docker + Caddy** (servidor propio, TLS, cabeceras, un solo
  proceso).
- **Vercel → solo demo con datos sintéticos.** Nunca un lead real. El despliegue
  serverless no tiene disco ni memoria compartida y no es el sitio para PII.

## Auditoría inicial (15-11-2026)

Riesgos encontrados antes de tocar nada:

| # | Riesgo | Severidad | Estado |
|---|---|---|---|
| 1 | Autenticación fail-open: sin credenciales, el simulador quedaba abierto | Alta | **Corregido (A1)** |
| 2 | IDOR: el cliente elegía el `session_id`; se podía leer la sesión de otro | Alta | **Corregido (A2)** |
| 3 | `/chat` y `/state` creaban sesión con un id arbitrario si no existía | Alta | **Corregido (A2)** |
| 4 | Sin CSP ni `frame-ancestors` en el despliegue real | Media | **Corregido (A3)** |
| 5 | Límite de peticiones solo en `/chat`; `/sessions` y `/state` sin tope | Media | Pendiente (A4) |
| 6 | Sin topes de tamaño de mensaje/cuerpo | Media | Pendiente (A4) |
| 7 | Sin retención, borrado ni cifrado en reposo de la PII | Alta | Pendiente (Fase B) |
| 8 | La PII viaja al proveedor del LLM sin redacción ni DPA | Alta | Pendiente (Fase B) |
| 9 | Cuenta única compartida, sin auditoría de quién ve qué | Media | Pendiente (Fase B) |

## Fase A — antes del primer lead real

### A1. Autenticación fail-closed + modo demo

- **Técnico.** `app/auth.py` añade `LockdownMiddleware`: responde `401` en todas
  las rutas salvo `/health`. `app/main.py` elige middleware en este orden:
  Basic auth si `MUSK_BASIC_AUTH_USER` y `MUSK_BASIC_AUTH_PASSWORD` están
  definidas; si no, `MUSK_PUBLIC_DEMO=true` abre a propósito (con aviso en el
  log); si no, bloqueo total y evento `authentication_not_configured`.
  `app/config.py` incorpora `public_demo`.
- **Negocio.** Antes, olvidar dos variables dejaba el simulador abierto a
  internet sin que nadie se enterara. Ahora el fallo seguro es "cerrado": si algo
  falta, no sirve nada. La única forma de abrirlo es una decisión explícita
  (`MUSK_PUBLIC_DEMO=true`), pensada solo para demos con datos falsos.
- **Verificar.** `uv run pytest -q tests/test_api.py -k "locked or demo or auth"`.
  Manual: `curl -i http://localhost:4173/` sin credenciales devuelve `401`;
  con `MUSK_PUBLIC_DEMO=true`, sirve la página.

### A2. Sesión emitida por el servidor (cierra el IDOR)

- **Técnico.** `app/session.py` gana `new_session_id()`
  (`secrets.token_urlsafe(32)`). `POST /sessions` ya no acepta `session_id` del
  cliente: lo genera el servidor y lo devuelve. `ChatRequest` deja de llevar
  `lead`; la persistencia usa el lead guardado en la sesión (`agent.lead`).
  `POST /chat` y `GET /state/{id}` usan `store.get` y responden `404` si el id no
  existe: ya no crean sesiones al vuelo. La UI (`app.js`) guarda el id que
  devuelve el servidor y no inventa ninguno.
- **Negocio.** El cliente ya no puede elegir ni adivinar el identificador de otra
  persona para leer su conversación. Un id aleatorio de 256 bits hace inviable
  adivinarlo, y una sesión inexistente se rechaza en vez de crearse.
- **Verificar.** `uv run pytest -q tests/test_api.py -k "session or distinto or 404 or desconocid"`.

### A3. CSP y `frame-ancestors` en Caddy

- **Técnico.** `Caddyfile` añade `Content-Security-Policy` con `'self'` (más
  `fonts.googleapis.com` y `fonts.gstatic.com`) y `frame-ancestors 'none'`, junto
  a las cabeceras que ya ponía (HSTS, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`).
- **Negocio.** Reduce el daño de un script inyectado y evita que la web se
  incruste en otra página para engañar al usuario. Complementa, no sustituye, a
  la autenticación.
- **Verificar.** `curl -sI https://<tu-dominio>/ | Select-String content-security-policy`.

### A4. Pendiente de esta fase

- Aplicar el límite de peticiones a **todos** los endpoints, no solo a `/chat`.
- Poner topes de tamaño al mensaje y al cuerpo de la petición.
- Dejar de escribir `session_id` en las trazas/logs de acceso.

## Fase B — antes del lote real

Todavía **no** implementado. Bloquea el uso con PII real:

- **Retención y borrado:** plazo definido y procedimiento de supresión por lead.
- **Cifrado en reposo:** volumen/BD y copias.
- **Proveedor del LLM:** redactar teléfono/identificadores antes de enviar y
  firmar un DPA; elegir proveedor que no entrene con los datos.
- **Cuentas por operador y auditoría:** quién ve qué, con registro.
- **Copias de seguridad con restauración probada.**
- **Base legal, transparencia y DPA** Script9↔MUSK; aviso en el primer mensaje.

## Fase C — piloto con lote real

- Muestra pequeña, interruptor de parada y supervisión básica.
- Runbook de incidente (a quién avisar y qué hacer ante una brecha).
- Métricas con denominador y periodo (ver `nfr-piloto.md`).

## Decisiones abiertas (no asumir)

Plazo de retención · texto de base legal y transparencia · proveedor del LLM y
DPA · número y reparto de cuentas de operador · umbrales del límite de
peticiones · cabeceras de seguridad en Vercel (demo). Cada una se marca
`TODO(decisión)` mientras no haya decisión escrita.

## Comandos de verificación

```bash
uv run ruff check .
uv run mypy app
uv run pytest -q
uv run python -m app.pilot_gate
docker compose config   # falla si faltan MUSK_BASIC_AUTH_* (fail-closed en Compose)
```
