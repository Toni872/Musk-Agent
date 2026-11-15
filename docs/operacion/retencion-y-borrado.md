# Retención y borrado de datos personales

Estado: **implementado** (B1 del plan de endurecimiento). Última actualización:
15-11-2026.

Este documento explica, en dos niveles, cómo se conservan y cómo se borran los
datos de un lead. El nivel técnico dice qué hace el código; el de negocio, qué
obligación cubre y qué riesgo queda abierto. Es la referencia operativa: si hay
que borrar algo, se hace con lo que dice aquí.

Complementa a:

- `endurecimiento-pii.md` — plan por fases y auditoría de riesgos.
- `reset-datos.md` — reinicio del entorno y ubicación del fichero de datos.
- `nfr-piloto.md` — requisitos no funcionales del piloto.

## 1. Qué guardamos

Tres tablas de `app/db.py`. Las tres contienen datos personales en cuanto entra
un lead real.

| Tabla | Qué contiene | Dato personal |
|---|---|---|
| `conversation` | cabecera de la conversación: `id` (= id de sesión), `lead_id`, `contact`, bolsa de origen, motivo de pérdida, estado de parada, derivación y resumen | `contact` es un teléfono; `lead_id` identifica a la persona |
| `message` | un registro por turno: `content` con el texto literal del lead y de la agente | `content` es texto libre: puede contener nombre, teléfono, empresa o cualquier dato que el lead escriba |
| `agent_session` | estado completo de la conversación serializado en JSON (`history`, `lead`, dudas, registros, métricas) | `lead` y `history` repiten los mismos datos personales |

Dos detalles que importan para borrar bien:

1. **`agent_session` se escribe al abrir la sesión**, antes del primer mensaje.
   Una sesión abierta y nunca usada no tiene fila en `conversation`, pero sí
   guarda el lead. El borrado tiene que cubrirla.
2. **`conversation.id` y `agent_session.session_id` son el mismo valor**: el id
   de sesión que emite el servidor. Por eso un borrado por id alcanza las tres
   tablas.

No se guardan credenciales, tokens ni datos de pago. Los logs estructurados
registran latencia, intentos, tokens y coste, nunca el texto de la conversación;
desde A4 tampoco el id de sesión completo (solo `session_ref`, un hash truncado).

## 2. Cuánto tiempo se conserva

La ventana se controla con una variable de entorno:

| Variable | Por defecto | Significado |
|---|---|---|
| `MUSK_RETENTION_DAYS` | `90` | días de conservación desde la **última actividad** |

`TODO(decisión)`: **el plazo definitivo lo tiene que fijar MUSK.** 90 días es un
valor conservador de trabajo, no una cifra acordada. Se puede cambiar por
despliegue sin tocar código. El mínimo aceptado es 1 día.

Qué cuenta como «actividad»:

- **Conversación:** su último mensaje. Una conversación empezada hace 200 días y
  con un mensaje de ayer **se conserva**; una creada hace 120 días sin actividad
  desde entonces, se borra. Hay un test que lo fija
  (`test_purge_uses_the_last_message_time_not_creation`), porque usar la fecha de
  creación habría borrado conversaciones vivas.
- **Estado de sesión:** su `updated_at`, que se refresca en cada turno.

## 3. Cómo se borra

Hay dos operaciones, y las dos se ejecutan **en el servidor, desde la línea de
comandos**. No hay endpoint HTTP de borrado a propósito: un endpoint que borra
datos, expuesto a la misma red que la app, sería un riesgo mayor que el que
resuelve.

Regla de seguridad de la herramienta: **sin `--yes` no borra nada**. Solo
informa de lo que borraría. Es deliberado; evita un borrado accidental por un
comando mal copiado.

### 3.1 Barrido rutinario (minimización)

Borra todo lo que lleve más tiempo que la ventana sin actividad.

```powershell
# 1. Ver qué se borraría (no toca nada)
uv run python -m app.retention --dry-run

# 2. Ejecutar el borrado real
uv run python -m app.retention --yes

# Variante: ventana distinta solo para esta ejecución
uv run python -m app.retention --days 30 --yes
```

Salida esperada (ejemplo con la base local vacía):

```text
Modo: SIMULACION (no se ha borrado nada)
Alcance: datos con mas de 90 dias sin actividad
Conversaciones: 0
Mensajes: 0
Estados de sesion: 0
Para ejecutarlo de verdad, repite el comando anadiendo --yes.
```

Con `--yes`, la primera línea pasa a `Modo: BORRADO REAL` y los números indican
lo que se ha borrado.

### 3.2 Supresión de un lead (derecho de supresión)

Borra **todo** lo que pertenece a una persona, sin importar la antigüedad.

```powershell
# 1. Ver el alcance
uv run python -m app.retention --lead <lead_id> --dry-run

# 2. Borrar
uv run python -m app.retention --lead <lead_id> --yes
```

Qué alcanza:

- todas las conversaciones con ese `lead_id` y sus mensajes;
- todos los estados de sesión cuyo JSON tenga ese lead, **aunque la sesión nunca
  haya llegado a chatear** (el estado se lee y se compara dentro del JSON;
  `test_delete_lead_reaches_a_session_state_that_never_chatted` lo fija).

Cuándo se usa: cuando un lead ejerce su derecho de supresión (RGPD art. 17), o
cuando pide parar y además quiere que se borre lo guardado. Detener el
seguimiento es otra cosa y ya está implementado en el agente (regla 7): parar no
implica borrar, y borrar no implica parar. Si el lead pide ambas, se hacen las
dos.

### 3.3 Borrado total del entorno

Para dejar el sistema limpio (reinicio, fin de piloto, migración) se elimina el
fichero o el volumen. Está paso a paso en `reset-datos.md`. No uses
`--lead` para esto: el borrado total es una operación de infraestructura, no de
datos de una persona.

### 3.4 En Docker

```powershell
docker compose exec app uv run python -m app.retention --dry-run
docker compose exec app uv run python -m app.retention --yes
```

El contenedor usa el volumen `musk-data`; el comando trabaja sobre esa misma
base, así que el borrado es el real del despliegue.

## 4. Qué NO borra esto (límites, sin adornos)

| Resto | Estado | Dónde se resuelve |
|---|---|---|
| Copias de seguridad de la base | **Pendiente** | Fase B: política de copias y borrado en copias |
| Cifrado en reposo del volumen y de las copias | **Pendiente** | Fase B |
| Datos enviados al proveedor del LLM | **Pendiente**: hoy viaja el texto del turno; falta redacción y DPA | Fase B |
| Logs del proxy (Caddy) y del host | La URL ya no lleva el id de sesión (A4), pero la IP sí aparece | Fase B: plazo de logs |
| PDF descargados por el operador | Fuera del sistema | Procedimiento manual del comercial |

Decir esto importa: un borrado que se presenta como total y no lo es genera una
falsa sensación de cumplimiento. El barrido cubre la base de datos de la app; el
resto está listado arriba con su fase.

## 5. Cómo verificar

```powershell
# Tests de la operación (7 casos)
uv run pytest -q tests/test_retention.py

# Qué borraría ahora mismo, sin borrar
uv run python -m app.retention --dry-run
```

Los tests cubren, uno por uno:

| Test | Qué fija |
|---|---|
| `test_purge_removes_only_expired_conversations` | borra lo antiguo y respeta lo reciente, en las tres tablas |
| `test_purge_uses_the_last_message_time_not_creation` | la ventana se mide por actividad, no por creación |
| `test_purge_removes_session_state_without_a_conversation` | una sesión abierta y nunca usada también se borra |
| `test_dry_run_reports_without_deleting` | la simulación informa y no toca nada |
| `test_delete_lead_erases_every_trace_of_that_person` | la supresión borra todas las conversaciones del lead y solo las suyas |
| `test_delete_lead_reaches_a_session_state_that_never_chatted` | encuentra al lead dentro del JSON del estado |
| `test_cli_defaults_to_dry_run_and_deletes_nothing` | sin `--yes` el comando no borra |

Comprobación manual del resultado, sobre SQLite local:

```powershell
uv run python -c "import sqlite3; c = sqlite3.connect('musk.db'); print([(t, c.execute(f'select count(*) from {t}').fetchone()[0]) for t in ('conversation', 'message', 'agent_session')])"
```

## 6. Decisiones abiertas (`TODO(decisión)`)

1. **Plazo definitivo de conservación.** Propuesta de trabajo: 90 días. Lo fija
   MUSK junto con la base legal.
2. **Automatización del barrido.** Hoy es manual. La propuesta es un `cron` (o un
   temporizador del sistema) que ejecute `uv run python -m app.retention --yes`
   una vez al día y deje la salida en el log del host. No se implementa hasta
   que exista el plazo firmado.
3. **Plazo de logs y copias.** Forma parte de Fase B; no se puede prometer un
   borrado completo mientras las copias no tengan su propia política.
