"""Tests for the single Spanish normalizer (app.text)."""

from app.text import normalize_es


def test_lowercases_and_strips_accents() -> None:
    assert normalize_es("Formación") == "formacion"
    assert normalize_es("MAÑANA") == "manana"
    assert normalize_es("Qué") == "que"


def test_replaces_punctuation_with_spaces() -> None:
    assert normalize_es("Hola, ¿qué tal?") == "hola que tal"
    assert normalize_es("¡Hola!") == "hola"


def test_collapses_whitespace() -> None:
    assert normalize_es("  hola   que   tal  ") == "hola que tal"
    assert normalize_es("hola\ttal\nnoche") == "hola tal noche"


def test_quotes_and_brackets_are_spaces() -> None:
    assert normalize_es('"Hola"') == "hola"
    assert normalize_es("«Hola»") == "hola"
    assert normalize_es("[hola]") == "hola"
