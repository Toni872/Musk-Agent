"""Backup and restore of the SQLite database, encrypted at rest.

The pilot stores its data in a single SQLite file (``musk.db`` locally, the
``musk-data`` volume in Docker). A backup protects against corruption and
against an accidental deletion; a restore is only useful if it has been proven
to work, which is what ``tests/test_backup.py`` does end-to-end.

Snapshots are taken with SQLite's own backup API (``sqlite3.Connection.backup``),
which copies a consistent state even while the app is writing. When
``MUSK_ENCRYPTION_KEY`` is set, the snapshot is then encrypted with Fernet, so a
copy that leaves the machine is unreadable without the key. Without the key the
backup is plain (the host disk encryption covers it at rest). Restore is a cold
operation: stop the app first.

Postgres (the Vercel demo) is a managed service and its backups are the
provider's concern, not this module.
"""

from __future__ import annotations

import argparse
import binascii
import os
import shutil
import sqlite3
import tempfile
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

_DEFAULT_BACKUP_DIR = "backups"
_ENCRYPTED_SUFFIX = ".enc"


def sqlite_path(url: str) -> Path | None:
    """Return the SQLite file path encoded in ``url``, or ``None`` if not SQLite.

    Handles the local form (``sqlite+aiosqlite:///./musk.db``), the Docker
    volume form (``sqlite+aiosqlite:////data/musk.db``) and the Windows
    absolute form. ``:memory:`` returns ``None``: an in-memory database has no
    file to back up.
    """
    if not url.startswith("sqlite"):
        return None
    marker = ":///"
    if marker not in url:
        return None
    raw = url.split(marker, 1)[1].split("?", 1)[0].split("#", 1)[0]
    if not raw or raw == ":memory:":
        return None
    return Path(raw)


def _backup_stamp(now: datetime) -> str:
    return now.strftime("%Y%m%d-%H%M%S")


def _load_fernet(key: str) -> Fernet:
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, binascii.Error) as error:
        raise ValueError(
            "MUSK_ENCRYPTION_KEY no es una clave Fernet valida; "
            "generala con cryptography.fernet.Fernet.generate_key()"
        ) from error


def _snapshot(db_path: Path, destination: Path) -> None:
    source = sqlite3.connect(str(db_path))
    target = sqlite3.connect(str(destination))
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()


def create_backup(
    db_path: Path,
    dest_dir: Path,
    *,
    key: str | None = None,
    now: datetime | None = None,
) -> Path:
    """Snapshot ``db_path`` into ``dest_dir`` and return the created file.

    With ``key`` the snapshot is encrypted (``.db.enc``); without it the plain
    SQLite file is written (``.db``).
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    stamp = _backup_stamp(now or datetime.now())
    fernet = _load_fernet(key) if key else None
    suffix = f".db{_ENCRYPTED_SUFFIX}" if fernet else ".db"
    destination = dest_dir / f"musk-{stamp}{suffix}"

    if fernet is None:
        _snapshot(db_path, destination)
        return destination

    temporary = destination.with_name(destination.name + ".tmp")
    try:
        _snapshot(db_path, temporary)
        destination.write_bytes(fernet.encrypt(temporary.read_bytes()))
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def _file_integrity_ok(path: Path) -> bool:
    try:
        connection = sqlite3.connect(str(path))
    except sqlite3.Error:
        return False
    try:
        row = connection.execute("PRAGMA integrity_check").fetchone()
    except sqlite3.Error:
        # A non-SQLite file connects lazily and only fails on the first query.
        return False
    finally:
        connection.close()
    return row is not None and row[0] == "ok"


def _integrity_ok(data: bytes) -> bool:
    fd, name = tempfile.mkstemp(suffix=".db")
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)
    try:
        return _file_integrity_ok(Path(name))
    finally:
        Path(name).unlink(missing_ok=True)


def _decrypt(path: Path, key: str | None) -> bytes:
    if key is None:
        raise ValueError(f"la copia esta cifrada y falta MUSK_ENCRYPTION_KEY: {path}")
    try:
        return _load_fernet(key).decrypt(path.read_bytes())
    except InvalidToken as error:
        raise ValueError(f"la copia no se puede descifrar (clave distinta?): {path}") from error


def verify_backup(path: Path, *, key: str | None = None) -> bool:
    """Return whether the backup at ``path`` is intact (and decryptable)."""
    if path.suffix == _ENCRYPTED_SUFFIX:
        try:
            return _integrity_ok(_decrypt(path, key))
        except (ValueError, OSError):
            return False
    return _file_integrity_ok(path)


def restore_backup(backup_path: Path, db_path: Path, *, key: str | None = None) -> None:
    """Replace ``db_path`` with ``backup_path`` after verifying it is intact.

    Raises ``ValueError`` for a corrupt or undecryptable backup so a bad file
    never clobbers the live database. The app must be stopped before this runs.
    """
    if backup_path.suffix == _ENCRYPTED_SUFFIX:
        plaintext = _decrypt(backup_path, key)
        if not _integrity_ok(plaintext):
            raise ValueError(f"la copia no supera la comprobacion de integridad: {backup_path}")
        db_path.write_bytes(plaintext)
        return
    if not _file_integrity_ok(backup_path):
        raise ValueError(f"la copia no supera la comprobacion de integridad: {backup_path}")
    shutil.copyfile(backup_path, db_path)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.backup",
        description=(
            "Copia de seguridad y restauracion de la base SQLite. La copia usa "
            "la API de backup de SQLite (instantanea consistente); con "
            "MUSK_ENCRYPTION_KEY queda cifrada. La restauracion es en frio: "
            "deten la aplicacion antes."
        ),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="crea una copia con marca de tiempo")
    create.add_argument("--db", default=None, help="ruta del .db (por defecto DATABASE_URL)")
    create.add_argument("--dir", default=_DEFAULT_BACKUP_DIR, help="directorio de destino")

    verify = subparsers.add_parser("verify", help="comprueba la integridad de una copia")
    verify.add_argument("--file", required=True, help="copia a comprobar")

    restore = subparsers.add_parser("restore", help="restaura una copia (en frio)")
    restore.add_argument("--file", required=True, help="copia a restaurar")
    restore.add_argument("--db", default=None, help="ruta del .db de destino")

    return parser


def _resolve_db_path(argument: str | None) -> Path | None:
    if argument:
        return Path(argument)
    url = get_settings().database_url
    path = sqlite_path(url)
    if path is None:
        print("Error: DATABASE_URL no apunta a un fichero SQLite.")
    return path


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    key = get_settings().encryption_key
    if key is not None:
        try:
            _load_fernet(key)
        except ValueError as error:
            print(f"Error: {error}")
            return 2

    if args.command == "create":
        db_path = _resolve_db_path(args.db)
        if db_path is None:
            return 2
        backup = create_backup(db_path, Path(args.dir), key=key)
        print(f"Copia creada: {backup}")
        return 0

    if args.command == "verify":
        ok = verify_backup(Path(args.file), key=key)
        print("Integridad: OK" if ok else "Integridad: FALLIDA")
        return 0 if ok else 1

    # restore
    db_path = _resolve_db_path(args.db)
    if db_path is None:
        return 2
    try:
        restore_backup(Path(args.file), db_path, key=key)
    except ValueError as error:
        print(f"Error: {error}")
        return 1
    print(f"Restaurada la copia en: {db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
