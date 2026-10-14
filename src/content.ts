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
  faq: [
    {
      id: 'modalidad',
      keywords: ['modalidad', 'online', 'clases', 'horario', 'directo', 'workshops', 'sede', 'presencial'],
      answer:
        'La formación es online, con clases en directo y workshops, además de recursos y una comunidad de desarrollo. Los detalles de horarios y disponibilidad los concretamos contigo en una llamada.',
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
