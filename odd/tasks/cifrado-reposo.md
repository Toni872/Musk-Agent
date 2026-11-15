# Feature: cifrado-reposo — Fase B5 del endurecimiento de PII

Objetivo: que el disco y las copias de seguridad no puedan leerse si se roban o
se filtran. La base viva se protege con el cifrado de disco del host (LUKS/
BitLocker o proveedor); las copias se cifran en la app con Fernet.
Rama: `security/pii-hardening`. Entrega: work-unit commits en la rama; push y
merge los decide el humano. Runner: `uv run pytest`.

## Specs

- **S1.** `create_backup` cifra la instantánea con Fernet cuando hay
  `MUSK_ENCRYPTION_KEY`, y la guarda como `.db.enc`; sin clave, escribe `.db`.
- **S2.** `verify_backup` comprueba integridad: para una copia cifrada la
  descifra primero y devuelve `False` ante clave equivocada o fichero corrupto.
- **S3.** `restore_backup` descifra y restaura, y **rechaza** una copia
  indescifrable o corrupta sin tocar la base viva.
- **S4.** `MUSK_ENCRYPTION_KEY` se valida al arrancar la CLI; una clave mal
  formada falla con mensaje claro (nunca produce copias sin cifrar en silencio).
- **S5.** La documentación técnica y de negocio queda actualizada y el gate
  completo sigue verde; las once reglas duras no cambian.

## Tasks

| ID | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|
| T1 | S1, S2, S3 | inline | hecho | `app/backup.py` (Fernet), `tests/test_backup.py` (3 nuevos: 8 en total). |
| T2 | S4 | inline | hecho | `app/backup.py` (`_load_fernet`, `main`), `app/config.py` (`encryption_key`). |
| T3 | S5 | inline | hecho | `docs/operacion/endurecimiento-pii.md` (B5), `docs/operacion/checklist-canal-real.md`, `docs/operacion/reset-datos.md`, `docs/cliente/estado-de-seguridad.md`, `.env.example`, `app/control_pdf.py`. |
| T4 | gate | inline | hecho | ruff limpio, mypy strict (28 ficheros), 272 tests, pilot_gate limpio. |

## Log

- **L1 (petición original).** «termina el cifrado de reposo y acabamos con
  esto» — la última unidad técnica de Fase B.
- **L2 (permiso de dependencia).** «Si» → se añade `cryptography` (Fernet),
  justificando que la stdlib de Python no trae cifrado simétrico y es la opción
  estándar y mínima.
- **L3 (decisión técnica).** Se cifra lo que *sale* de la máquina (las copias),
  no la base viva: cifrar la base viva exigiría SQLCipher o clave en el propio
  disco, sin ganancia frente al cifrado de disco del host. El disco es
  infraestructura (LUKS/BitLocker), documentado en la checklist.
- **L4 (decisión de alcance).** Una clave mal formada falla la CLI con mensaje
  claro; nunca se degrada a copia sin cifrar en silencio. La clave se genera con
  `Fernet.generate_key()` y vive en `.env`, nunca en el repo.
- **L5 (gotcha).** `sqlite3.connect` es perezoso: para comprobar integridad de
  bytes descifrados se escribe a un `mkstemp` (cerrando el fd antes, por Windows)
  y se ejecuta `PRAGMA integrity_check` sobre el fichero.
