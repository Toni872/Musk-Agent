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
  // Sample value only: in APPROVED_CONTENT this is still a TODO(decisión)
  // because MUSK has not provided its own company presentation yet.
  companyPresentation:
    'MUSK Technologies es la escuela de formación tecnológica que imparte esta formación (muestra de demo, pendiente de aprobación de MUSK).',
  // Same specific-to-general order as APPROVED_CONTENT: findApprovedAnswer()
  // returns the FIRST keyword match, so the broad 'informacion' entry is last.
  faq: [
    {
      id: 'sobre-musk',
      keywords: ['sobre musk', 'que es musk', 'quienes sois', 'vuestra empresa', 'sois musk'],
      answer:
        'Te escribimos desde MUSK Technologies. Por aquí puedo contarte todo sobre la formación: en qué consiste, qué se trabaja y qué salidas tiene. Cualquier detalle sobre el equipo te lo confirma una persona cuando quieras.',
    },
    {
      id: 'metodologia',
      keywords: ['metodologia', 'como se aprende', 'como son las clases', 'como funciona', 'como es el curso'],
      answer:
        'Se aprende con proyectos guiados y clases en directo, con acompañamiento y tutorías durante todo el programa.',
    },
    {
      id: 'acompanamiento',
      keywords: ['tutorias', 'acompanamiento', 'profesor', 'docente', 'apoyo'],
      answer:
        'Tienes tutorías personalizadas y acompañamiento continuo: siempre hay alguien del equipo para resolver tus dudas.',
    },
    {
      id: 'contenido',
      keywords: ['que aprendo', 'que voy a aprender', 'habilidades', 'contenidos', 'que enseña'],
      answer:
        'Trabajas fundamentos sólidos de programación, proyectos con metodologías ágiles y resolución de problemas reales en equipo.',
    },
    {
      id: 'salidas',
      keywords: ['salidas', 'que salidas', 'de que puedo trabajar', 'empleabilidad'],
      answer:
        'La formación prepara perfiles junior para incorporarse a un equipo real, construir su propio portafolio y especializarse en el área que elijan. El encaje concreto lo ves con el equipo.',
    },
    {
      id: 'modalidad',
      keywords: ['horario', 'clases', 'modalidad', 'online', 'presencial', 'sede'],
      answer:
        'La formación es online, con clases en directo y grabaciones disponibles para que las veas cuando mejor te venga.',
    },
    {
      id: 'duracion',
      keywords: ['cuanto dura', 'duracion', 'cuanto tiempo', 'cuantos meses', 'cuantas semanas'],
      answer:
        'Es un programa pensado para compaginarlo con tu día a día: clases en directo y trabajo por proyectos a tu ritmo entre sesiones.',
    },
    {
      id: 'informacion',
      keywords: ['informacion', 'mas informacion', 'dame informacion', 'de que va', 'en que consiste'],
      answer:
        'Claro. Es una formación práctica y acompañada para dar el salto profesional en el sector tecnológico, trabajando por proyectos reales desde el primer día. Si quieres, te cuento más o lo vemos con detalle con el equipo.',
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
