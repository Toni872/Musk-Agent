// Approved-content model for the ONE formation under validation.
// Stub values only: everything marked TODO(decisión) is an open decision per
// repository AGENTS.md and must not be presented as agreed with MUSK.
//
// Schema guard: this model intentionally has NO price/amount fields and NO
// syllabus/temario field (hard rules 1, 2 and 10). Do not add them.

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

export const APPROVED_CONTENT: ApprovedContent = {
  formationName: 'TODO(decisión): formación elegida por MUSK (pendiente de decisión)',
  generalDescription: 'TODO(decisión): descripción general aprobada de la formación (pendiente de decisión)',
  skills: ['TODO(decisión): habilidades aprobadas de la formación (pendiente de decisión)'],
  outcomes: ['TODO(decisión): salidas formativas aprobadas (pendiente de decisión)'],
  methodology: 'TODO(decisión): metodología y acompañamiento aprobados por MUSK (pendiente de decisión)',
  faq: [
    {
      id: 'modalidad',
      keywords: ['horario', 'clases', 'modalidad', 'online', 'presencial', 'sede'],
      answer: 'TODO(decisión): respuesta aprobada sobre modalidad y horario (pendiente de validación por Nicolas)',
    },
    {
      id: 'duracion',
      keywords: ['dura', 'duracion', 'cuanto dura', 'semanas', 'meses'],
      answer: 'TODO(decisión): respuesta aprobada sobre duración (pendiente de validación por Nicolas)',
    },
    {
      id: 'acompanamiento',
      keywords: ['tutorias', 'acompanamiento', 'profesor', 'apoyo'],
      answer: 'TODO(decisión): respuesta aprobada sobre tutorías y acompañamiento (pendiente de validación por Nicolas)',
    },
  ],
  qualificationQuestions: [
    {
      id: 'starting-experience',
      text: 'TODO(decisión): pregunta de cualificación — experiencia de partida (propuesta, no cerrada)',
      purpose: 'Brief qualification only: no exam, no scoring, no automatic exclusion.',
    },
    {
      id: 'time-interest',
      text: 'TODO(decisión): pregunta de cualificación — tiempo de interés (propuesta, no cerrada)',
      purpose: 'Brief qualification only: no exam, no scoring, no automatic exclusion.',
    },
  ],
  initialMessage: 'TODO(decisión): texto del mensaje inicial por definir con Nicolas',
};
