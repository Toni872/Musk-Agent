# Feature: retencion-borrado — Fase B1 del endurecimiento de PII

Objetivo: que los datos personales de un lead tengan plazo y puedan borrarse por
antigüedad o por petición de la persona, desde el servidor y sin endpoint HTTP.
Rama: `security/pii-hardening`. Entrega: work-unit commits en la rama; push y
merge los decide el humano. Runner: `uv run pytest`.

## Specs

- **S1.** El plazo de conservación es configurable por despliegue:
  `MUSK_RETENTION_DAYS` (alias de `retention_days` en `app/config.py`), entero
  `>= 1`, con valor por defecto `RETENTION_DAYS_DEFAULT = 90`. El 90 es un valor
  de trabajo, no una cifra firmada: queda como `TODO(decisión)`.
- **S2.** `purge_expired` borra conversaciones, sus mensajes y su estado de sesión
  cuando la **última actividad** es anterior al corte. La actividad de una
  conversación es el `created_at` de su mensaje más reciente, y solo si no hay
  mensajes se usa `conversation.created_at`.
- **S3.** El barrido también elimina `agent_session` cuya `updated_at` es anterior
  al corte, aunque no tenga fila en `conversation` (una sesión abierta y nunca
  usada guarda el lead).
- **S4.** `delete_lead` borra todas las conversaciones con ese `lead_id`, sus
  mensajes y todo `agent_session` cuyo JSON de estado contenga ese lead, sin
  importar la antigüedad.
- **S5.** `dry_run=True` informa cantidades y no borra nada.
- **S6.** La CLI `python -m app.retention` acepta `--days`, `--lead`, `--dry-run`
  y `--yes`; sin `--yes` solo informa, y `--dry-run` gana sobre `--yes`. Los
  listados se imprimen en español, en texto plano.
- **S7.** La documentación técnica y de negocio queda actualizada y el gate
  completo sigue verde; las once reglas duras no cambian.

## Tasks

| ID | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|
| T1 | S1 | inline | hecho | `app/config.py`. |
| T2 | S2, S3, S4, S5 | inline | hecho | `app/retention.py` (nuevo), `tests/test_retention.py` (nuevo, 7 verdes). |
| T3 | S6 | inline | hecho | `app/retention.py` (`_build_parser`, `main`). Verificado: `uv run python -m app.retention --dry-run` → 0/0/0 sobre `musk.db` local. |
| T4 | S7 | inline | hecho | `docs/operacion/retencion-y-borrado.md` (nuevo), `docs/operacion/endurecimiento-pii.md`, `docs/operacion/reset-datos.md`, `docs/README.md`, `docs/producto/nfr-piloto.md`, `docs/guiones/GUION_DEMO.md`, `README.md`, `AGENTS.md`, `INSTRUCCIONES.md`, `.env.example`. |
| T5 | gate | inline | hecho | ruff limpio, mypy strict (25 ficheros), 241 tests, eval sin cambios, pilot_gate limpio. |

## Log

- **L1 (petición original).** «Perfecto, ahora sigamos con el siguiente paso,
  ¿Qué es lo siguiente más crítico de hacer en este proyecto ahora mismo?» —
  tras cerrar A4; la respuesta acordada es Fase B empezando por retención y
  borrado, lo mínimo que bloquea el lote real y no depende de terceros.
- **L2.** «SI, y acuerdate de documentarlo absolutamente todo perfectamente
  legible.» — la unidad incluye doc operativa nueva, actualización del plan,
  del índice, del README y del mapa de `AGENTS.md`, sin abreviaturas internas.
- **L3 (evidencia).** `uv run pytest -q tests/test_retention.py` → 7 passed;
  suite completa 241 passed; `uv run python -m app.retention --dry-run` imprime
  «Modo: SIMULACION (no se ha borrado nada)».
- **L4 (decisión técnica).** No hay endpoint HTTP de borrado: expuesto a la misma
  red que la app sería un riesgo mayor que el que resuelve. El operador ejecuta
  la CLI en el servidor (o `docker compose exec app ...`).
- **L5 (gotcha).** `session.execute` está en desuso en SQLModel y `group_by` con
  dos argumentos rompe mypy strict; el ranking de última actividad se hace con
  `select(Message.conversation_id, func.max(Message.created_at)).group_by(
  Message.conversation_id)`. SQLite devuelve datetimes naive: se normalizan con
  `_utc()` antes de comparar con un corte aware.
- **L6 (decisión abierta).** Plazo definitivo del barrido y su automatización
  (`cron` diario) siguen pendientes de firma de MUSK; se documentan como
  `TODO(decisión)` y no se implementan.
- **L7 (límites declarados).** El barrido cubre la base de la app, no las copias
  de seguridad, el cifrado en reposo, el envío al proveedor del LLM ni los logs
  del host: cada uno tiene su fase en `endurecimiento-pii.md`.
