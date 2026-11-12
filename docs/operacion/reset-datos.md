# Datos del piloto: reinicio, conservación y migración

Este documento fija cómo se tratan los datos que guarda el arnés: qué se
almacena, dónde vive el fichero, cómo se reinicia sin sorpresas y qué falta por
resolver antes de tocar un lead real.

Mientras el piloto use datos simulados, el reinicio es una operación trivial.
En cuanto entre un contacto real (nombre, teléfono, conversación), cada apartado
de la sección «Antes de datos reales» pasa a ser un requisito bloqueante.

## Qué se guarda

La persistencia vive en dos tablas de `app/db.py`:

| Tabla | Campos | Sensibilidad |
|---|---|---|
| `conversation` | `id`, `lead_id`, `contact`, `bucket`, `loss_reason`, `is_stopped`, `handoff_fired`, `handoff_reason`, `handoff_summary`, `created_at` | `contact` es un teléfono: dato personal |
| `message` | `conversation_id`, `role`, `content`, `action`, `intent`, `rule_violations`, `registered_doubt`, `created_at` | `content` es texto libre del lead: puede contener datos personales |

Se guarda un registro por turno para poder medir si WhatsApp reactiva leads. No
se guardan credenciales, tokens ni datos de pago. Los logs estructurados
registran latencia, intentos, tokens y coste del LLM, nunca el texto de la
conversación (`app/agent.py`, evento `llm_call`).

## Dónde vive el fichero

| Entorno | `DATABASE_URL` | Ubicación real |
|---|---|---|
| Local (`uv run uvicorn`) | `sqlite+aiosqlite:///./musk.db` (`app/config.py`) | `musk.db` en la raíz del repositorio |
| Docker Compose | `sqlite+aiosqlite:////data/musk.db` (`docker-compose.yml`) | Volumen `musk-data`, montado en `/data` |

`musk.db` está excluido de git, junto con sus ficheros `-journal`, `-wal` y
`-shm`. El volumen `musk-data` sobrevive a `docker compose restart`, `down` y a
la reconstrucción de la imagen; solo desaparece si se elimina el volumen.

## Reinicio en local

1. Detén el proceso de uvicorn (Ctrl+C).
2. Borra la base de datos y sus ficheros auxiliares:

   ```powershell
   Remove-Item musk.db, musk.db-wal, musk.db-shm, musk.db-journal -ErrorAction SilentlyContinue
   ```

3. Arranca de nuevo: `uv run uvicorn app.main:app --reload --port 4173`.
   La base se recrea vacía al iniciar.
4. Verifica que las tablas existen y están vacías:

   ```powershell
   uv run python -c "import sqlite3; c = sqlite3.connect('musk.db'); print([(t, c.execute(f'select count(*) from {t}').fetchone()[0]) for t in ('conversation', 'message')])"
   ```

## Reinicio con Docker

1. `docker compose down` (sin `-v`: conserva volúmenes).
2. Elimina solo el volumen de datos. Su nombre es
   `<carpeta-del-proyecto>_musk-data`; compruébalo antes de borrar:

   ```powershell
   docker volume ls --filter name=musk-data
   docker volume rm musk-agent_musk-data
   ```

3. `docker compose up -d --build`.

No uses `docker compose down -v` por costumbre: elimina también `caddy-data` y
`caddy-config`, con lo que Caddy vuelve a pedir certificados. Si el objetivo es
un borrado completo, es aceptable, pero conviene hacerlo a propósito.

## Qué no hace el arranque

`Database.init()` ejecuta `SQLModel.metadata.create_all` (`app/db.py`). Ese
método crea las tablas que faltan y no toca las que ya existen: **no añade
columnas, no las renombra y no cambia tipos**. Consecuencia práctica: si cambia
el esquema y la base ya tiene datos, el arranque no falla de forma visible; el
fallo aparece más tarde, al leer un campo que no existe.

Por eso, mientras los datos sean simulados, el procedimiento ante un cambio de
esquema es el reinicio:

1. Detén la aplicación.
2. Borra `musk.db` (o el volumen, en Docker).
3. Arranca y comprueba que la tabla nueva se ha creado.
4. Ejecuta la suite: `uv run pytest` y `uv run python -m app.eval`.

No edites el fichero `.db` a mano ni parchees tablas con SQL suelto: el esquema
debe poder reconstruirse arrancando la aplicación.

## Antes de datos reales

Estos puntos son obligatorios antes del lote controlado con leads reales y hoy
no están resueltos:

| Requisito | Estado | Por qué |
|---|---|---|
| Migraciones versionadas | Pendiente | `create_all` no altera tablas existentes. Hace falta decidir entre Alembic o SQL versionado antes del primer cambio de esquema con datos reales |
| Copia de seguridad automática | Pendiente | Sin backup no hay recuperación; el volumen es el único soporte |
| Restauración probada | Pendiente | Un backup sin prueba de restauración no es un backup |
| Retención y borrado | Pendiente | Qué se conserva, cuánto y cómo se atiende una supresión (`TODO(decisión)` abierto en `AGENTS.md`) |
| Exportación por lead | Pendiente | Cubre el derecho de acceso y portabilidad |
| Base legal y transparencia | Pendiente | Decisión de MUSK, no técnica |
| Cifrado en reposo | Pendiente | Depende del proveedor de infraestructura |

El detalle operativo de canal, avisos y derivación está en
`docs/operacion/checklist-canal-real.md`; este documento cubre solo los datos.

## Riesgos conocidos

- **Borrar el volumen equivocado.** El nombre depende de la carpeta del
  proyecto. Compruébalo con `docker volume ls` antes de cualquier `rm`.
- **Confundir reinicio con migración.** Reiniciar resuelve un cambio de esquema
  solo si los datos se pueden perder. Con datos reales, no.
- **Base en memoria del contenedor sin volumen.** No es el caso actual
  (`musk-data` está declarado), pero cualquier despliegue nuevo debe montar el
  volumen o perderá las conversaciones al recrear el contenedor.
