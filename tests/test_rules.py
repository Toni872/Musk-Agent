"""Tests for the safety surface: output guard, triggers and templates (app.rules)."""

from app.rules import (
    RULES,
    STOP_TRIGGER,
    acceptance_confirmed,
    build_reply,
    extract_spanish_phone,
    guard_reply,
    moment_confirmed,
)
from app.text import normalize_es


def _fold(text: str) -> str:
    return normalize_es(text)


# ---------------------------------------------------------------------------
# The output guard is the non-negotiable floor
# ---------------------------------------------------------------------------


def test_guard_rejects_prices_and_amounts() -> None:
    assert guard_reply("Vale, la formación cuesta 500 euros al mes.").ok is False
    assert guard_reply("Son 500 €.").ok is False
    assert (
        guard_reply("El precio es 1200.").ok is True
    )  # bare number without currency is not a price
    assert guard_reply("Son 500 eur.").ok is False


def test_guard_rejects_financing_conditions() -> None:
    assert guard_reply("Te lo financiamos sin intereses.").ok is False
    assert guard_reply("Con cuotas fijas.").ok is False
    assert guard_reply("Hay opciones de financiación.").ok is True


def test_guard_rejects_detailed_syllabus() -> None:
    assert guard_reply("En el módulo 3 verás Python.").ok is False
    assert guard_reply("Aprendes programación con Python.").ok is True


def test_guard_rejects_unapproved_promotions() -> None:
    assert guard_reply("Tenemos un descuento del 20%.").ok is False
    assert guard_reply("Oferta especial de bienvenida.").ok is False


def test_guard_allows_a_harmless_percentage() -> None:
    # Rule 1 protects money and conditions, not the word "percent" itself.
    assert guard_reply("La formación es 100% online.").ok is True
    assert guard_reply("Tenemos un 90% de práctica.").ok is True
    assert guard_reply("Un 80% de las plazas son prácticas.").ok is True
    assert guard_reply("¿Te interesa? El 90% es práctico.").ok is True


def test_guard_rejects_a_percentage_about_money_or_jobs() -> None:
    for text in (
        "Financiamos al 5% de interés.",
        "Un 5% de interés.",
        "El interés es del 5%.",
        "La cuota baja un 10% este mes.",
        "Pagas solo el 20% ahora.",
        "El 100% de nuestros alumnos encuentra trabajo.",
        "Tenemos un 98% de empleabilidad.",
        "Es solo un 5%. Hablamos de la financiación cuando quieras.",
        "Los intereses por la formación, por el temario, por las prácticas y por el "
        "profesorado son del 5%.",
        "Un 5% de los alumnos lo deja.",
    ):
        result = guard_reply(text)
        assert result.ok is False, text
        assert "percentage-condition" in [v.id for v in result.violations], text


def test_guard_distinguishes_honest_denial_from_job_promise() -> None:
    # Direct port of the live-transcript regression.
    assert guard_reply("No garantizamos un puesto de trabajo al terminar.").ok is True
    assert guard_reply("Sin garantizar empleo, pero te acompañamos.").ok is True
    assert guard_reply("Te garantizamos un puesto de trabajo.").ok is False


def test_guard_lets_a_clean_reply_pass() -> None:
    result = guard_reply("Claro, te cuento. ¿Qué es lo que más te frena?")
    assert result.ok is True
    assert result.violations == ()


def test_guard_reports_violation_rule_numbers() -> None:
    result = guard_reply("Te garantizamos trabajo.")
    assert result.ok is False
    assert any(v.id == "employment-promise" and v.rule == 4 for v in result.violations)


# ---------------------------------------------------------------------------
# Rule 7: stop trigger
# ---------------------------------------------------------------------------


def test_stop_trigger_fires_on_stop_requests() -> None:
    assert STOP_TRIGGER.search(_fold("no me escribas más, por favor")) is not None
    assert STOP_TRIGGER.search(_fold("para de escribirme")) is not None
    assert STOP_TRIGGER.search(_fold("no continuar")) is not None
    assert STOP_TRIGGER.search(_fold("bórrame de tu lista")) is not None


def test_stop_trigger_does_not_fire_on_ordinary_talk() -> None:
    assert STOP_TRIGGER.search(_fold("hola, ¿qué tal?")) is None


# ---------------------------------------------------------------------------
# Rule 9: handoff triggers
# ---------------------------------------------------------------------------


def test_acceptance_confirmed_on_call_acceptance() -> None:
    assert acceptance_confirmed(_fold("acepto, llamadme cuando queráis")) is True
    assert acceptance_confirmed(_fold("sí, me va bien")) is True


def test_acceptance_confirmed_rejects_negation() -> None:
    assert acceptance_confirmed(_fold("no acepto la llamada")) is False
    # "me viene bien" alone matches the acceptance pattern; negation is what rejects it.
    assert acceptance_confirmed(_fold("no me va bien")) is False


def test_moment_confirmed_on_availability() -> None:
    assert moment_confirmed(_fold("mañana por la tarde")) is True
    assert moment_confirmed(_fold("el martes a las 18:00 me viene bien")) is True


def test_moment_confirmed_rejects_farewell() -> None:
    assert moment_confirmed(_fold("hasta mañana")) is False
    assert moment_confirmed(_fold("nos vemos")) is False


# ---------------------------------------------------------------------------
# Phone handover
# ---------------------------------------------------------------------------


def test_extract_spanish_phone_from_cue() -> None:
    assert extract_spanish_phone("llámame al 612 345 678") == "612345678"
    assert extract_spanish_phone("mi número es 612345678") == "612345678"


def test_extract_spanish_phone_requires_cue_or_whole_number() -> None:
    assert extract_spanish_phone("612345678") == "612345678"
    assert extract_spanish_phone("hola, ¿qué tal?") is None


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


def test_reply_templates_exist_and_are_lead_facing() -> None:
    assert "no continuar" in build_reply("stop")
    assert "persona" in build_reply("humanRequest")
    assert "llamada" in build_reply("callAccepted")
    assert "persona del equipo" in build_reply("doubt")


def test_all_eleven_rules_are_present() -> None:
    assert [rule.id for rule in RULES] == list(range(1, 12))
