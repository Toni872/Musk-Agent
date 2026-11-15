"""Backup and restore prove a deletion is recoverable (Fase B4)."""

import sqlite3
from pathlib import Path

from app.backup import (
    create_backup,
    main,
    restore_backup,
    sqlite_path,
    verify_backup,
)


def _seed(db_path: Path) -> None:
    connection = sqlite3.connect(str(db_path))
    try:
        connection.execute("CREATE TABLE lead (id INTEGER PRIMARY KEY, name TEXT)")
        connection.execute("INSERT INTO lead (id, name) VALUES (1, 'ana')")
        connection.commit()
    finally:
        connection.close()


def test_sqlite_path_parses_local_and_docker_forms() -> None:
    assert sqlite_path("sqlite+aiosqlite:///./musk.db") == Path("./musk.db")
    assert sqlite_path("sqlite+aiosqlite:////data/musk.db") == Path("/data/musk.db")
    assert sqlite_path("postgresql+asyncpg://host/db") is None
    assert sqlite_path("sqlite+aiosqlite:///:memory:") is None


def test_create_backup_snapshots_and_restore_brings_the_data_back(tmp_path: Path) -> None:
    db_path = tmp_path / "musk.db"
    backups = tmp_path / "backups"
    _seed(db_path)

    backup = create_backup(db_path, backups)
    assert backup.exists()
    assert verify_backup(backup) is True

    # Simulate the loss: wipe the live database.
    db_path.unlink()
    assert not db_path.exists()

    restore_backup(backup, db_path)
    connection = sqlite3.connect(str(db_path))
    try:
        assert connection.execute("SELECT name FROM lead WHERE id = 1").fetchone() == ("ana",)
    finally:
        connection.close()


def test_verify_backup_rejects_a_corrupt_file(tmp_path: Path) -> None:
    corrupt = tmp_path / "musk.db"
    corrupt.write_text("esto no es sqlite")
    assert verify_backup(corrupt) is False


def test_restore_refuses_a_corrupt_backup(tmp_path: Path) -> None:
    live = tmp_path / "musk.db"
    _seed(live)
    corrupt = tmp_path / "corrupt.db"
    corrupt.write_text("basura")

    try:
        restore_backup(corrupt, live)
    except ValueError:
        pass
    else:
        raise AssertionError("esperaba ValueError por una copia corrupta")
    # The live database is untouched.
    connection = sqlite3.connect(str(live))
    try:
        assert connection.execute("SELECT COUNT(*) FROM lead").fetchone() == (1,)
    finally:
        connection.close()


def test_cli_create_and_verify(tmp_path: Path) -> None:
    db_path = tmp_path / "musk.db"
    backups = tmp_path / "backups"
    _seed(db_path)

    assert main(["create", "--db", str(db_path), "--dir", str(backups)]) == 0
    created = list(backups.glob("musk-*.db"))
    assert len(created) == 1
    assert main(["verify", "--file", str(created[0])]) == 0
