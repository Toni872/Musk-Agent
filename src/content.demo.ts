// DEMO sample content for the MUSK simulation harness — NOT approved by MUSK.
//
// Purpose: let the agent run a complete, coherent conversation during a live
// demo without the blocking TODO(decisión) stubs that APPROVED_CONTENT keeps on
// purpose (src/content.ts). This profile is loaded ONLY with `--demo` and is
// clearly labelled as a sample at runtime.
//
// It is NOT a decision taken with Nicolas: every value here is a proposal and
// must be replaced by APPROVED_CONTENT once MUSK decides formation, FAQ, initial
// message and qualification questions (AGENTS.md "decisiones abiertas").
//
// Schema guard kept: no price/amount fields and no syllabus/temario field, and
// no money text (hard rules 1, 2, 10).

import type { ApprovedContent } from './content';

export const DEMO_CONTENT: ApprovedContent = {
  formationName: 'Formación de especialización tecnológica (muestra de demo)',
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
  faq: [
    {
      id: 'modalidad',
      keywords: ['horario', 'clases', 'modalidad', 'online', 'presencial', 'sede'],
      answer:
        'La formación es online, con clases en directo y grabaciones disponibles para que las veas cuando mejor te venga.',
    },
    {
      id: 'duracion',
      keywords: ['dura', 'duracion', 'cuanto dura', 'semanas', 'meses'],
      answer:
        'Es un programa pensado para compaginarlo con tu día a día: clases en directo y trabajo por proyectos a tu ritmo entre sesiones.',
    },
    {
      id: 'acompanamiento',
      keywords: ['tutorias', 'acompanamiento', 'profesor', 'apoyo'],
      answer:
        'Tienes tutorías personalizadas y acompañamiento continuo: siempre hay alguien del equipo para resolver tus dudas.',
    },
  ],
  qualificationQuestions: [
    {
      id: 'starting-experience',
      text: 'Para orientarte mejor, ¿partes de cero o ya tienes algo de experiencia en el sector?',
      purpose: 'Brief qualification only: no exam, no scoring, no automatic exclusion.',
    },
    {
      id: 'time-interest',
      text: '¿Cuándo te gustaría empezar: lo antes posible o dentro de unos meses?',
      purpose: 'Brief qualification only: no exam, no scoring, no automatic exclusion.',
    },
  ],
  initialMessage:
    'Hola, te escribimos desde MUSK Technologies. ¿Te sigue interesando la formación de especialización tecnológica? Podemos resolver tus dudas por aquí y, si te encaja, te llamamos sin compromiso.',
};
