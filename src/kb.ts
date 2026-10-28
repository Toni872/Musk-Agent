// The approved knowledge base of Escuela Musk, as DATA.
//
// Source of truth: `escuela-musk-base-conocimiento.md` (repository root). Each
// passage is a small, self-contained chunk of that document with its OWN
// lead-facing answer. Hard rule 10: a guide used as a knowledge source does
// NOT authorize sending it whole, so the document is never quoted: only the
// per-passage `answer` is ever sent to the lead.
//
// Hard rules 4 and 11: this content is PENDING MUSK sign-off. It now lives in
// the single unified profile (src/content.ts) as part of APPROVED_CONTENT.kb,
// alongside the FAQ and opening/cualification copy. The document is never sent
// whole: only each passage's lead-facing `answer` is ever delivered.
//
// Two invariants are enforced by tests (tests/retrieval.test.ts):
//  1. no lead-facing answer contains a single digit (no prices, no amounts,
//     no salaries, no percentages or hour counts); the sole approved duration
//     statement is the two-year completion window, written out in words;
//  2. no answer mentions a forbidden topic (price, payment terms, start dates,
//     refunds, scholarships, entry requirements, physical location, ...).
//
// The `terms` array is NOT lead-facing: it holds the extra retrieval
// vocabulary (synonyms and the phrasings a lead would actually use) so the
// retrieval layer can find the passage without new hand-written keywords per
// question.
//
// The vocabulary is deliberately curated: the words a forbidden-topic question
// is built from (curso, programa, precio, cuesta, horas, ...) are NOT used in
// the answers, so a forbidden question cannot accidentally retrieve a passage
// on lexical grounds. This is a safety margin ON TOP of the explicit
// forbidden-topic guard in src/retrieval.ts.

export interface KbPassage {
  id: string; // stable slug, e.g. 'kb-catalogo'
  title: string; // short label for the operator, e.g. 'Catálogo de formaciones'
  answer: string; // the APPROVED lead-facing answer (es-ES, tuteo, NO digits)
  terms: string[]; // extra retrieval terms (not lead-facing)
  source: string; // provenance, e.g. 'escuela-musk-base-conocimiento.md §2.1'
  exampleQueries?: string[]; // synthetic development prompts; retrieval-only, never lead-facing
}

const KB_PASSAGE_SOURCE: Omit<KbPassage, 'exampleQueries'>[] = [
  {
    id: 'kb-escuela',
    title: 'Qué es Escuela Musk',
    answer:
      'Escuela Musk es una escuela de programación, videojuegos e inteligencia artificial, totalmente online, con campus virtual, comunidad y tutores personales. No hay horarios fijos de conexión: organizas tu semana y marcas tu ritmo.',
    terms: [
      'que es la escuela',
      'que es escuela musk',
      'formacion online',
      'campus virtual',
      'discord',
      'tutores personales',
      'sin horarios fijos',
      'clase online',
      'escuela de programacion',
    ],
    source: 'escuela-musk-base-conocimiento.md §1',
  },
  {
    id: 'kb-metodo-practica',
    title: 'El método: aprender haciendo',
    answer:
      'El método es aprender haciendo: desde el primer día practicas con retos reales y construyes proyectos propios desde cero. Esos proyectos son los que te llevas después, y el equipo te los revisa contigo.',
    terms: [
      'metodo',
      'en que consiste',
      'aprende haciendo',
      'practica',
      'proyectos propios',
      'como se aprende',
      'retos',
      'enfoque practico',
      'metodo musk',
      'hands on',
    ],
    source: 'escuela-musk-base-conocimiento.md §1 (El Método Musk)',
  },
  {
    id: 'kb-metodo-gamificacion',
    title: 'El método: gamificación',
    answer:
      'Todo está gamificado: retos, triviales y quizzes de autoevaluación, con ranking entre alumnos y comunidad en Discord. Se aprende jugando y con feedback constante, con tutores disponibles cuando te bloqueas.',
    terms: [
      'gamificado',
      'gamificacion',
      'triviales',
      'quizzes',
      'ranking',
      'puntos',
      'juego',
      'divertido',
      'divertida',
    ],
    source: 'escuela-musk-base-conocimiento.md §1 (El Método Musk)',
  },
  {
    id: 'kb-metodo-demostracion',
    title: 'El método: aprendizaje demostrado',
    answer:
      'Es aprendizaje demostrado: no avanzas al siguiente tema hasta dominar el anterior. Se avanza cuando lo entiendes de verdad, y el equipo ajusta el ritmo a tu punto de partida.',
    terms: [
      'aprendizaje demostrado',
      'dominar',
      'paso a paso',
      'progresivo',
      'no avanzo',
      'ritmo',
      'sin prisa',
    ],
    source: 'escuela-musk-base-conocimiento.md §1 (El Método Musk)',
  },
  {
    id: 'kb-metodo-acompanamiento',
    title: 'El método: acompañamiento',
    answer:
      'Hay acompañamiento continuo: un tutor personal y mentores senior en activo, que son ingenieros, responsables técnicos y científicos de datos. Si te bloqueas, lo resuelves con ellos.',
    terms: [
      'tutor',
      'mentor',
      'profesor',
      'acompanamiento',
      'senior',
      'soporte',
      'ayuda',
      'me bloquee',
      'quien me ayuda',
    ],
    source: 'escuela-musk-base-conocimiento.md §1 (El Método Musk)',
  },
  {
    id: 'kb-metodo-ia-copiloto',
    title: 'El método: la IA como copiloto',
    answer:
      'La inteligencia artificial se usa como copiloto, no como muleta: aprendes a auditar y optimizar el código que genera, para que no te quedes con una caja negra ni una arquitectura sin sentido.',
    terms: [
      'inteligencia artificial',
      'copiloto',
      'auditar el codigo',
      'codigo generado',
      'deuda tecnica',
      'ia en el desarrollo',
      'reviso lo que escribe la ia',
    ],
    source: 'escuela-musk-base-conocimiento.md §1 (El Método Musk)',
  },
  {
    id: 'kb-certificacion-arp',
    title: 'Certificación ARP',
    answer:
      'Todas las formaciones incluyen ARP, la certificación de la Unión Europea, y el certificado de Escuela Musk. Te lo confirman en la llamada.',
    terms: [
      'arp',
      'certificado de la ue',
      'marca de certificacion',
      'diploma',
      'certificacion europea',
      'union europea',
      'certificado ue',
      'homologado',
    ],
    source: 'escuela-musk-base-conocimiento.md §1 (Certificaciones transversales)',
  },
  {
    id: 'kb-certificacion-pcap',
    title: 'Certificación PCAP de Python',
    answer:
      'En Python se prepara el examen PCAP del Python Institute, y la escuela es Centro Examinador Oficial de esa certificación. El equipo te explica los pasos en la llamada.',
    terms: [
      'pcap',
      'python institute',
      'centro examinador',
      'certificacion de python',
      'examen de python',
    ],
    source: 'escuela-musk-base-conocimiento.md §1 (Certificaciones transversales)',
  },
  {
    id: 'kb-certificacion-unity',
    title: 'Certificaciones de Unity',
    answer:
      'En videojuegos obtienes las certificaciones oficiales de Unity: UCAGD, de diseño, y UCU-PROG, de programación. Vienen con el máster, y el equipo te explica los pasos en la llamada.',
    terms: [
      'unity',
      'ucagd',
      'ucu-prog',
      'certificacion de unity',
      'sello de unity',
      'programacion en c sharp',
      'c sharp',
    ],
    source: 'escuela-musk-base-conocimiento.md §1 (Certificaciones transversales)',
  },
  {
    id: 'kb-python-contenido',
    title: 'Python: para quién es y qué aprendes',
    answer:
      'Python va de lo básico a lo avanzado: web con Django y Flask, bases de datos SQL y MongoDB, análisis de datos con pandas y NumPy, y modelos de lenguaje. Se parte de cero y también sirve para automatizar tu trabajo.',
    terms: [
      'python',
      'formacion de python',
      'que aprendes en python',
      'django',
      'flask',
      'pandas',
      'numpy',
      'mongodb',
      'automatizar',
      'analisis de datos',
      'modelos de lenguaje',
      'programacion en python',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.4',
  },
  {
    id: 'kb-python-salidas',
    title: 'Python: salidas profesionales',
    answer:
      'Con Python puedes salir como backend developer, analista de datos o ingeniero de machine learning junior. También hay QA con scripting o prompt engineer. El equipo concreta tu salida.',
    terms: [
      'salidas de python',
      'trabajar con python',
      'puestos de python',
      'a que me dedico con python',
      'salidas de python',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.4',
  },
  {
    id: 'kb-frontend-contenido',
    title: 'Front End: para quién es y qué aprendes',
    answer:
      'En Front End aprendes JavaScript, React y Next.js, diseño de interfaces y UX/UI, y a conectar tus páginas con datos reales. Construyes aplicaciones completas, no páginas estáticas, y se parte de cero.',
    terms: [
      'front end',
      'frontend',
      'react',
      'next.js',
      'tailwind',
      'ux ui',
      'responsive',
      'interfaces',
      'diseño web',
      'que aprendes en front end',
      'elijo la parte visible',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.2',
  },
  {
    id: 'kb-frontend-salidas',
    title: 'Front End: salidas profesionales',
    answer:
      'Las salidas en Front End son frontend developer, UX/UI designer o product developer junior. El equipo te cuenta cómo encaja con tu perfil.',
    terms: [
      'salidas de front end',
      'trabajar de front end',
      'puestos de front end',
      'a que me dedico con front end',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.2',
  },
  {
    id: 'kb-backend-contenido',
    title: 'Back End: para quién es y qué aprendes',
    answer:
      'En Back End trabajas la lógica de servidor con JavaScript, Node.js, Java y Spring, bases de datos, APIs, microservicios, seguridad y despliegue. No hacen falta matemáticas ni experiencia previa: se parte de cero.',
    terms: [
      'back end',
      'backend',
      'node.js',
      'spring',
      'apis',
      'microservicios',
      'servidor',
      'bases de datos',
      'java',
      'sql y nosql',
      'que aprendes en back end',
      'elijo la parte invisible',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.1',
  },
  {
    id: 'kb-backend-salidas',
    title: 'Back End: salidas profesionales',
    answer:
      'Las salidas en Back End son backend developer, data architect o cloud developer, además de roles de APIs y arquitectura. El equipo te concreta el encaje.',
    terms: [
      'salidas de back end',
      'trabajar de back end',
      'puestos de back end',
      'a que me dedico con back end',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.1',
  },
  {
    id: 'kb-fullstack-contenido',
    title: 'Full Stack: para quién es y qué aprendes',
    answer:
      'Full Stack: React y Node.js con Java, bases de datos, APIs y despliegue. Es el perfil más completo: llevas un producto de principio a fin. El equipo te ayuda a elegir el camino.',
    terms: [
      'full stack',
      'fullstack',
      'react y node',
      'graphql',
      'owasp',
      'cloud',
      'spring boot',
      'ecommerce',
      'autenticacion',
      'que aprendes en full stack',
      'de la parte visible a la invisible',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.3',
  },
  {
    id: 'kb-fullstack-salidas',
    title: 'Full Stack: salidas profesionales',
    answer:
      'Las salidas en Full Stack son full stack developer, frontend o backend developer, API developer o QA engineer. En el equipo vemos cuál encaja contigo.',
    terms: [
      'salidas de full stack',
      'trabajar de full stack',
      'puestos de full stack',
      'a que me dedico con full stack',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.3',
  },
  {
    id: 'kb-videojuegos-contenido',
    title: 'Videojuegos: para quién es y qué aprendes',
    answer:
      'El máster de videojuegos: Unity y Unreal, con un proyecto final en el que construyes tu propio juego. Se empieza desde cero, con mentores que te guían.',
    terms: [
      'videojuegos',
      'master de videojuegos',
      'unity',
      'unreal',
      'blender',
      'steam',
      'realidad virtual',
      'publicar un juego',
      'crear juegos',
      'autopublicar',
      'modelado tridimensional',
      'mi propio juego',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.5',
  },
  {
    id: 'kb-videojuegos-salidas',
    title: 'Videojuegos: salidas profesionales',
    answer:
      'Las salidas en videojuegos son gameplay programmer, technical artist, game designer o QA tester. El equipo te orienta sobre cuál encaja contigo.',
    terms: [
      'salidas de videojuegos',
      'trabajar en videojuegos',
      'puestos de videojuegos',
      'a que me dedico con videojuegos',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.5',
  },
  {
    id: 'kb-otros-programas',
    title: 'Otras formaciones del catálogo',
    answer:
      'Además hay una formación más de Python con IA Engineering y tres másteres: Inteligencia Artificial, Machine Learning y Deep Learning. El detalle de cada uno te lo da una persona del equipo.',
    terms: [
      'otras formaciones',
      'master de inteligencia artificial',
      'machine learning',
      'deep learning',
      'python con ia',
      'ia engineering',
      'masteres',
      'redes neuronales',
      'modelado predictivo',
    ],
    source: 'escuela-musk-base-conocimiento.md §3',
  },
  {
    id: 'kb-guia-recomendacion',
    title: 'Qué formación encaja conmigo',
    answer:
      'La recomendación depende de qué te atrae: si la lógica y los datos, Python o Back End; si te gusta lo visual, Front End; si quieres crear juegos, videojuegos; y si buscas la salida más completa, Full Stack.',
    terms: [
      'que formacion me recomiendas',
      'no se por donde empezar',
      'que me encaja',
      'cual me conviene',
      'recomendacion',
      'cual formacion',
      'no se cual elegir',
      'que camino',
      'orientame',
    ],
    source: 'escuela-musk-base-conocimiento.md §5',
  },
  {
    id: 'kb-sin-experiencia',
    title: 'Experiencia previa y capacidad',
    answer:
      'No necesitas experiencia previa ni estudios anteriores: todas las formaciones parten de cero. Tampoco hace falta ser bueno en matemáticas, sino lógica y constancia, y tienes un tutor personal detrás.',
    terms: [
      'necesito experiencia',
      'experiencia previa',
      'sin experiencia',
      'desde cero',
      'no se programar',
      'estudios previos',
      'no soy capaz',
      'nunca he programado',
      'me da miedo',
      'matematicas',
      // Fear and self-doubt phrasings a lead actually writes. Without them the
      // retrieval missed the passage and the agent answered with the rule 5
      // doubt reply, which is the wrong register for someone admitting a fear.
      'sirvo',
      'no se si sirvo',
      'base tecnica',
      'mi edad',
      'mayor para estudiar',
    ],
    source: 'escuela-musk-base-conocimiento.md §6, §7',
  },
  {
    id: 'kb-compaginar-trabajo',
    title: 'Compaginar con trabajo o estudios',
    answer:
      'Sí, se puede compaginar con trabajo o estudios: no hay horarios fijos de conexión, así que organizas tu semana y marcas tu ritmo, con los mentores disponibles para desbloquearte.',
    terms: [
      'compaginar con trabajo',
      'compatibilizar con el trabajo',
      'puedo estudiar trabajando',
      'con mis estudios',
      'a la vez que trabajo',
      'sin horarios',
      'mi ritmo',
      'tengo otro trabajo',
      'trabajo y estudio',
    ],
    source: 'escuela-musk-base-conocimiento.md §6',
  },
  {
    id: 'kb-presencial-online',
    title: 'Presencial u online',
    answer:
      'La formación es online: campus virtual, comunidad en Discord y tutores personales, con el acompañamiento en remoto. Tú decides cuándo conectarte, y el equipo te lo explica en la llamada.',
    terms: [
      'es presencial',
      'online o presencial',
      'donde esta la academia',
      'a distancia',
      'en remoto',
      'campus virtual',
      'presencial',
    ],
    source: 'escuela-musk-base-conocimiento.md §1, §6',
  },
  {
    id: 'kb-atasco',
    title: 'Qué pasa si me atasco',
    answer:
      'Si te atascas no te quedas solo: tienes tutor personal, profesores en activo y comunidad para resolver el bloqueo en el momento, y no pasas al siguiente tema hasta dominar el anterior.',
    terms: [
      'me atasco',
      'me quedo atascado',
      'bloqueo',
      'no entiendo',
      'no me sale',
      'estoy perdido',
      'ayuda con el codigo',
      'no avanzo',
    ],
    source: 'escuela-musk-base-conocimiento.md §6',
  },
  {
    id: 'kb-practicas',
    title: 'Prácticas en empresa',
    answer:
      'Las prácticas en empresa se gestionan mediante un convenio de colaboración. El equipo de orientación laboral te acompaña en la búsqueda de empresa y las condiciones concretas te las confirma una persona del equipo.',
    terms: [
      'practicas',
      'practicas en empresa',
      'convenio',
      'stage',
      'practicando en empresa',
      'donde hago las practicas',
      'empresa de practicas',
    ],
    source: 'escuela-musk-base-conocimiento.md §1, §6',
  },
  {
    id: 'kb-empleo-ayuda',
    title: 'Ayuda para encontrar trabajo',
    answer:
      'Hay orientación laboral desde el primer día: el CV de la escuela, el LinkedIn preparado, masterclasses, pruebas técnicas y contacto con reclutadoras. El acompañamiento lo lleva una persona del equipo.',
    terms: [
      'me ayudan a encontrar trabajo',
      'ayudais',
      'empleabilidad',
      'orientacion laboral',
      'cv',
      'linkedin',
      'reclutadoras',
      'pruebas tecnicas',
      'busco empleo',
      'me ayudaran a trabajar',
    ],
    source: 'escuela-musk-base-conocimiento.md §1, §6',
  },
  {
    id: 'kb-sin-titulo',
    title: 'Sin título universitario',
    answer:
      'Puedes hacerla sin título universitario: en selección pesa más tu portafolio y la prueba técnica que el título, y te llevas un portafolio de proyectos propios para enseñar.',
    terms: [
      'sin titulo universitario',
      'no tengo la carrera',
      'tengo un grado',
      'universidad',
      'estudiando informatica',
      'me vale con un titulo',
      'titulacion',
    ],
    source: 'escuela-musk-base-conocimiento.md §1, §6',
  },
  {
    id: 'kb-diploma',
    title: 'Qué diploma recibes',
    answer:
      'Al terminar recibes el certificado de Escuela Musk y la certificación ARP de la Unión Europea; en Python también el PCAP del Python Institute y en videojuegos las certificaciones de Unity.',
    terms: [
      'que diploma recibo',
      'que me dan al terminar',
      'certificado',
      'diploma',
      'titulo',
      'titulacion',
      'certificacion final',
      'me lo dan al acabar',
    ],
    source: 'escuela-musk-base-conocimiento.md §6',
  },
  {
    id: 'kb-ia-merece',
    title: 'Con la IA, ¿sigue mereciendo la pena?',
    answer:
      'Sí, según la escuela, sigue mereciendo la pena: la IA escribe fragmentos, pero las empresas necesitan quien estructure la aplicación, conecte los datos y audite el código. El criterio lo pones tú.',
    terms: [
      'con la ia sigue mereciendo la pena',
      'la ia me quita el trabajo',
      'me sustituye la ia',
      'futuro del trabajo',
      'aprender a programar con ia',
      'me quedo sin trabajo',
      'vale la pena programar',
    ],
    source: 'escuela-musk-base-conocimiento.md §2.2, §6, §7',
  },
  {
    id: 'kb-diferencia-bootcamps',
    title: 'En qué se diferencia de otros bootcamps',
    answer:
      'La diferencia está en el método: es práctico y gamificado, con aprendizaje demostrado, acompañamiento constante, comunidad activa y transparencia, y un compromiso claro con la empleabilidad.',
    terms: [
      'diferencia con otros bootcamps',
      'bootcamp',
      'otros cursos',
      'academias',
      'que los diferencia',
      'por que vosotros',
      'comparativa',
      'metodologias',
      'es lo mismo que otros',
    ],
    source: 'escuela-musk-base-conocimiento.md §6',
  },
  {
    id: 'kb-freelance',
    title: 'Trabajar por cuenta propia',
    answer:
      'Hay contenido orientado a trabajar por cuenta propia: en Back End se trabaja cómo publicar tu proyecto y buscar trabajo por cuenta propia, y en videojuegos cómo publicar y vender tu propio juego en Steam.',
    terms: [
      'freelance',
      'trabajar por mi cuenta',
      'autonomo',
      'publicar mi juego',
      'vender mi juego',
      'independiente',
      'vivir de mi proyecto',
    ],
    source: 'escuela-musk-base-conocimiento.md §6',
  },
  {
    id: 'kb-obj-no-tiempo',
    title: 'Objeción: no tengo tiempo',
    answer:
      'Si ahora no es el momento, no pasa nada: puedes completar la formación en dos años con flexibilidad. El equipo puede orientarte en una llamada.',
    terms: [
      'no tengo tiempo',
      'ahora no es el momento',
      'no es buen momento',
      'no puedo ahora',
      'muy ocupado',
      'no me da la vida',
      'falta tiempo',
      'lo dejo para luego',
      'cuanto tiempo para completar la formacion',
      'plazo para completar la formacion',
      'dos anos para terminar',
      'completar la formacion en dos anos',
      // The natural wording of the objection, not the tidy one: "no tengo tiempo
      // ahora mismo" already matched, but "no tengo tiempo, trabajo todo el día"
      // fell below the threshold and ended in the doubt path.
      'trabajo todo el dia',
      'tengo hijos',
    ],
    source: 'Nicolás, respuesta inline al correo de Miguel (financiación y plazo de finalización)',
  },
  {
    id: 'kb-obj-desconfio',
    title: 'Objeción: desconfío de las academias online',
    answer:
      'Es una desconfianza razonable: la escuela responde con comunidad en Discord, seguimiento del equipo y testimonios de alumnos. La certificación ARP es un sello de la Unión Europea, y una entrevista con el equipo resuelve tus dudas.',
    terms: [
      'desconfio de las academias',
      'no me fio',
      'no confio',
      'es una estafa',
      'piramide',
      'me da desconfianza',
      'online de verdad',
      'me dio mala espina',
      'centros de formacion',
      'otras academias',
      'experiencias',
    ],
    source: 'escuela-musk-base-conocimiento.md §7',
  },
  {
    id: 'kb-obj-ya-deje',
    title: 'Objeción: ya lo vi y lo dejé',
    answer:
      'Si ya lo viste y lo dejaste, el motivo puede ser que el enfoque no encajara contigo. Desde ahí se retoma con calma con una persona del equipo, sin compromiso, y si tampoco es el momento, no pasa nada.',
    terms: [
      'ya lo mire y lo deje',
      'ya me lo vi',
      'lo abandone',
      'lo deje a medias',
      'ya lo intente',
      'ya lo conozco',
      'ya me lo habian contado',
    ],
    source: 'escuela-musk-base-conocimiento.md §7',
  },
];

// Synthetic benchmark prompts, not observed customer quotes and not approved
// client copy. These seven development prompts per passage are indexed only as
// additional retrieval evidence. The three held-out prompts per passage live
// exclusively in src/eval.dataset.ts and are never indexed here.
const DEVELOPMENT_EXAMPLE_QUERIES: Record<string, string[]> = {
  'kb-escuela': [
    '¿A qué se dedica Escuela Musk exactamente?',
    'Me puedes situar un poco qué tipo de escuela es',
    'Qué ofrece la academia aparte de las clases',
    '¿Qué es Escuela Musk y cómo se organiza el aprendizaje?',
    '¿Tengo a alguien que me acompañe mientras estudio online?',
    '¿Puedo conectarme cuando me venga bien?',
    'No entiendo bien qué es MUSK, me lo explicas',
  ],
  'kb-metodo-practica': [
    '¿Se aprende haciendo ejercicios o solo viendo vídeos?',
    'Qué tipo de cosas voy creando mientras aprendo',
    '¿Hay retos prácticos para aplicar lo que estudio?',
    '¿Me llevo trabajos míos para enseñar luego?',
    '¿Quién revisa lo que voy construyendo?',
    'Quiero saber si se practica desde el principio',
    '¿El aprendizaje es más de hacer que de escuchar?',
  ],
  'kb-metodo-gamificacion': [
    '¿Hay algún elemento de juego mientras estudio?',
    'Qué son los triviales que aparecen en la plataforma',
    '¿Se compite con otros alumnos de alguna forma?',
    '¿Cómo recibo comentarios sobre mi progreso?',
    'Me motiva aprender con retos y puntos, ¿lo tenéis?',
    '¿La comunidad tiene un ranking de participantes?',
    '¿El estudio se hace más ameno con dinámicas?',
  ],
  'kb-metodo-demostracion': [
    '¿Tengo que dominar una parte antes de seguir avanzando?',
    'Qué pasa si todavía no entiendo un tema',
    '¿Se adapta la velocidad a lo que voy entendiendo?',
    '¿Puedo ir consolidando cada parte sin correr?',
    '¿Cómo comprobáis que ya manejo lo aprendido?',
    'Me preocupa quedarme atrás si avanzo despacio',
    '¿El siguiente bloque se abre cuando controlo el anterior?',
  ],
  'kb-metodo-acompanamiento': [
    '¿A quién recurro si me surge una duda técnica?',
    '¿Hay profes con experiencia real acompañando?',
    'Qué apoyo tengo cuando me quedo bloqueado',
    '¿Puedo pedir ayuda a un mentor?',
    '¿Quién está pendiente de mi progreso?',
    'Me vendría bien tener una persona de referencia',
    '¿Los tutores trabajan también en el sector?',
  ],
  'kb-metodo-ia-copiloto': [
    '¿La inteligencia artificial hace todo el código por mí?',
    'Cómo enseñáis a revisar lo que propone una IA',
    '¿Aprendo a detectar fallos en código generado?',
    'No quiero copiar respuestas automáticas sin entenderlas',
    '¿Se usa la IA para aprender desarrollo de software?',
    '¿Qué papel tiene la IA cuando programo?',
    '¿Me enseñan a valorar si una solución automática tiene sentido?',
  ],
  'kb-certificacion-arp': [
    '¿Qué acredita la certificación ARP?',
    '¿El certificado europeo viene con todas las formaciones?',
    '¿Recibo un reconocimiento de la Unión Europea?',
    'Me interesa saber si hay una acreditación común al acabar',
    '¿Cómo se llama el sello europeo de la escuela?',
    '¿Me explican cómo obtener la certificación?',
    '¿Qué entidad reconoce el certificado ARP?',
  ],
  'kb-certificacion-pcap': [
    '¿Qué examen oficial de Python se prepara?',
    '¿Puedo examinarme de una certificación de Python?',
    '¿La escuela está autorizada para examinar de PCAP?',
    '¿Qué organismo acredita el examen de Python?',
    'Quiero certificar mis conocimientos de Python',
    '¿Me orientan con los pasos del examen PCAP?',
    '¿Hay una acreditación externa para Python?',
  ],
  'kb-certificacion-unity': [
    '¿Qué acreditaciones oficiales incluye videojuegos?',
    '¿Hay certificados de Unity en la formación de juegos?',
    '¿Qué significan UCAGD y UCU-PROG?',
    '¿Me puedo acreditar en diseño con Unity?',
    '¿Incluye un reconocimiento de programación de Unity?',
    '¿Qué certificaciones de videojuegos entrega la escuela?',
    'Me interesa el sello oficial de Unity, ¿lo preparáis?',
  ],
  'kb-python-contenido': [
    '¿Qué tecnologías tocaría si elijo Python?',
    '¿Se ve análisis de datos con pandas?',
    'Me interesa crear servicios web con Django o Flask',
    '¿Se trabaja con bases de datos en este itinerario?',
    '¿Hace falta llegar sabiendo programar en Python?',
    '¿Puedo aplicar Python para automatizar tareas?',
    '¿Se aprende algo de modelos de lenguaje?',
  ],
  'kb-python-salidas': [
    '¿Qué puestos suelen buscar a alguien que sabe Python?',
    '¿Podría orientar mi perfil hacia análisis de datos?',
    '¿Qué opciones laborales hay con este lenguaje?',
    '¿Hay trabajo de backend para quien aprende Python?',
    '¿Se puede llegar a machine learning como perfil junior?',
    '¿Qué tipo de funciones tendría en una empresa?',
    'Me gustaría saber en qué podría trabajar con Python',
  ],
  'kb-frontend-contenido': [
    '¿Qué herramientas se usan para crear la parte visual?',
    '¿Se aprende React en el recorrido de Front End?',
    'Me interesa diseñar interfaces para distintos tamaños de pantalla',
    '¿Cómo conecto una web con información real?',
    '¿Se toca experiencia de usuario y diseño de pantallas?',
    '¿Hace falta empezar con conocimientos de JavaScript?',
    '¿Qué puedo construir aprendiendo la parte visible de una web?',
  ],
  'kb-frontend-salidas': [
    '¿Qué puestos hay relacionados con la interfaz de una web?',
    '¿Podría dedicarme a experiencia de usuario?',
    '¿Cómo se llama el perfil que construye páginas web?',
    '¿Qué opciones profesionales ofrece Front End?',
    '¿Hay salidas como product developer?',
    'Me gusta el diseño digital, ¿en qué podría trabajar?',
    '¿Qué rol combina interfaces y producto?',
  ],
  'kb-backend-contenido': [
    '¿Qué se hace detrás de una aplicación web?',
    '¿Se aprende Node.js junto con Java?',
    'Me interesa trabajar con APIs y servicios',
    '¿Qué tecnologías sirven para la lógica del servidor?',
    '¿Se ven microservicios y seguridad informática?',
    '¿Puedo empezar desde cero en desarrollo backend?',
    '¿Qué herramientas de despliegue se aprenden?',
  ],
  'kb-backend-salidas': [
    '¿Qué puestos hay en arquitectura de datos y servicios cloud?',
    '¿Hay trabajo de arquitectura de datos y servicios cloud?',
    '¿Qué puestos se relacionan con las APIs?',
    'Me atrae la infraestructura, ¿qué rol podría tener?',
    '¿Hay opciones como cloud developer?',
    '¿En qué podría trabajar después de estudiar Back End?',
    '¿Qué perfiles construyen la parte interna de una aplicación?',
  ],
  'kb-fullstack-contenido': [
    '¿Qué tecnologías aprendería para hacer una aplicación completa?',
    '¿Qué combinación reúne React, Node.js y Java en una sola formación?',
    'Quiero aprender a conectar React con Node',
    '¿Se ven bases de datos y despliegue en el mismo recorrido?',
    '¿Qué significa llevar un producto de principio a fin?',
    '¿Hay contenidos de Java y Spring Boot?',
    '¿Puedo crear una tienda online completa?',
  ],
  'kb-fullstack-salidas': [
    '¿Qué puestos puede ocupar un perfil que sabe de todo el producto?',
    '¿Hay trabajo tanto en frontend como en backend?',
    '¿Qué opciones profesionales tiene Full Stack?',
    'Me gustaría crear aplicaciones completas en una empresa',
    '¿Podría ser API developer o QA engineer?',
    '¿Qué salidas combinan navegador y servidor?',
    '¿Qué puestos suelen pedir conocimientos de varias capas?',
  ],
  'kb-videojuegos-contenido': [
    '¿Qué motores se utilizan para crear videojuegos?',
    '¿Se trabaja con Unity y Unreal en el máster?',
    '¿Puedo diseñar y publicar un juego propio?',
    'Me interesa modelar personajes en tres dimensiones',
    '¿Se aprende algo de realidad virtual?',
    '¿El proyecto final puede llegar a Steam?',
    '¿Hay parte de creación de videojuegos desde cero?',
  ],
  'kb-videojuegos-salidas': [
    '¿En qué puede trabajar alguien que se forma en videojuegos?',
    '¿Hay roles de diseño de juegos?',
    '¿Qué hace un gameplay programmer?',
    'Me llama la atención el arte técnico para videojuegos',
    '¿Se puede trabajar probando videojuegos?',
    '¿Qué profesiones hay en un estudio de juegos?',
    '¿Qué opciones laborales tiene esta especialidad?',
  ],
  'kb-otros-programas': [
    '¿Qué otras áreas de formación tenéis además de desarrollo web?',
    '¿Hay algo más avanzado de inteligencia artificial?',
    '¿Ofrecéis una ruta de machine learning?',
    '¿También se puede estudiar deep learning?',
    '¿Existe un programa de IA Engineering con Python?',
    'Me interesan las redes neuronales, ¿qué máster lo cubre?',
    '¿Qué otras especialidades aparecen en el catálogo?',
  ],
  'kb-guia-recomendacion': [
    'No sé qué camino elegir, ¿cómo lo pienso?',
    '¿Qué itinerario encaja si me gustan los datos?',
    'Me tira más la parte visual que la lógica',
    '¿Qué opción me acerca a crear videojuegos?',
    'Busco una ruta amplia para tocar varias partes',
    '¿Cómo puedo decidir entre Python y desarrollo web?',
    '¿Qué debería tener en cuenta para escoger formación?',
  ],
  'kb-sin-experiencia': [
    '¿Puedo empezar aunque nunca haya escrito código?',
    'No tengo base técnica, ¿me quedaré atrás?',
    '¿Se puede arrancar sin haber estudiado informática?',
    '¿Hace falta dominar matemáticas para seguir las clases?',
    'Me da respeto empezar desde el principio',
    '¿El nivel inicial sirve para alguien que empieza de cero?',
    '¿Qué pasa si todavía no tengo conocimientos de programación?',
  ],
  'kb-compaginar-trabajo': [
    '¿Puedo estudiar mientras mantengo mi empleo?',
    '¿Tengo que conectarme a una hora concreta cada día?',
    'Me gustaría compatibilizarlo con la universidad',
    '¿El ritmo lo organizo según mi semana?',
    '¿Puedo avanzar cuando termino mi jornada laboral?',
    '¿Es viable hacerlo si ya tengo otras responsabilidades?',
    '¿Los mentores me ayudan si estudio en ratos libres?',
  ],
  'kb-presencial-online': [
    '¿Tengo que ir a un centro o se hace a distancia?',
    '¿Dónde están las clases, en un aula o en internet?',
    '¿Se puede estudiar sin desplazarse?',
    '¿La comunidad se reúne en Discord?',
    '¿Cómo accedo al campus desde casa?',
    'Me interesa que sea una formación remota',
    '¿Puedo elegir el momento para entrar a clase?',
  ],
  'kb-atasco': [
    '¿Qué hago si me quedo encallado con un ejercicio?',
    '¿Hay alguien que me ayude cuando no me sale el código?',
    'Me preocupa no poder resolver un reto solo',
    '¿Puedo consultar a un profesor si me bloqueo?',
    '¿Se sigue avanzando aunque no domine una parte?',
    '¿Tengo apoyo de la comunidad cuando me atasco?',
    '¿Cómo consigo ayuda si no entiendo una práctica?',
  ],
  'kb-practicas': [
    '¿Se hacen prácticas trabajando con una empresa?',
    '¿Hay un convenio para realizar experiencia profesional?',
    '¿La escuela ayuda a encontrar una empresa de prácticas?',
    'Me gustaría aplicar lo aprendido en un entorno laboral',
    '¿Las prácticas están cubiertas por un acuerdo?',
    '¿El equipo me orienta para las prácticas?',
    '¿Existe una colaboración con empresas para hacer prácticas?',
  ],
  'kb-empleo-ayuda': [
    '¿Me orientan para preparar la búsqueda de trabajo?',
    '¿Hay apoyo para poner al día el currículum?',
    '¿Me ayudan a presentar bien mi perfil en LinkedIn?',
    '¿Se hacen simulacros de pruebas técnicas?',
    '¿Puedo conocer a reclutadores durante la formación?',
    '¿La orientación laboral empieza desde el principio?',
    '¿Qué recursos hay para moverme en el mercado laboral?',
  ],
  'kb-sin-titulo': [
    '¿Puedo acceder si no fui a la universidad?',
    'No tengo carrera, ¿me sirve presentar proyectos propios?',
    '¿Importa más lo que sé hacer que mi titulación?',
    '¿Puedo entrar sin un grado universitario?',
    '¿Cómo valoran mi perfil si no tengo estudios superiores?',
    '¿Un portafolio puede compensar no tener título?',
    '¿La prueba técnica cuenta más que la carrera?',
  ],
  'kb-diploma': [
    '¿Qué documentación me llevo cuando acabe?',
    '¿Qué acreditaciones obtengo al completar los estudios?',
    '¿Recibo algún certificado al finalizar?',
    '¿Qué títulos se entregan al terminar la formación?',
    '¿Cómo se acredita que he completado el programa?',
    '¿El diploma cambia según la especialidad?',
    '¿Qué certificaciones finales puedo conseguir?',
  ],
  'kb-ia-merece': [
    'Con los asistentes de código, ¿sigue teniendo sentido aprender a programar?',
    '¿La inteligencia artificial va a sustituir a los desarrolladores?',
    '¿Qué aportaría una persona si una IA ya escribe código?',
    'Me preocupa que la automatización deje sin trabajo al sector',
    '¿Aprender desarrollo sigue siendo útil con tanta IA?',
    '¿Las empresas necesitan gente que revise código automático?',
    '¿Qué parte del trabajo técnico sigue necesitando criterio humano?',
  ],
  'kb-diferencia-bootcamps': [
    '¿Qué os hace distintos de otras academias intensivas?',
    '¿Por qué escoger Escuela Musk frente a otro centro?',
    '¿En qué cambia vuestro enfoque respecto a un bootcamp?',
    '¿Cómo es vuestra forma de enseñar comparada con otras?',
    '¿Qué tiene de particular la experiencia para el alumno?',
    '¿Qué rasgos os diferencian como escuela online?',
    '¿Qué ofrecéis que no suelan tener otras formaciones?',
  ],
  'kb-freelance': [
    '¿Puedo ganarme la vida trabajando para mis propios clientes?',
    '¿Se aprende a publicar un proyecto independiente?',
    'Me interesa trabajar como autónomo en desarrollo',
    '¿Puedo vender un videojuego que haya creado?',
    '¿Hay opciones para montar mi actividad por mi cuenta?',
    '¿Se aprende a lanzar un producto propio?',
    '¿Qué formación sirve para ofrecer servicios freelance?',
  ],
  'kb-obj-no-tiempo': [
    'Ahora voy bastante justo de tiempo, ¿puedo retomarlo más adelante?',
    '¿Puedo completar los estudios con calma y flexibilidad?',
    'Me preocupa no poder dedicarle tiempo ahora mismo',
    '¿Hay margen para terminar la formación poco a poco?',
    '¿Y si tengo que pausar el estudio una temporada?',
    'No me da la semana para empezar ya, ¿qué opciones tengo?',
    '¿El plazo para finalizar permite organizarse con flexibilidad?',
  ],
  'kb-obj-desconfio': [
    'Me preocupa que una academia online no sea fiable',
    '¿Cómo sé que esto no es una estafa?',
    'No tengo claro si un centro online es de verdad',
    '¿Puedo hablar con alumnos que ya hayan pasado por allí?',
    '¿Qué señales de confianza ofrece la escuela?',
    'Me preocupa que después me dejen sin acompañamiento',
    '¿Cómo puedo resolver las dudas antes de decidir?',
  ],
  'kb-obj-ya-deje': [
    'Ya empecé a mirar esto y lo aparqué, ¿puedo retomarlo?',
    'Lo dejé a medias la otra vez que me informé',
    'Ya conocía la propuesta pero no seguí adelante',
    '¿Podemos volver a hablarlo sin compromiso?',
    'En su momento no continué, ahora me lo estoy replanteando',
    'Ya había visto la información y no di el paso',
    'No llegué a decidirme cuando me lo contaron',
  ],
};

// The question templates a lead uses to ask about a programme's content. They
// are phrased the way the lead writes them on WhatsApp, because they are
// retrieval terms (Folded and stopword-filtered): what matters is the content
// words they contribute — "trata", "consiste", "hablame", "curso",
// "informacion", "enseña" — not the courtesy wrapper.
//
// Hard rule 2 still holds: these templates only reach a `-contenido` passage,
// whose answer is general content, skills and outcomes. No syllabus, no price.
export const CONTENT_QUESTION_TERMS: readonly string[] = [
  'de que trata',
  'de que se trata',
  'en que consiste',
  'hablame de',
  'que es el curso de',
  'informacion de',
  'que me enseñas en',
  'de que va el curso',
];

export const KB_PASSAGES: KbPassage[] = KB_PASSAGE_SOURCE.map((passage) => {
  const exampleQueries = DEVELOPMENT_EXAMPLE_QUERIES[passage.id];
  if (exampleQueries === undefined) {
    throw new Error(`Missing synthetic development queries for ${passage.id}`);
  }
  // Programme-content passages also own the question templates a lead uses to
  // ask "what is this course about". Without them the template words ("trata",
  // "consiste", "hablame", "curso") count as unmatched query terms, which does
  // two harmful things, both measured on 2026-10-27:
  //
  //  - the content passage loses the tie against its own "salidas" passage
  //    (same single programme term, different answer), so "¿de qué trata el de
  //    full stack?" answered with professional outcomes instead of content;
  //  - a single-term query scores under MIN_BM25_SCORE for the rarest
  //    programme, so "¿de qué trata el de videojuegos?" escalated to a human.
  //
  // The terms are data, not a threshold move: MIN_BM25_SCORE and
  // MIN_TERM_COVERAGE stay untouched. They are shared by every `-contenido`
  // passage (each passage keeps its own programme name in `terms`), so a new
  // programme inherits the coverage and the regression test extends with it.
  const contentQuestionTerms = passage.id.endsWith('-contenido') ? CONTENT_QUESTION_TERMS : [];
  return {
    ...passage,
    terms: [...passage.terms, ...contentQuestionTerms],
    exampleQueries,
  };
});

// Passages that exist once per programme (content and professional outcomes).
// They are the ones that can answer a question about a NAMED course, so
// `classify` lets them outrank the generic FAQ entry that covers the same shape
// without a programme ("¿en qué consiste?" vs "¿en qué consiste python?").
// Expressed as a predicate here, next to the ids, so the intent layer never
// parses slugs.
const PROGRAMME_PASSAGE_IDS = new Set(
  KB_PASSAGES.filter((passage) => /-(contenido|salidas)$/.test(passage.id)).map(
    (passage) => passage.id,
  ),
);

export function isProgrammePassage(passage: KbPassage): boolean {
  return PROGRAMME_PASSAGE_IDS.has(passage.id);
}
