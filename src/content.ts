// Approved-content model for the ONE formation under validation.
//
// Pilot formation: "Curso de Desarrollo Full Stack" (chosen with NIC/MUSK as the
// most in-demand profile). Curated from MUSK's own official FullStack dossier:
// per AGENTS.md and the MVP spec we SELECT the content and EXCLUDE prices/amounts
// and the detailed syllabus (hard rules 1, 2 and 10). Final wording sign-off with
// MUSK is still pending for the items marked TODO(decisión).
//
// Schema guard: this model intentionally has NO price/amount fields and NO
// syllabus/temario field (hard rules 1, 2 and 10). Do not add them.
//
// Hard-rule guard: every lead-facing string here must pass rules.guardReply
// (no currency, no percentages, no "módulo N", no promotions, no job promises).

export interface FaqEntry {
  id: string;
  keywords: string[];
  answer: string;
}

export interface QualificationQuestion {
  id: string;
  text: string;
  purpose: string;
}

export interface ApprovedContent {
  formationName: string;
  generalDescription: string;
  skills: string[];
  outcomes: string[];
  methodology: string;
  // Presentation of MUSK (the company) for the lead. The MVP spec requires it as
  // a minimum content item (§3.6 "presentación de MUSK y metodología"), but MUSK
  // has not provided it yet (§8.1 "información básica de MUSK"). While it is a
  // TODO(decisión) placeholder it is NEVER sent and never quoted (rule 4); it is
  // reported through MuskAgent.pendingDecisions so the gap stays visible.
  companyPresentation: string;
  faq: FaqEntry[];
  qualificationQuestions: QualificationQuestion[];
  initialMessage: string;
}

// A decision that is still open with MUSK is stored as a "TODO(decisión)"
// placeholder (see the header comment and AGENTS.md "Decisiones abiertas").
// A placeholder is NOT lead-facing content (rule 4): the agent must never send
// it to the lead, nor quote it. Use isPendingDecision() to tell a real value
// apart from a placeholder before showing one.
export const PENDING_DECISION_PATTERN = /^\s*TODO\s*\(\s*decisi[oó]n\s*\)/i;

export function isPendingDecision(value: string): boolean {
  return PENDING_DECISION_PATTERN.test(value);
}

export const APPROVED_CONTENT: ApprovedContent = {
  formationName: 'Curso de Desarrollo Full Stack',
  generalDescription:
    'El desarrollo Full Stack es un perfil muy demandado en el sector tecnológico por su versatilidad: te forma para crear aplicaciones web completas, desde la parte visual (front end) hasta la lógica del servidor (back end). No necesitas conocimientos previos: la metodología es progresiva y práctica desde el primer día.',
  skills: [
    'Desarrollo web (front end y back end)',
    'Diseño de interfaces (UI/UX)',
    'Integración de APIs',
    'Gestión de bases de datos',
    'Despliegue en la nube',
    'Inteligencia artificial aplicada al desarrollo',
  ],
  outcomes: [
    'Full Stack Developer',
    'Frontend Developer',
    'Backend Developer',
    'UX/UI Designer',
    'API Developer',
    'QA Engineer',
    'Cloud Support Engineer',
    'Desarrollo y mantenimiento web',
  ],
  methodology:
    'Método práctico y gamificado (aprender haciendo): retos, quizzes y puzzles de lógica, acompañamiento continuo del equipo docente con, como mínimo, una tutoría semanal, clases en directo y workshops, comunidad de desarrollo y orientación para la empleabilidad, con prácticas en empresas colaboradoras.',
  companyPresentation:
    'TODO(decisión): presentación de MUSK (qué es la empresa, su equipo y su propuesta) — pendiente de Nicolas; la spec §3.6 la exige como contenido mínimo y §8.1 la lista como información a aportar',
  // FAQ = routing table from a lead message to ALREADY-APPROVED content.
  //
  // Order is significant: findApprovedAnswer() returns the FIRST entry whose
  // keyword is contained in the folded message, so entries go from most specific
  // to most general — the broad 'informacion' entry is deliberately LAST, so a
  // specific topic ("...sobre tutorías", "...sobre salidas") always wins over it.
  //
  // Forbidden topics (price, syllabus, financing) are classified BEFORE the FAQ
  // is consulted (intent.ts classify order), so no keyword here can steal them.
  // Every answer is composed only from approved fields of this profile and must
  // pass rules.guardReply — no amounts, no percentages, no module numbers, no
  // promotions and no employment promises (rules 1-4, 6).
  faq: [
    {
      // "sobre MUSK" / "qué es MUSK" / "quiénes sois". MUSK's own presentation
      // is still a pending decision (see companyPresentation above), so this
      // answer stays safe: identity + formation + human, nothing invented.
      id: 'sobre-musk',
      keywords: [
        'sobre musk',
        'que es musk',
        'quienes sois',
        'quien sois',
        'vuestra empresa',
        'sois musk',
        'que haceis',
        'quien esta detras',
      ],
      answer:
        'Te escribimos desde MUSK Technologies. Por aquí puedo contarte todo sobre el Curso de Desarrollo Full Stack: en qué consiste, qué habilidades trabajas y qué salidas tiene. Cualquier detalle sobre MUSK o el equipo te lo confirma una persona cuando quieras.',
    },
    {
      // Methodology BEFORE 'modalidad': both mention classes, so "cómo son las
      // clases" must reach methodology, not the broader modality entry.
      id: 'metodologia',
      keywords: [
        'metodologia',
        'como se aprende',
        'como son las clases',
        'como funciona',
        'como es el curso',
        'como se estudia',
        'practicas',
        'gamificado',
        'aprender haciendo',
      ],
      answer:
        'Se aprende haciendo: retos, quizzes y puzzles de lógica en un método práctico y gamificado, con acompañamiento continuo del equipo docente, al menos una tutoría semanal, clases en directo y workshops, comunidad de desarrollo y orientación para la empleabilidad.',
    },
    {
      id: 'acompanamiento',
      keywords: ['tutorias', 'acompanamiento', 'tutor', 'profesor', 'docente', 'apoyo'],
      answer:
        'Cuentas con acompañamiento continuo del equipo docente y, como mínimo, una tutoría semanal para resolver dudas, además de comunidad, workshops y recursos adicionales.',
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
        'requisitos',
      ],
      answer:
        'No necesitas conocimientos previos: la metodología es progresiva y práctica, pensada para empezar desde la base.',
    },
    {
      id: 'modalidad',
      keywords: ['modalidad', 'online', 'clases', 'horario', 'directo', 'workshops', 'sede', 'presencial'],
      answer:
        'La formación es online, con clases en directo y workshops, además de recursos y una comunidad de desarrollo. Los detalles de horarios y disponibilidad los concretamos contigo en una llamada.',
    },
    {
      // Rule 2 allows general content, skills and outcomes: the "what will I
      // learn" route to the approved skills list.
      id: 'contenido',
      keywords: ['que aprendo', 'que voy a aprender', 'habilidades', 'contenidos', 'que enseña', 'que ensenais'],
      answer:
        'Trabajas desarrollo web (front end y back end), diseño de interfaces (UI/UX), integración de APIs, gestión de bases de datos, despliegue en la nube e inteligencia artificial aplicada al desarrollo.',
    },
    {
      // Outcomes are approved content (rule 2), but employment is never promised
      // (rule 4): the answer states professional paths, not a guaranteed job.
      id: 'salidas',
      keywords: ['salidas', 'que salidas', 'salidas profesionales', 'de que puedo trabajar', 'empleabilidad'],
      answer:
        'La formación apunta a perfiles como Full Stack Developer, Frontend Developer, Backend Developer, UX/UI Designer, API Developer, QA Engineer o Cloud Support Engineer. Son salidas que se trabajan durante el curso; el encaje concreto lo ves con el equipo en una llamada.',
    },
    {
      // Duration has no approved answer yet (spec §3.3 escalation topic), so the
      // agent says so honestly and refers to the call instead of inventing.
      id: 'duracion',
      keywords: [
        'cuanto dura',
        'duracion',
        'cuanto tiempo',
        'cuantos meses',
        'cuantas semanas',
        'cuando empieza',
        'cuando empiezo',
        'fecha de inicio',
      ],
      answer:
        'La duración, el calendario y las fechas de inicio los concretamos contigo en una llamada, para ajustarlo a tu punto de partida. Por aquí no puedo darte cifras.',
    },
    {
      // Broadest entry, deliberately last: any "quiero más información" reaches
      // the approved general description, never an invented answer.
      id: 'informacion',
      keywords: [
        'informacion',
        'mas informacion',
        'dame informacion',
        'quiero informacion',
        'de que va',
        'en que consiste',
        'sobre el curso',
        'sobre la formacion',
        'cuentame mas',
        'mas detalles',
      ],
      answer:
        'Claro. El Curso de Desarrollo Full Stack te forma para crear aplicaciones web completas, desde la parte visual (front end) hasta la lógica del servidor (back end), y puedes empezar sin conocimientos previos: la metodología es progresiva y práctica desde el primer día. Si quieres, te cuento las habilidades y las salidas, o lo vemos con detalle en una llamada sin compromiso.',
    },
  ],
  qualificationQuestions: [
    {
      id: 'starting-experience',
      text: 'TODO(decisión): pregunta de cualificación — experiencia de partida (propuesta, no cerrada con Nicolas)',
      purpose: 'Brief qualification only: no exam, no scoring, no automatic exclusion.',
    },
    {
      id: 'time-interest',
      text: 'TODO(decisión): pregunta de cualificación — tiempo de interés (propuesta, no cerrada con Nicolas)',
      purpose: 'Brief qualification only: no exam, no scoring, no automatic exclusion.',
    },
  ],
  initialMessage: 'TODO(decisión): texto del mensaje inicial por definir con Nicolas',
};
