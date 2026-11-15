# Endurecimiento antes de datos reales (PII)

Estado: **Fase A completa** (rama `security/pii-hardening`); Fase B pendiente.
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
| 5 | Límite de peticiones solo en `/chat`; `/sessions` y `/state` sin tope | Media | **Corregido (A4)** |
| 6 | Sin topes de tamaño de mensaje/cuerpo | Media | **Corregido (A4)** |
| 7 | Sin retención, borrado ni cifrado en reposo de la PII | Alta | **Parcial (B1: plazo y borrado; falta cifrado)** |
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
  `POST /chat` y `GET /session/state` usan `store.get` y responden `404` si el id
  no existe: ya no crean sesiones al vuelo. La UI (`app.js`) guarda el id que
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

### A4. Límite global, topes de tamaño y sesión fuera de la URL

- **Técnico.** El límite de peticiones pasa a ser una dependencia del router
  (`app/routers/chat.py`), así que cubre `/chat`, `/sessions`, `/session/state`,
  `/session/pdf` y `/report.pdf`; la clave sigue siendo la IP del cliente y el
  tope, `max_calls_per_minute` (30 por defecto, configurable). `app/limits.py`
  añade `RequestSizeLimitMiddleware`: rechaza con `413` un cuerpo mayor de 256 KiB
  (`MAX_REQUEST_BYTES`) antes de que FastAPI lo parsee, y también un cuerpo
  *chunked* sin `Content-Length`. `app/models.py` fija topes por campo como
  constantes con nombre (`MAX_MESSAGE_CHARS = 1000`, id de lead, contacto y
  motivo de pérdida) y devuelve `422` si se superan. Las lecturas dejan de llevar
  el id en la URL: `GET /session`, `GET /session/state` y `GET /session/pdf`
  esperan la cabecera `X-Session-Id` y responden `401` si falta; las rutas
  antiguas `/sessions/{id}...` desaparecen. El log de cada turno escribe
  `session_ref` (sha256 truncado a 12 caracteres) en lugar del `session_id`
  completo, y el PDF de aviso usa un nombre de fichero fijo
  (`aviso-musk.pdf`), que no refleja datos del lead.
- **Negocio.** Un id en la URL acaba en el log del servidor, en el historial del
  navegador, en la caché del proxy y en cualquier `Referer`: sacarlo de la ruta
  reduce copias involuntarias de la PII. Los topes evitan que un mensaje gigante o
  un cuerpo malformado tumben el proceso, y el límite en todas las rutas cierra la
  puerta a crear sesiones en bucle. Ninguno de estos cambios altera lo que ve el
  lead: solo cuánto se acepta y dónde queda registrado.
- **Verificar.** `uv run pytest -q tests/test_limits.py tests/test_api.py tests/test_ratelimit.py`.
  Manual: `POST /chat` con 300 KB devuelve `413`; `GET /session/state` sin
  `X-Session-Id` devuelve `401`; dos peticiones seguidas a `/sessions` con el tope
  a 1 devuelven `429` en la segunda.

### A5. Cierre de la fase

Fase A queda cerrada con A1–A4. Lo que sigue (retención, cifrado, proveedor del
LLM, cuentas por operador) es **Fase B** y bloquea el lote real.

## Fase B — antes del lote real

En curso. Bloquea el uso con PII real:

- **B1. Retención y borrado:** **hecho**. `app/retention.py` borra por antigüedad
  (`purge_expired`) y por lead (`delete_lead`), desde la línea de comandos y con
  `--yes` obligatorio para borrar de verdad. El plazo es configurable
  (`MUSK_RETENTION_DAYS`, 90 por defecto) y sigue pendiente de firma. El detalle
  operativo, con qué se guarda, qué se borra y qué no, está en
  `retencion-y-borrado.md`.
- **B2. Redacción antes del LLM:** **hecho**. `app/redaction.py` sustituye email,
  teléfono y documento (DNI/NIE) por marcadores en el historial que se envía al
  modelo; los datos guardados y la recuperación conservan el texto original. Los
  nombres no se redactan (decisión abierta): hacerlo degradaría la conversación.
- **B3. Cuentas por operador y auditoría:** **hecho**. `MUSK_OPERATORS`
  (`nombre:contraseña` separados por coma) da a cada persona su cuenta; la pareja
  única `MUSK_BASIC_AUTH_USER` / `MUSK_BASIC_AUTH_PASSWORD` sigue funcionando
  como un solo operador. El middleware adjunta el operador a la petición y
  registra un evento `access` (quién, método y ruta) a nivel INFO: la auditoría
  es visible con `log_level=INFO`. Los nombres definitivos se fijan al desplegar.
- **B4. Copias de seguridad con restauración probada:** **hecho**.
  `app/backup.py` crea una instantánea consistente de la base SQLite con la API
  de backup de SQLite (`create`), la comprueba (`verify`) y la restaura en frío
  (`restore`). La restauración está probada de punta a punta por
  `tests/test_backup.py`. La cadencia (cron) y dónde van las copias quedan como
  decisión de MUSK; la dirección por defecto es `backups/` (git-ignored).
- **Cifrado en reposo:** volumen/BD y copias. Pendiente. Ahora que las copias
  existen, se decide dónde y con qué claves se cifra.
- **Proveedor del LLM (DPA):** la redacción reduce el envío pero no lo elimina:
  el texto limpio sigue yendo al proveedor. Falta firmar un DPA y elegir un
  proveedor que no entrene con los datos, y cubrir las copias que el proveedor
  haga (trazas, datasets). Pendiente, decisión de MUSK.
- **Base legal, transparencia y DPA** Script9↔MUSK; aviso en el primer mensaje.
  Pendiente.

Nota de método: la pseudonimización (`session_ref`, hash truncado del id de
sesión) no es anonimización; un hash se puede correlacionar. Queda como defensa
en profundidad, no como anonimización declarada.

## Fase C — piloto con lote real

- Muestra pequeña, interruptor de parada y supervisión básica.
- Runbook de incidente (a quién avisar y qué hacer ante una brecha).
- Métricas con denominador y periodo (ver `nfr-piloto.md`).

## Decisiones abiertas (no asumir)

Plazo de retención (arranca en 90 días configurables, `MUSK_RETENTION_DAYS`;
pendiente de firma) · texto de base legal y transparencia · proveedor del LLM y
DPA · número y reparto de cuentas de operador · cabeceras de seguridad en Vercel
(demo). El tope de peticiones arranca en 30/min por IP (`max_calls_per_minute`,
configurable) y el del mensaje en 1000 caracteres: son valores conservadores por
defecto, no una cifra negociada con MUSK. Cada decisión pendiente se marca
`TODO(decisión)` mientras no haya decisión escrita.

## Comandos de verificación

```bash
uv run ruff check .
uv run mypy app
uv run pytest -q
uv run python -m app.pilot_gate
docker compose config   # falla si faltan MUSK_BASIC_AUTH_* (fail-closed en Compose)
```
