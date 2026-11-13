"""Tests for the LLM-driven empathic engine (app.agent).

Ported from tests/conversation.test.ts: the safety floor (stop, handoff, output
guard), the RAG grounding, the thread memory, the deterministic fallback, and
Miguel's after-every-question call-steering rule.
"""

import re

from app.agent import LeadContact, MuskAgent
from app.content import APPROVED_CONTENT
from app.kb import KB_PASSAGES
from app.llm import LLMRequest, MockProvider
from app.rules import build_reply, guard_reply

LEAD = LeadContact(id="lead-1", contact="+34600000000", bucket="ilocalizable")


def _passage(passage_id: str) -> str:
    for entry in KB_PASSAGES:
        if entry.id == passage_id:
            return entry.answer
    raise AssertionError(f"passage not found: {passage_id}")


def _network_down(_req: LLMRequest) -> str:
    raise RuntimeError("network down")


def _propose_then_answer(req: LLMRequest) -> str:
    last = req.messages[-1].content if req.messages else ""
    if "cuánto" in last:
        return "Prefiero que te lo cuente una persona en una llamada. ¿Te va bien que te contacten?"
    return "¡Claro! ¿Te va mejor por la mañana o por la tarde?"


# ---------------------------------------------------------------------------
# The output guard is the non-negotiable floor
# ---------------------------------------------------------------------------


async def test_guard_blocks_an_invented_price() -> None:
    agent = MuskAgent(
        content=APPROVED_CONTENT,
        provider=MockProvider("Vale, la formación cuesta 500 euros al mes."),
        lead=LEAD,
    )
    result = await agent.run_turn("¿cuánto cuesta?")

    assert "500" not in result.reply
    assert "euros" not in result.reply
    assert result.reply == build_reply("doubt")
    assert len(result.rule_violations) > 0
    assert "¿cuánto cuesta?" in agent.doubts


async def test_guard_blocks_a_job_promise() -> None:
    agent = MuskAgent(
        content=APPROVED_CONTENT,
        provider=MockProvider("Te garantizamos trabajo al terminar."),
        lead=LEAD,
    )
    result = await agent.run_turn("¿me conseguiréis trabajo?")

    assert result.reply == build_reply("doubt")
    assert not re.search(r"garantiz", result.reply, re.IGNORECASE)


async def test_a_clean_reply_passes_through_untouched() -> None:
    agent = MuskAgent(
        content=APPROVED_CONTENT,
        provider=MockProvider("Claro, te cuento. ¿Qué es lo que más te frena?"),
        lead=LEAD,
    )
    result = await agent.run_turn("tengo dudas")

    assert result.reply == "Claro, te cuento. ¿Qué es lo que más te frena?"
    assert result.rule_violations == ()


# ---------------------------------------------------------------------------
# Rule 7: stop
# ---------------------------------------------------------------------------


async def test_stop_registers_no_continuar() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    result = await agent.run_turn("no me escribas más, por favor")

    assert result.action == "stop"
    assert result.registered_no_continuar is True
    assert agent.is_stopped is True
    assert "no continuar" in result.reply


async def test_a_later_turn_is_suppressed() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    await agent.run_turn("para de escribirme")
    result = await agent.run_turn("hola")
    assert result.suppressed is True
    assert result.reply == ""


# ---------------------------------------------------------------------------
# Rule 9: handoff
# ---------------------------------------------------------------------------


async def test_handoff_fires_human_requested() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    result = await agent.run_turn("quiero hablar con una persona")

    assert result.action == "handoff"
    assert result.handoff is not None
    assert result.handoff.reason == "human_requested"
    assert result.handoff.recipient == "Laura"


async def test_handoff_fires_call_accepted_on_phone() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    result = await agent.run_turn("llámame al 612 345 678")

    assert result.action == "handoff"
    assert result.handoff is not None
    assert result.handoff.reason == "call_accepted"


async def test_handoff_fires_call_accepted_after_a_proposal() -> None:
    agent = MuskAgent(
        content=APPROVED_CONTENT, provider=MockProvider(_propose_then_answer), lead=LEAD
    )

    await agent.run_turn("¿cuánto cuesta?")
    result = await agent.run_turn("el martes a las 18:00 me viene bien")

    assert result.action == "handoff"
    assert result.handoff is not None
    assert result.handoff.reason == "call_accepted"


async def test_no_handoff_before_any_proposal() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    result = await agent.run_turn("me viene bien")
    assert result.action != "handoff"


# ---------------------------------------------------------------------------
# RAG grounding
# ---------------------------------------------------------------------------


async def test_model_receives_the_retrieved_passage() -> None:
    provider = MockProvider("Perfecto, te cuento. ¿Qué más te gustaría saber?")
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    await agent.run_turn("¿qué se aprende en python?")

    system = provider.calls[0].system if provider.calls else ""
    assert "Django" in system
    assert "pandas" in system
    assert any(record.kind == "kb" for record in agent.records)


async def test_system_prompt_carries_safety_and_call_steering() -> None:
    provider = MockProvider("Claro. ¿Te va bien que te contacte el equipo?")
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    await agent.run_turn("hola")

    system = provider.calls[0].system if provider.calls else ""
    assert re.search(r"NUNCA des precios", system, re.IGNORECASE)
    assert re.search(r"UNA sola pregunta", system, re.IGNORECASE)
    assert re.search(r"lleva la conversación hacia la llamada", system, re.IGNORECASE)
    assert re.search(r"agendar una llamada", system, re.IGNORECASE)


async def test_model_reads_the_thread() -> None:
    provider = MockProvider("Entiendo. ¿Y qué horario te encaja?")
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    await agent.run_turn("trabajo en administración")
    await agent.run_turn("me da miedo quedarme atrás")

    messages = provider.calls[1].messages if len(provider.calls) > 1 else ()
    assert any(m.content == "trabajo en administración" for m in messages)


# ---------------------------------------------------------------------------
# Deterministic fallback (no provider)
# ---------------------------------------------------------------------------


async def test_deterministic_answers_a_kb_question_with_a_call_question() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    result = await agent.run_turn("¿me dan certificado de la UE?")

    assert result.intent == "conversation"
    assert _passage("kb-certificacion-arp") in result.reply
    assert result.reply.rstrip().endswith("?")
    assert result.registered_doubts == ()


async def test_deterministic_steers_to_the_call_not_an_interest_question() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    result = await agent.run_turn("¿me dan certificado de la UE?")

    assert "llamada" in result.reply
    assert "te cuente algo más" not in result.reply


async def test_deterministic_registers_a_doubt_when_nothing_answers() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    result = await agent.run_turn("¿me mandáis un informe en pdf?")

    assert result.reply == build_reply("doubt")
    assert len(agent.doubts) == 1


# ---------------------------------------------------------------------------
# The opening is warm and guarded
# ---------------------------------------------------------------------------


def test_opening_is_truthy_guarded_and_ends_with_a_question() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    opening = agent.opening()
    assert opening
    assert guard_reply(opening).ok is True
    assert opening.rstrip().endswith("?")


# ---------------------------------------------------------------------------
# Regressions found in the live transcript
# ---------------------------------------------------------------------------


def test_honest_denial_of_a_guarantee_passes_the_guard() -> None:
    assert guard_reply("No garantizamos un puesto de trabajo al terminar.").ok is True
    assert guard_reply("Sin garantizar empleo, pero te acompañamos.").ok is True
    assert guard_reply("Te garantizamos un puesto de trabajo.").ok is False


async def test_strips_markdown_for_whatsapp() -> None:
    provider = MockProvider("**Programación**\n- Python\n- Front End\n\n¿Cuál te llama más?")
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    result = await agent.run_turn("¿qué formación tenéis?")

    assert "**" not in result.reply
    assert not re.search(r"^\s*[-*•]\s", result.reply, re.MULTILINE)
    assert "Programación" in result.reply
    assert "Python" in result.reply


async def test_never_ships_chained_questions() -> None:
    provider = MockProvider(
        "Tenemos Python, Front End y Back End. ¿Cuál te llama más? Entiendo. ¿Te paso con el equipo en una llamada?"
    )
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    result = await agent.run_turn("¿qué formación tenéis?")

    assert result.reply.count("?") <= 1
    assert "llamada" in result.reply
    assert "Cuál te llama" not in result.reply


async def test_always_gives_the_school_overview_for_a_short_question() -> None:
    provider = MockProvider("Tenemos varias. ¿Qué te interesa más?")
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    await agent.run_turn("¿qué formación?")

    assert _passage("kb-escuela") in provider.calls[0].system


async def test_si_cuentame_mas_is_not_the_doubt_template() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    result = await agent.run_turn("sí, cuéntame más")

    assert result.reply != build_reply("doubt")
    assert result.reply.rstrip().endswith("?")
    assert len(agent.doubts) == 0


async def test_reports_the_doubts_registered_in_the_turn() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    result = await agent.run_turn("¿me mandáis un informe en pdf?")

    assert result.reply == build_reply("doubt")
    assert result.registered_doubts == ("¿me mandáis un informe en pdf?",)


async def test_seeds_the_opening_into_the_thread() -> None:
    provider = MockProvider("Bien, ¿y qué te gustaría saber?")
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    opening = agent.opening()
    await agent.run_turn("bien")

    messages = provider.calls[0].messages if provider.calls else ()
    assert any(m.role == "assistant" and m.content == opening for m in messages)
    assert any(m.role == "user" and m.content == "bien" for m in messages)


async def test_deterministic_never_echoes_a_weakly_matched_passage() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=None, lead=LEAD)
    result = await agent.run_turn("¿cómo funciona la formación?")

    assert _passage("kb-obj-no-tiempo") not in result.reply
    assert "Tiene sentido" not in result.reply


# ---------------------------------------------------------------------------
# Miguel's rule: after every question, answer and recommend the call
# ---------------------------------------------------------------------------


async def test_appends_the_call_invitation_after_a_plain_statement() -> None:
    provider = MockProvider("Python se usa mucho en análisis de datos.")
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    result = await agent.run_turn("¿qué se aprende en python?")

    assert "Python se usa mucho" in result.reply
    assert re.search(r"llamada", result.reply)
    assert result.reply.count("?") == 1
    assert result.reply.rstrip().endswith("?")


async def test_replaces_an_interest_question_with_the_call_question() -> None:
    provider = MockProvider("Tenemos Python y Front End. ¿Cuál te interesa más?")
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    result = await agent.run_turn("¿qué formación tenéis?")

    assert "Tenemos Python y Front End" in result.reply
    assert "Cuál te interesa" not in result.reply
    assert re.search(r"llamada", result.reply)
    assert result.reply.count("?") == 1


async def test_leaves_a_reply_that_already_proposes_the_call_untouched() -> None:
    reply = "Sí, hay opciones de financiación y dos años flexibles. ¿Te va bien que te llamemos?"
    agent = MuskAgent(content=APPROVED_CONTENT, provider=MockProvider(reply), lead=LEAD)
    result = await agent.run_turn("¿hay financiación?")

    assert result.reply == reply


async def test_rotates_the_call_phrasing_across_consecutive_questions() -> None:
    agent = MuskAgent(
        content=APPROVED_CONTENT, provider=MockProvider("Te lo cuento con calma."), lead=LEAD
    )
    first = await agent.run_turn("¿qué es Escuela Musk?")
    second = await agent.run_turn("¿cómo es la metodología?")

    assert first.reply != second.reply
    assert re.search(r"llamada", first.reply)
    assert re.search(r"llamada", second.reply)


async def test_never_invents_an_address_for_an_off_topic_question() -> None:
    provider = MockProvider("Esa información no la tengo aquí, te la confirman por teléfono.")
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    result = await agent.run_turn("¿en qué calle estáis?")

    assert not re.search(r"calle\s+[a-záéíóú]", result.reply, re.IGNORECASE)
    assert re.search(r"llamada", result.reply)
    assert result.reply.rstrip().endswith("?")


async def test_does_not_force_the_call_on_a_plain_statement_from_the_lead() -> None:
    reply = "Perfecto, lo dejamos así."
    agent = MuskAgent(content=APPROVED_CONTENT, provider=MockProvider(reply), lead=LEAD)
    result = await agent.run_turn("me lo pienso y te digo")

    assert result.reply == reply


async def test_prompt_carries_the_after_every_question_rule() -> None:
    provider = MockProvider("Claro.")
    agent = MuskAgent(content=APPROVED_CONTENT, provider=provider, lead=LEAD)
    await agent.run_turn("¿qué tal?")

    assert re.search(r"Después de CADA pregunta", provider.calls[0].system, re.IGNORECASE)


# ---------------------------------------------------------------------------
# Catalogue fallback when the model cannot answer
# ---------------------------------------------------------------------------


async def test_answers_the_catalogue_when_the_provider_returns_nothing() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=MockProvider(""), lead=LEAD)
    result = await agent.run_turn("¿qué ofrecéis exactamente?")

    assert "Python" in result.reply
    assert "Full Stack" in result.reply
    assert re.search(r"llamada", result.reply)
    assert result.registered_doubts == ()
    assert agent.doubts == []


async def test_answers_the_catalogue_when_the_provider_throws() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=MockProvider(_network_down), lead=LEAD)
    result = await agent.run_turn("¿qué cursos tenéis?")

    assert "Python" in result.reply
    assert result.rule_violations == ()
    assert agent.doubts == []


async def test_answers_the_catalogue_when_the_reply_is_rejected_by_the_guard() -> None:
    agent = MuskAgent(
        content=APPROVED_CONTENT,
        provider=MockProvider("Te garantizamos trabajo al terminar."),
        lead=LEAD,
    )
    result = await agent.run_turn("¿qué ofrecéis?")

    assert "Python" in result.reply
    assert "garantiz" not in result.reply
    assert len(result.rule_violations) > 0
    assert agent.doubts == []


async def test_answers_the_catalogue_when_a_rejected_reply_follows_an_info_request() -> None:
    """A model that drops a percentage must not turn a course question into a doubt."""
    agent = MuskAgent(
        content=APPROVED_CONTENT,
        provider=MockProvider("El 100% de nuestros alumnos encuentra trabajo."),
        lead=LEAD,
    )
    result = await agent.run_turn("Bien, dame información de los cursos")

    assert "Python" in result.reply
    assert "Full Stack" in result.reply
    assert len(result.rule_violations) > 0
    assert agent.doubts == []


async def test_answers_the_catalogue_when_asked_about_the_training_informally() -> None:
    agent = MuskAgent(
        content=APPROVED_CONTENT,
        provider=MockProvider("Tenemos un 90% de práctica."),
        lead=LEAD,
    )
    result = await agent.run_turn("háblame de la formación")

    assert "Python" in result.reply
    assert len(result.rule_violations) > 0
    assert agent.doubts == []


async def test_never_uses_the_catalogue_for_a_price_question() -> None:
    agent = MuskAgent(
        content=APPROVED_CONTENT, provider=MockProvider("Son 500 euros al mes."), lead=LEAD
    )
    result = await agent.run_turn("¿cuánto cuestan los cursos?")

    assert result.reply == build_reply("doubt")
    assert "Python" not in result.reply


async def test_still_escalates_a_question_the_base_cannot_answer() -> None:
    agent = MuskAgent(content=APPROVED_CONTENT, provider=MockProvider(""), lead=LEAD)
    result = await agent.run_turn("¿tenéis wifi en clase?")

    assert result.reply == build_reply("doubt")
    assert agent.doubts == ["¿tenéis wifi en clase?"]
