"""Approved-content model for MUSK's conversational lead-capture flow.

SINGLE UNIFIED PROFILE. There is no demo/real split any more: this is the one
profile the harness, the UI and the evaluation run. It keeps the full catalogue
behaviour (both qualification copy and the deterministic knowledge base).

Content provenance: curated from MUSK's own dossier and the copy drafted in
``docs/producto/matriz-validacion-cursos.md``. Final wording sign-off with MUSK
is still pending for the whole profile: nothing here is a price, an amount, a
payment condition or a detailed syllabus (hard rules 1, 2, 3 and 10).

Hard-rule guard: every lead-facing string here must pass ``app.rules.guard_reply``
(no currency, no percentages, no "módulo N", no promotions, no guarantees and no
job promises).

A decision still open with MUSK is stored as a ``TODO(decisión)`` placeholder
and is NEVER sent (rule 4): use :func:`is_pending_decision` to tell a real value
apart from a placeholder before showing one. There are no placeholders left in
this profile today; the guard stays for future gaps.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.kb import KB_PASSAGES, KbPassage


@dataclass(frozen=True)
class FaqEntry:
    id: str
    keywords: tuple[str, ...]
    answer: str
    # Terms that veto the entry even when a keyword matches. Needed for the
    # generic entries: "¿qué salidas tiene videojuegos?" names a specific
    # programme, so the generic 'salidas' answer must stand aside and let the
    # knowledge base answer about THAT programme.
    avoid_keywords: tuple[str, ...] | None = None


@dataclass(frozen=True)
class ApprovedContent:
    formation_name: str
    general_description: str
    skills: tuple[str, ...]
    outcomes: tuple[str, ...]
    methodology: str
    company_presentation: str
    faq: tuple[FaqEntry, ...]
    initial_message: str
    price_reply: str | None
    financing_reply: str | None
    handoff_recipient: str | None
    kb: tuple[KbPassage, ...] | None


PENDING_DECISION_PATTERN: re.Pattern[str] = re.compile(
    r"^\s*TODO\s*\(\s*decisi[oó]n\s*\)", re.IGNORECASE
)


def is_pending_decision(value: str) -> bool:
    """True when ``value`` is a ``TODO(decisión)`` placeholder, never to be sent."""
    return PENDING_DECISION_PATTERN.search(value) is not None


# A specific programme named by the lead. The generic FAQ entries must not
# answer a question about ONE programme, or "¿qué salidas tiene videojuegos?"
# is answered with the outcomes of another course. Kept next to the entries it
# protects so the two cannot drift.
PROGRAMME_NAMES: tuple[str, ...] = (
    "python",
    "front end",
    "frontend",
    "back end",
    "backend",
    "full stack",
    "fullstack",
    "videojuegos",
    "videojuego",
    "juegos",
    "master",
)


def mentions_programme(folded_message: str) -> bool:
    """True when the lead names a programme in the message (expects folded text)."""
    return any(name in folded_message for name in PROGRAMME_NAMES)


APPROVED_CONTENT: ApprovedContent = ApprovedContent(
    # Neutral on purpose: the pilot covers a catalogue of five programmes, so a
    # single course name here would be wrong for most leads. It is operator-facing
    # (the commercial summary), never used as a lead-facing programme claim.
    formation_name="Formación tecnológica de Escuela Musk",
    general_description="Una formación práctica y acompañada para dar el salto profesional en el sector tecnológico, trabajando por proyectos reales desde el primer día.",
    skills=(
        "Fundamentos sólidos de programación",
        "Trabajo por proyectos con metodologías ágiles",
        "Resolución de problemas reales en equipo",
    ),
    outcomes=(
        "Perfiles junior preparados para incorporarse a un equipo real",
        "Un portafolio de proyectos propios",
        "Base sólida para especializarte en el área que elijas",
    ),
    methodology="Clases en directo, tutorías y proyectos guiados, con acompañamiento durante todo el programa.",
    company_presentation="Escuela Musk es la escuela de formación tecnológica que imparte esta formación, con un método práctico y acompañado.",
    price_reply="El precio prefiero que te lo explique una persona. Sí hay opciones de financiación y dos años flexibles para completarla. Si quieres, te paso con el equipo y te lo cuenta en una llamada.",
    financing_reply="Sí, hay opciones de financiación. Tienes dos años para completar la formación con flexibilidad. El equipo puede explicarte las opciones en una llamada.",
    # Simulated notification destination only; no WhatsApp message is sent.
    handoff_recipient="Laura",
    # Same specific-to-general order as before: findApprovedAnswer() returns the
    # FIRST keyword match, so the broad 'informacion' entry is last.
    faq=(
        FaqEntry(
            id="sobre-musk",
            keywords=(
                "sobre musk",
                "sobre escuela musk",
                "escuela musk",
                "que es musk",
                "que es escuela musk",
                "quienes sois",
                "quien sois",
                "quien esta detras",
                "vuestra empresa",
                "sois musk",
                "que haceis",
                "hablame de musk",
                "cuentame sobre musk",
            ),
            answer="Te escribimos desde Escuela Musk. Por aquí puedo contarte todo sobre la formación: en qué consiste, qué se trabaja y qué salidas tiene. Cualquier detalle sobre el equipo te lo confirma una persona cuando quieras.",
        ),
        FaqEntry(
            id="metodologia",
            keywords=(
                "metodologia",
                "como se aprende",
                "como son las clases",
                "como funciona",
                "como es el curso",
                "como se estudia",
                "gamificado",
                "aprender haciendo",
            ),
            answer="Se aprende con proyectos guiados y clases en directo, con acompañamiento y tutorías durante todo el programa.",
        ),
        FaqEntry(
            id="acompanamiento",
            keywords=("tutor", "tutorias", "acompanamiento", "profesor", "docente", "apoyo"),
            answer="Tienes tutorías personalizadas y acompañamiento continuo: siempre hay alguien del equipo para resolver tus dudas.",
        ),
        FaqEntry(
            id="requisitos",
            keywords=(
                "experiencia previa",
                "conocimientos previos",
                "desde cero",
                "principiante",
                "sin experiencia",
                "necesito saber",
                "saber programar",
                "ni idea de programar",
                "requisitos",
            ),
            answer="No necesitas conocimientos previos: la metodología es progresiva y práctica, pensada para empezar desde la base.",
        ),
        FaqEntry(
            id="contenido",
            # A question about ONE programme belongs to the knowledge base: the
            # generic skills answer would be answering about the wrong course.
            avoid_keywords=PROGRAMME_NAMES,
            keywords=(
                "que aprendo",
                "que voy a aprender",
                "habilidades",
                "contenidos",
                "que enseña",
            ),
            answer="Trabajas fundamentos sólidos de programación, proyectos con metodologías ágiles y resolución de problemas reales en equipo.",
        ),
        FaqEntry(
            id="salidas",
            # Same veto as 'contenido': "¿salidas de videojuegos?" must be answered
            # about videojuegos (kb-videojuegos-salidas), not with this general line.
            avoid_keywords=PROGRAMME_NAMES,
            keywords=(
                "salidas",
                "que salidas",
                "de que puedo trabajar",
                "que puedo trabajar",
                "empleabilidad",
            ),
            answer="La formación prepara perfiles junior para incorporarse a un equipo real, construir su propio portafolio y especializarte en el área que elijas. El encaje concreto lo ves con el equipo.",
        ),
        FaqEntry(
            id="orientacion",
            keywords=(
                "no se por donde empezar",
                "no se por donde tirar",
                "no se que estudiar",
                "no se que formacion estudiar",
                "estoy perdido",
                "estoy perdida",
                "orientadme",
                "me orienteis",
                "orientame",
                "cual me conviene",
                "cual encaja mejor",
                "cual me iria mejor",
                "que formacion me iria mejor",
                "cambio profesional",
                "cambiar de carrera",
                "cambio de carrera",
                "cambio de sector",
                "cambiar de sector",
                "reconversion profesional",
                "vida laboral",
                "ayuda para elegir",
            ),
            answer="La elección depende de qué te atraiga: la lógica y los datos, la parte visual o crear juegos. Si me cuentas qué buscas, el equipo te orienta en una llamada.",
        ),
        FaqEntry(
            id="modalidad",
            keywords=(
                "horario",
                "clases",
                "modalidad",
                "online",
                "presencial",
                "sede",
                "donde esta",
                "donde queda",
                "academia",
                "ubicacion",
                "direccion",
                "workshops",
            ),
            answer="Todo es online: campus virtual, comunidad y tutores personales que te acompañan. No hay horarios fijos de conexión, así que puedes compaginarlo con tu rutina.",
        ),
        FaqEntry(
            id="programacion",
            keywords=(
                "de que trata el de programacion",
                "de que trata el de programación",
                "de que trata la programacion",
                "curso de programacion",
                "curso de programación",
                "aprender a programar",
                "empezar a programar",
                "bases de programacion",
                "fundamentos de programacion",
            ),
            answer="El curso de programación está pensado para empezar desde cero. Aprendes fundamentos con proyectos prácticos, lógica y resolución de problemas. Puedes orientarte hacia Front End, Back End o Full Stack. El equipo te lo explica con más detalle en una llamada.",
        ),
        FaqEntry(
            id="duracion",
            keywords=(
                "cuanto dura",
                "duracion",
                "cuantos meses",
                "cuantas semanas",
                "cuantos anos",
            ),
            answer="Tienes dos años para completarla con flexibilidad, a tu ritmo entre sesiones. El calendario y las fechas de inicio los concretamos contigo en una llamada. Por aquí no puedo darte cifras.",
        ),
        FaqEntry(
            id="catalogo-formaciones",
            keywords=(
                "que cursos",
                "que formaciones",
                "catalogo",
                "que teneis",
                "que ofreceis",
                "que impartis",
                "que ensenais",
                "cursos hay",
                "formaciones hay",
                "cuentame sobre los cursos",
                "hablame de los cursos",
                "dame informacion sobre los cursos",
                "informacion sobre los cursos",
                "quiero informacion de los cursos",
                "quiero saber que cursos teneis",
            ),
            answer="Cinco programas: Python, Front End, Back End, Full Stack y el máster de videojuegos. Todos online y desde cero, con IA en los de desarrollo y videojuegos.",
        ),
        FaqEntry(
            id="informacion",
            keywords=(
                "informacion",
                "mas informacion",
                "dame informacion",
                "quiero informacion",
                "en que consiste",
                "de que va",
                "explicame la formacion",
                "que es la formacion",
                "sobre el curso",
                "sobre la formacion",
                "cuentame mas",
                "cuentame",
                "mas sobre",
                "quiero saber mas",
                "dime mas",
                "mas detalles",
            ),
            answer="Las formaciones son online y prácticas: aprendes con proyectos reales y acompañamiento. Hay programas de programación, videojuegos e IA; el equipo puede orientarte sobre cuál encaja contigo.",
        ),
    ),
    # The knowledge base is what answers per-programme questions. It is filtered
    # by the output guard like every other answer, and no passage may contain a
    # figure (asserted by tests).
    kb=KB_PASSAGES,
    # The lead already interacted with MUSK, so the opening acknowledges that
    # ("retomo el contacto") instead of pretending this is a cold message.
    initial_message="Hola, soy el asistente de Escuela Musk. Te escribo sobre la formación, pero sin prisa: si ahora no es buen momento, me lo dices y hablamos otro día. ¿Cómo llevas la semana?",
)
