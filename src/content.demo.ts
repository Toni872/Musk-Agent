// DEMO sample content for the MUSK simulation harness — NOT approved by MUSK.
//
// Purpose: let the agent run a complete, coherent conversation during a live
// demo without the blocking TODO(decisión) stubs that APPROVED_CONTENT keeps on
// purpose (src/content.ts). This profile is loaded ONLY with `--demo` and is
// clearly labelled as a sample at runtime.
//
// It is not a complete sign-off of this profile: only the call-first approach,
// approved financing statement and notification routing are confirmed. Other
// demo copy remains a proposal and must not be treated as approved for live use.
//
// Schema guard kept: no numeric price/amount data and no syllabus/temario field
// (hard rules 1, 2, 10).

import type { ApprovedContent } from './content';
import { KB_PASSAGES } from './kb';

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
    'MUSK es la escuela de formación tecnológica que imparte esta formación (muestra de demo, pendiente de aprobación de MUSK).',
  priceReply:
    'No puedo compartir precios por aquí. Sí hay opciones de financiación y tienes dos años para completar la formación con flexibilidad. El equipo te lo explica en una llamada.',
  financingReply:
    'Sí, hay opciones de financiación. Tienes dos años para completar la formación con flexibilidad. El equipo puede explicarte las opciones en una llamada.',
  // Simulated notification destination only; no WhatsApp message is sent.
  handoffRecipient: 'Laura',
  // Same specific-to-general order as APPROVED_CONTENT: findApprovedAnswer()
  // returns the FIRST keyword match, so the broad 'informacion' entry is last.
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
        'vuestra empresa',
        'sois musk',
        'hablame de musk',
        'cuentame sobre musk',
      ],
      answer:
        'Te escribimos desde Escuela Musk. Por aquí puedo contarte todo sobre la formación: en qué consiste, qué se trabaja y qué salidas tiene. Cualquier detalle sobre el equipo te lo confirma una persona cuando quieras.',
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
      // Catalogue entry for the lead who has not chosen a programme yet. It
      // answers the *orientation* question, not a course question: it does not
      // rank programmes, does not list syllabus and does not price anything
      // (rules 1, 2 and 4). The answer deliberately carries no "?" because the
      // engine already asks the qualification question in the same turn
      // (src/outbound.ts); asking twice was a real demo defect.
      //
      // Why this entry exists: the deterministic knowledge base knows these
      // phrasings ("no se por donde empezar", "cual me conviene", "orientame"),
      // but BM25 cannot accept a query whose whole content reduces to ONE term
      // - the score stays around 2.4 and the 3.5 threshold refuses it. Result:
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
      ],
      answer:
        'Todo es online: campus virtual, comunidad en Discord y tutores personales que te acompañan. No hay horarios fijos de conexión, así que puedes compaginarlo con tu rutina.',
    },
    {
      id: 'duracion',
      // A broad "cuánto tiempo" match would steal the specifically approved
      // completion-window question from the deterministic knowledge base.
      // "cuántos años" is spelled out on purpose: without it, "¿cuántos años
      // dura la formación?" reached the knowledge base and came back with the
      // "no tengo tiempo" objection passage - a confident answer to a question
      // nobody asked.
      keywords: ['cuanto dura', 'duracion', 'cuantos meses', 'cuantas semanas', 'cuantos anos'],
      answer:
        'Es un programa pensado para compaginarlo con tu día a día: clases en directo y trabajo por proyectos a tu ritmo entre sesiones.',
    },
    {
      // General catalog level allowed by rule 2; no prices, hours or salaries
      // (guard). Placed just before the catch-all 'informacion' entry so every
      // specific entry keeps priority ("qué enseñáis?" -> contenido, "qué
      // cursos hay y son online?" -> modalidad) while the catalog still answers
      // "qué cursos tenéis?". Wording pending MUSK sign-off.
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
      // full program detail lives in the knowledge base (kb-catalogo-*), which
      // the agent only quotes when the lead asks for one specific programme.
      //
      // It used to end with "Dime qué te atrae y te oriento." That invitation
      // asked exactly what the `goal` qualification question asks in the SAME
      // turn, and the two now travel as ONE outbound message (src/outbound.ts),
      // so the lead read the same question twice. The answer now stops at the
      // information and lets the qualification question do the asking. Wording
      // pending MUSK sign-off (rules 4 and 11).
      answer:
        'Cinco programas: Python, Front End, Back End, Full Stack y el máster de videojuegos. Todos online y desde cero, con IA en los de desarrollo y videojuegos.',
    },
    {
      id: 'informacion',
      keywords: [
        'informacion',
        'mas informacion',
        'dame informacion',
        'de que va',
        'en que consiste',
        'explicame la formacion',
        'que es la formacion',
        'cuentame mas',
        'cuentame',
        'mas sobre',
        'quiero saber mas',
        'dime mas',
      ],
      answer:
        'Las formaciones son online y prácticas: aprendes con proyectos reales y acompañamiento. Hay programas de programación, videojuegos e IA; el equipo puede orientarte sobre cuál encaja contigo.',
    },
  ],
  qualificationQuestions: [
    {
      id: 'goal',
      text: '¿Tienes ya alguna formación en mente o qué te gustaría conseguir? Así el equipo puede orientarte en una llamada.',
      purpose: 'A brief conversation prompt to understand the lead’s goal and move toward a call; not an exam or screening.',
reactions: [
        // Course selections add ONE brief clause about what the programme is,
        // with the wording drafted in docs/matriz-validacion-cursos.md
        // ("Respuestas breves propuestas para el lead"). No digits, prices,
        // certificates, internship promises or syllabus detail (rules 1, 2, 4),
        // so the acknowledgement stays safe under guardReply. Demo-profile copy,
        // still pending MUSK sign-off (rules 4 and 11).
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
  closingInvitation:
    '¿Qué día y a qué hora te viene bien que el equipo te llame?',
  // Profile-specific second acknowledgement of a rule-5 doubt (see
  // MuskAgent.neverRepeat). It lives HERE and not in the shared templates
  // because it is not approved by MUSK yet (rules 4 and 11): a profile without
  // it keeps the bare invitation fallback.
  doubtFollowup:
    'Eso también lo anoto como duda para que te lo confirmen. Si te encaja, una persona del equipo te contacta y lo veis todo con calma. ¿Te viene bien?',
  // Knowledge base (demo-only, pending MUSK sign-off — rules 4 and 11).
  // The approved profile (src/content.ts) does NOT get it: this copy is not
  // signed off yet, and it must never reach a real lead.
  kb: KB_PASSAGES,
  initialMessage:
    'Hola, soy el asistente de Escuela Musk. Retomo el contacto sobre la formación de especialización tecnológica: ¿sigue siendo algo que te interese? Puedo contarte en qué consiste y qué salidas tiene, y si encaja te pongo con una persona del equipo, sin compromiso.',
};
