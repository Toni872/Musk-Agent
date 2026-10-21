// The approved knowledge base of Escuela Musk, as DATA.
//
// Source of truth: `escuela-musk-base-conocimiento.md` (repository root). Each
// passage is a small, self-contained chunk of that document with its OWN
// lead-facing answer. Hard rule 10: a guide used as a knowledge source does
// NOT authorize sending it whole, so the document is never quoted: only the
// per-passage `answer` is ever sent to the lead.
//
// Hard rules 4 and 11: this content is PENDING MUSK sign-off, so it lives
// ONLY in the DEMO content profile (src/content.demo.ts). The approved
// profile (src/content.ts) does not get it.
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
}

export const KB_PASSAGES: KbPassage[] = [
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
      'El máster de videojuegos: Unity y Unreal, y el proyecto final es un juego tuyo publicado en Steam. Se empieza desde cero, con mentores que te guide.',
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
      'Las prácticas en empresa están garantizadas mediante un convenio, y el equipo de orientación laboral te pregunta tus preferencias y asigna la empresa. Las condiciones te las confirma una persona del equipo.',
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
      'Sí, te ayudan a encontrar trabajo: hay orientación laboral desde el primer día, con el CV de la escuela, el LinkedIn preparado, masterclasses, pruebas técnicas y contacto con reclutadoras.',
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
      'Sí, hay camino a freelance: en Back End se trabaja cómo publicar tu proyecto y buscar trabajo por cuenta propia, y en videojuegos publicas y vendes tu propio juego en Steam.',
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
