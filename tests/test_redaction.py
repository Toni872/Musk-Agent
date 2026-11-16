"""Tests for app.redaction: PII is masked before it reaches the LLM."""

from app.redaction import redact


async def test_redact_masks_an_email() -> None:
    assert redact("mi correo es juan.perez@ejemplo.com") == "mi correo es [email]"


async def test_redact_masks_an_email_with_a_plus_tag_and_subdomain() -> None:
    assert redact("escribe a juan+tag@mail.sub.ejemplo.es") == "escribe a [email]"


async def test_redact_masks_a_spanish_mobile() -> None:
    assert redact("llámame al 612 345 678") == "llámame al [telefono]"


async def test_redact_masks_a_phone_with_country_prefix() -> None:
    assert redact("mi número es +34 612 345 678") == "mi número es [telefono]"


async def test_redact_masks_a_phone_without_separators() -> None:
    assert redact("600123456") == "[telefono]"


async def test_redact_masks_a_dni() -> None:
    assert redact("mi DNI es 12345678Z") == "mi DNI es [documento]"


async def test_redact_masks_a_nie() -> None:
    assert redact("NIE X1234567L") == "NIE [documento]"


async def test_redact_handles_several_pii_in_one_message() -> None:
    text = "soy juan@ejemplo.com, mi móvil 612345678 y DNI 12345678Z"
    assert redact(text) == "soy [email], mi móvil [telefono] y DNI [documento]"


async def test_redact_leaves_years_and_quantities_alone() -> None:
    assert redact("llevo 2 años trabajando") == "llevo 2 años trabajando"
    assert redact("nací en 2026") == "nací en 2026"


async def test_redact_leaves_plain_text_untouched() -> None:
    assert redact("¿qué cursos tenéis?") == "¿qué cursos tenéis?"


async def test_redact_does_not_touch_a_number_inside_a_word() -> None:
    # "3º" style tokens or a short number followed by letters must not be split.
    assert redact("el curso dura 2 años") == "el curso dura 2 años"
