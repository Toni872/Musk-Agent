# Feature: copias-seguridad — Fase B4 del endurecimiento de PII

Objetivo: que la base de datos pueda recuperarse si se corrompe o se borra por
error, con una restauración probada de punta a punta. La cadencia y el destino
de las copias quedan como decisión de MUSK.
Rama: `security/pii-hardening`. Entrega: work-unit commits en la rama; push y
merge los decide el humano. Runner: `uv run pytest`.

## Specs

- **S1.** `create_backup` hace una instantánea consistente de la base SQLite con
  la API de backup de SQLite (`sqlite3.Connection.backup`), en un fichero con
  marca de tiempo, en el directorio indicado.
- **S2.** `verify_backup` comprueba la integridad (`PRAGMA integrity_check`) y
  devuelve `False` para un fichero corrupto o no-SQLite.
- **S3.** `restore_backup` restaura la copia sobre la base en frío, y **rechaza**
  una copia corrupta sin tocar la base viva.
- **S4.** La CLI `python -m app.backup` expone `create`, `verify` y `restore`;
  `sqlite_path` resuelve la ruta del fichero desde `DATABASE_URL` (local, Docker
  o Windows) y devuelve `None` para Postgres o `:memory:`.
- **S5.** La documentación técnica y de negocio queda actualizada y el gate
  completo sigue verde; las once reglas duras no cambian.

## Tasks

| ID | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|
| T1 | S1, S2, S3 | inline | hecho | `app/backup.py` (nuevo), `tests/test_backup.py` (nuevo, 5 verdes). |
| T2 | S4 | inline | hecho | `app/backup.py` (`main`, `_build_parser`, `sqlite_path`). |
| T3 | S5 | inline | hecho | `docs/operacion/endurecimiento-pii.md` (B4), `docs/cliente/estado-de-seguridad.md`, `docs/operacion/retencion-y-borrado.md`, `README.md`, `app/control_pdf.py` (nuevo), `.gitignore` (`backups/`). |
| T4 | gate | inline | hecho | ruff limpio, mypy strict (28 ficheros), 269 tests, pilot_gate limpio. |

## Log

- **L1 (petición original).** «metele, pero quiero tener un documento pdf con
  toda la informacion de accesos, tanto tecnico como de comandos, quiero tenerlo
  todo controlado yo a nivel de informacion.» → se implementan las copias y se
  genera un PDF consolidado de control de accesos.
- **L2 (decisión técnica).** La instantánea usa la API de backup de SQLite (no
  una copia de fichero): es consistente aunque la app esté escribiendo. La
  restauración es en frío (parar la app antes) y verifica la integridad antes de
  sobrescribir.
- **L3 (decisión abierta).** Cadencia (cron) y destino de las copias son
  `TODO(decisión)` de MUSK; el directorio por defecto es `backups/`
  (git-ignored, nunca se commitea una copia).
- **L4 (entrega de control).** `app/control_pdf.py` consolida la superficie de
  acceso, los candados, las variables, los comandos, los endpoints, las rutas y
  las decisiones abiertas en un solo PDF (`docs/operacion/control-accesos-musk.pdf`),
  regenerable con `python -m app.control_pdf`.
- **L5 (gotcha).** `sqlite3.connect` es perezoso: un fichero no-SQLite conecta y
  solo falla al primer `execute`, así que `verify_backup` captura `sqlite3.Error`
  y devuelve `False` en lugar de propagar.
