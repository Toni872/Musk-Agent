// Approved-content model for MUSK's conversational lead-capture flow.
//
// SINGLE UNIFIED PROFILE. There is no demo/real split any more: this is the one
// profile the harness, the UI and the evaluation run. It keeps the full catalogue
// behaviour that used to live in the demo profile (both qualification copy and
// the deterministic knowledge base) and drops nothing the pilot needs.
//
// Content provenance: curated from MUSK's own dossier and the copy drafted in
// docs/matriz-validacion-cursos.md. Final wording sign-off with MUSK is still
// pending for the whole profile: nothing here is a price, an amount, a payment
// condition or a detailed syllabus (hard rules 1, 2, 3 and 10).
//
// Schema guard: this model has no numeric price/amount data and NO
// syllabus/temario field (hard rules 1, 2 and 10).
//
// Hard-rule guard: every lead-facing string here must pass rules.guardReply
// (no currency, no percentages, no "módulo N", no promotions, no guarantees and
// no job promises). A lead-facing "garantizado" is a rule 4 violation.
//
// A decision that is still open with MUSK is stored as a "TODO(decisión)"
// placeholder and is NEVER sent (rule 4): use isPendingDecision() to tell a real
// value apart from a placeholder before showing one. There are no placeholders
// left in this profile today; the guard stays for future gaps.

import { KB_PASSAGES, type KbPassage } from './kb';

export interface FaqEntry {
  id: string;
  keywords: string[];
  // Terms that veto the entry even when a keyword matches. Needed for the
  // generic entries: "¿qué salidas tiene videojuegos?" names a specific
  // programme, so the generic 'salidas' answer must stand aside and let the
  // knowledge base answer about THAT programme (otherwise the lead is told the
  // outcomes of a course they did not ask about).
  avoidKeywords?: string[];
  answer: string;
}

export interface QualificationReaction {
  // What the lead's own words are matched against (normalized, accent-folded).
  keywords: string[];
  // Optional negations that prevent a keyword mention from being read as a
  // positive selection (also normalized, accent-folded).
  avoidKeywords?: string[];
  // Short reply to THAT answer (rule 11: MUSK copy). Its job is to make the next
  // question read as a conversation instead of a form. Every reaction is
  // answer-specific on purpose: one fixed courtesy line repeated on every answer
  // is the robot tell the engine avoids (see MuskAgent.receiveAnswer).
  say: string;
}

export interface QualificationQuestion {
  id: string;
  text: string;
  purpose: string;
  // Optional per-answer reactions: first keyword match wins. No match means no
  // reaction, which is the safe default (silence beats filler).
  reactions?: QualificationReaction[];
}

export interface ApprovedContent {
  formationName: string;
  generalDescription: string;
  skills: string[];
  outcomes: string[];
  methodology: string;
  // Presentation of Escuela Musk (the company) for the lead. Lead-facing: it is
  // part of the LLM grounding source, so it must stay free of prices, syllabus
  // detail and promises.
  companyPresentation: string;
  faq: FaqEntry[];
  qualificationQuestions: QualificationQuestion[];
  initialMessage: string;
  // Lead-facing close used once the qualification runs out and the agent asks
  // for the call. When it is missing or still a TODO(decisión), the agent falls
  // back to the sentence already approved for that moment
  // (REPLY_TEMPLATES.callProposal), so a profile can sharpen the close without
  // inventing copy at runtime (rule 11).
  closingInvitation?: string;
  // Operator-approved, profile-configurable copy for guarded commercial intents.
  // These are complete responses, not amounts or payment-condition data; every
  // emitted value is still checked by guardReply (rules 1, 3, 4 and 11).
  priceReply?: string;
  financingReply?: string;
  // Simulation target for the handoff notice. This does not send a real message.
  handoffRecipient?: string;
  // Profile-specific second acknowledgement of a rule-5 doubt, used when the
  // same doubt reply would be sent twice in a row. It is NEVER sent unless the
  // profile provides it: a profile without it falls back to the bare approved
  // invitation, so no unapproved copy reaches the lead (rules 4, 11).
  doubtFollowup?: string;
  // Knowledge base for the deterministic retrieval layer (src/retrieval.ts). A
  // matched passage is the only approved source for a knowledge-base answer;
  // the optional guarded rephrase uses that answer, and deterministic mode
  // sends it verbatim. This answers questions about one specific programme
  // ("¿qué se aprende en Python?").
  kb?: KbPassage[];
}

export const PENDING_DECISION_PATTERN = /^\s*TODO\s*\(\s*decisi[oó]n\s*\)/i;

export function isPendingDecision(value: string): boolean {
  return PENDING_DECISION_PATTERN.test(value);
}

// A specific programme named by the lead. The generic FAQ entries must not
// answer a question about ONE programme, or "¿qué salidas tiene videojuegos?"
// is answered with the outcomes of another course. Kept next to the entries it
// protects so the two cannot drift.
// The programmes the pilot presents. Also used as a veto list by the generic
// FAQ entries and by `mentionsProgramme` in the intent layer, because naming a
// course is what turns a generic question ("¿en qué consiste?") into a question
// about that course.
export const PROGRAMME_NAMES = [
  'python',
  'front end',
  'frontend',
  'back end',
  'backend',
  'full stack',
  'fullstack',
  'videojuegos',
  'videojuego',
  'juegos',
  'master',
];

// True when the lead names a programme in the message. Expects the folded form
// (normalizeEs), same as findApprovedAnswer. Kept here, next to the list, so the
// intent layer does not need to know how a programme is spelled.
export function mentionsProgramme(foldedMessage: string): boolean {
  return PROGRAMME_NAMES.some((name) => foldedMessage.includes(name));
}


export const APPROVED_CONTENT: ApprovedContent = {
  // Neutral on purpose: the pilot covers a catalogue of five programmes, so a
  // single course name here would be wrong for most leads. It is operator-facing
  // (the commercial summary), never used as a lead-facing programme claim.
  formationName: 'Formación tecnológica de Escuela Musk',
  generalDescription:
    'Una formación práctica y acompañada para dar el salto profesional en el sector tecnológico, trabajando por proyectos reales desde el primer día.',
  skills: [
    'Fundamentos sólidos de programación',
    'Trabajo por proyectos con metodologías ágiles',
    'Resolución de problemas reales en equipo',
  ],
  outcomes: [
    'Perfiles junior preparados para incorporarse a un equipo real',
    'Un portafolio de proyectos propios',
    'Base sólida para especializarte en el área que elijas',
  ],
  methodology:
    'Clases en directo, tutorías y proyectos guiados, con acompañamiento durante todo el programa.',
  companyPresentation:
    'Escuela Musk es la escuela de formación tecnológica que imparte esta formación, con un método práctico y acompañado.',
  priceReply:
    'No puedo compartir precios por aquí. Sí hay opciones de financiación y tienes dos años para completar la formación con flexibilidad. El equipo te lo explica en una llamada.',
  financingReply:
    'Sí, hay opciones de financiación. Tienes dos años para completar la formación con flexibilidad. El equipo puede explicarte las opciones en una llamada.',
  // Simulated notification destination only; no WhatsApp message is sent.
  handoffRecipient: 'Laura',
  // Same specific-to-general order as before: findApprovedAnswer() returns the
  // FIRST keyword match, so the broad 'informacion' entry is last.
  faq: [
    {
      id: 'sobre-musk',
      keywords: [
        'sobre musk',
        'sobre escuela musk',
        'escuela musk',
        'que es musk',
        'que es escuela musk',
        'quienes sois',
        'quien sois',
        'quien esta detras',
        'vuestra empresa',
        'sois musk',
        'que haceis',
        'hablame de musk',
        'cuentame sobre musk',
      ],
      answer:
        'Te escribimos desde Escuela Musk. Por aquí puedo contarte todo sobre la formación: en qué consiste, qué se trabaja y qué salidas tiene. Cualquier detalle sobre el equipo te lo confirma una persona cuando quieras.',
    },
    {
      id: 'metodologia',
      keywords: [
        'metodologia',
        'como se aprende',
        'como son las clases',
        'como funciona',
        'como es el curso',
        'como se estudia',
        'gamificado',
        'aprender haciendo',
      ],
      answer:
        'Se aprende con proyectos guiados y clases en directo, con acompañamiento y tutorías durante todo el programa.',
    },
    {
      // The one word that used to be missing: "¿tendré un tutor?" fell through
      // to the doubt path because only "tutorías" was listed.
      id: 'acompanamiento',
      keywords: ['tutor', 'tutorias', 'acompanamiento', 'profesor', 'docente', 'apoyo'],
      answer:
        'Tienes tutorías personalizadas y acompañamiento continuo: siempre hay alguien del equipo para resolver tus dudas.',
    },
    {
      id: 'requisitos',
      keywords: [
        'experiencia previa',
        'conocimientos previos',
        'desde cero',
        'principiante',
        'sin experiencia',
        'necesito saber',
        'saber programar',
        'ni idea de programar',
        'requisitos',
      ],
      answer:
        'No necesitas conocimientos previos: la metodología es progresiva y práctica, pensada para empezar desde la base.',
    },
    {
      id: 'contenido',
      // A question about ONE programme belongs to the knowledge base: the
      // generic skills answer would be answering about the wrong course.
      avoidKeywords: PROGRAMME_NAMES,
      keywords: ['que aprendo', 'que voy a aprender', 'habilidades', 'contenidos', 'que enseña'],
      answer:
        'Trabajas fundamentos sólidos de programación, proyectos con metodologías ágiles y resolución de problemas reales en equipo.',
    },
    {
      id: 'salidas',
      // Same veto as 'contenido': "¿salidas de videojuegos?" must be answered
      // about videojuegos (kb-videojuegos-salidas), not with this general line.
      avoidKeywords: PROGRAMME_NAMES,
      keywords: ['salidas', 'que salidas', 'de que puedo trabajar', 'que puedo trabajar', 'empleabilidad'],
      answer:
        'La formación prepara perfiles junior para incorporarse a un equipo real, construir su propio portafolio y especializarte en el área que elijas. El encaje concreto lo ves con el equipo.',
    },
    {
      // Why this entry exists: the deterministic knowledge base knows these
      // phrasings ("no se por donde empezar", "cual me conviene", "orientame"),
      // but BM25 cannot accept a query whose whole content reduces to ONE term
      // - the score stays around 3.08 and the 3.5 threshold refuses it. Result:
      // the lead asked for orientation and got the rule-5 doubt. The FAQ is the
      // curated catalogue layer, so it is the right place to answer, and the
      // calibrated retrieval thresholds are left untouched.
      id: 'orientacion',
      keywords: [
        'no se por donde empezar',
        'no se por donde tirar',
        'no se que estudiar',
        'no se que formacion estudiar',
        'estoy perdido',
        'estoy perdida',
        'orientadme',
        'me orienteis',
        'orientame',
        'cual me conviene',
        'cual encaja mejor',
        'cual me iria mejor',
        'que formacion me iria mejor',
        'cambio profesional',
        'cambiar de carrera',
        'cambio de carrera',
        'cambio de sector',
        'cambiar de sector',
        'reconversion profesional',
        'vida laboral',
        'ayuda para elegir',
      ],
      answer:
        'La elección depende de qué te atraiga: la lógica y los datos, la parte visual o crear juegos. Si me cuentas qué buscas, el equipo te orienta en una llamada.',
    },
    {
      id: 'modalidad',
      keywords: [
        'horario',
        'clases',
        'modalidad',
        'online',
        'presencial',
        'sede',
        'donde esta',
        'donde queda',
        'academia',
        'ubicacion',
        'direccion',
        'workshops',
      ],
      answer:
        'Todo es online: campus virtual, comunidad y tutores personales que te acompañan. No hay horarios fijos de conexión, así que puedes compaginarlo con tu rutina.',
    },
    {
      id: 'programacion',
      keywords: [
        'de que trata el de programacion',
        'de que trata el de programación',
        'de que trata la programacion',
        'curso de programacion',
        'curso de programación',
        'aprender a programar',
        'empezar a programar',
        'bases de programacion',
        'fundamentos de programacion'
      ],
      answer: 'El curso de programación está pensado para empezar desde cero. Aprendes fundamentos con proyectos prácticos, lógica y resolución de problemas. Puedes orientarte hacia Front End, Back End o Full Stack. El equipo te lo explica con más detalle en una llamada.'
    },
    {
      id: 'duracion',
      // A broad "cuánto tiempo" match would steal the specifically approved
      // completion-window question from the deterministic knowledge base.
      // "cuántos años" is spelled out on purpose: without it, "¿cuántos años
      // dura la formación?" reached the knowledge base and came back with the
      // "no tengo tiempo" objection passage - a confident answer to a question
      // nobody asked.
      keywords: [
        'cuanto dura',
        'duracion',
        'cuantos meses',
        'cuantas semanas',
        'cuantos anos',
      ],
      answer:
        'Tienes dos años para completarla con flexibilidad, a tu ritmo entre sesiones. El calendario y las fechas de inicio los concretamos contigo en una llamada. Por aquí no puedo darte cifras.',
    },
    {
      // Catalogue entry for the lead who has not chosen a programme yet. It
      // answers the *orientation* question, not a course question: it does not
      // rank programmes, does not list syllabus and does not price anything
      // (rules 1, 2 and 4). The answer deliberately carries no "?" because the
      // engine already asks the qualification question in the same turn
      // (src/outbound.ts); asking twice was a real demo defect.
      id: 'catalogo-formaciones',
      keywords: [
        'que cursos',
        'que formaciones',
        'catalogo',
        'que teneis',
        'que ofreceis',
        'que impartis',
        'que ensenais',
        'cursos hay',
        'formaciones hay',
        'cuentame sobre los cursos',
        'hablame de los cursos',
        'dame informacion sobre los cursos',
        'informacion sobre los cursos',
        'quiero informacion de los cursos',
        'quiero saber que cursos teneis',
      ],
      // Short on purpose: this is a lead-capture agent, not a brochure. The
      // full programme detail lives in the knowledge base, which the agent only
      // quotes when the lead asks for one specific programme.
      answer:
        'Cinco programas: Python, Front End, Back End, Full Stack y el máster de videojuegos. Todos online y desde cero, con IA en los de desarrollo y videojuegos.',
    },
    {
      id: 'informacion',
      keywords: [
        'informacion',
        'mas informacion',
        'dame informacion',
        'quiero informacion',
        // "en qué consiste" and "de qué va" carry no content word of their own
        // once the stopwords are removed, so the deterministic base cannot tell
        // which passage the lead means. This generic answer is the safe net for
        // those shapes: true, and it hands the detail to the call instead of
        // guessing a programme. The templates that DO carry a content word
        // ("de qué trata", "qué es el curso de", "de qué va el curso de",
        // "háblame de") are not listed here on purpose: they reach the
        // knowledge base and answer with the passage for the named programme.
        'en que consiste',
        'de que va',
        'explicame la formacion',
        'que es la formacion',
        'sobre el curso',
        'sobre la formacion',
        'cuentame mas',
        'cuentame',
        'mas sobre',
        'quiero saber mas',
        'dime mas',
        'mas detalles',
      ],
      answer:
        'Las formaciones son online y prácticas: aprendes con proyectos reales y acompañamiento. Hay programas de programación, videojuegos e IA; el equipo puede orientarte sobre cuál encaja contigo.',
    },
  ],
  qualificationQuestions: [
    {
      id: 'goal',
      text: 'Primero cuéntame qué buscas: si no encaja, te lo digo yo. ¿Tienes algo en mente?',
      purpose: 'A brief conversation prompt to understand the lead’s goal and move toward a call; not an exam or screening.',
      reactions: [
        // Course selections add ONE brief clause about what the programme is,
        // with the wording drafted in docs/matriz-validacion-cursos.md
        // ("Respuestas breves propuestas para el lead"). No digits, prices,
        // certificates, internship promises or syllabus detail (rules 1, 2, 4),
        // so the acknowledgement stays safe under guardReply.
        {
          keywords: ['python'],
          avoidKeywords: ['no me interesa', 'no quiero', 'no me gusta', 'no busco'],
          say: 'Entiendo, te interesa Python: programación con aplicaciones en software y análisis de datos.',
        },
        {
          keywords: ['front end', 'frontend'],
          avoidKeywords: ['no me interesa', 'no quiero', 'no me gusta', 'no busco'],
          say: 'Entiendo, te interesa Front End: diseño y desarrollo de interfaces web.',
        },
        {
          keywords: ['back end', 'backend'],
          avoidKeywords: ['no me interesa', 'no quiero', 'no me gusta', 'no busco'],
          say: 'Entiendo, te interesa Back End: la lógica del servidor, los datos y las APIs.',
        },
        {
          keywords: ['full stack'],
          avoidKeywords: ['no me interesa', 'no quiero', 'no me gusta', 'no busco'],
          say: 'Entiendo, te interesa Full Stack: la parte visual y la lógica de una aplicación web.',
        },
        {
          keywords: ['videojuegos', 'videojuego', 'crear juegos', 'crear videojuegos'],
          avoidKeywords: ['no me interesa', 'no quiero', 'no me gusta', 'no busco'],
          say: 'Entiendo, te interesa videojuegos: diseño y programación para crear experiencias interactivas.',
        },
        {
          keywords: ['optar a una plaza', 'plaza'],
          say: 'Entiendo: quieres ampliar conocimientos para optar a una plaza.',
        },
        {
          keywords: ['cambiar de sector', 'cambiar de trabajo'],
          say: 'Entiendo: buscas prepararte para cambiar de sector.',
        },
        {
          keywords: ['conocimientos', 'aprender'],
          say: 'Entiendo: quieres ampliar tus conocimientos en el área tecnológica.',
        },
      ],
    },
  ],
  // Short call-first wording, stored in the profile so it remains easy to revise.
  closingInvitation: '¿Qué día y a qué hora te viene bien que el equipo te llame?',
  // Profile-specific second acknowledgement of a rule-5 doubt (see
  // MuskAgent.neverRepeat): it lives here and not in the shared templates so the
  // wording can be revised without touching the engine.
  doubtFollowup:
    'Eso también lo anoto como duda para que te lo confirmen. Si te encaja, una persona del equipo te contacta y lo veis todo con calma. ¿Te viene bien?',
  // The knowledge base is what answers per-programme questions. It is filtered
  // by the output guard like every other answer, and no passage may contain a
  // figure (asserted by tests).
  kb: KB_PASSAGES,
  // The lead already interacted with MUSK, so the opening acknowledges that
  // ("retomo el contacto") instead of pretending this is a cold message. It asks
  // permission in the same breath as it lowers the pressure, and leaves exactly
  // one question for the lead to answer.
  initialMessage:
    'Hola, soy el asistente de Escuela Musk. Retomo el contacto sobre la formación. ¿Te pillo en buen momento? Si no, dímelo y no insisto. Si te interesa, te cuento en qué consiste y, si encaja, te paso con una persona del equipo, sin compromiso.',
};
