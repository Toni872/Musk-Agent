# Pedido de contenido a Nicolás (Escuela Musk)

Estado: **propuesta enviada — pendiente de respuesta de Nicolás**. Nada de lo que
hay aquí está acordado.

Fecha: 17 de octubre de 2026. Revisión de dialecto y registro: 18 de octubre de
2026 (apartados 5 a 7).

Relacionado: `src/content.ts` (contenido aprobado), `src/content.demo.ts`
(contenido de ejemplo), `AGENTS.md` ("Decisiones abiertas"),
`docs/decisiones-operativas-nicolas.md` (seguimiento, llamada, aviso y datos del
lote: las decisiones que no son de contenido) y `docs/checklist-canal-real.md`
(qué queda por cerrar antes de tocar un lead real).

## Contexto

El simulador publicado arranca con el perfil de contenido **de ejemplo**
(`src/content.demo.ts`), no con el contenido aprobado. El motivo es que el
contenido aprobado (`src/content.ts`) tiene cuatro puntos marcados
`TODO(decisión)` que impiden que el agente pueda saludar y cualificar. Mientras no
estén cerrados, la web publicada enseña contenido de muestra.

Los cuatro puntos de abajo van como **propuesta**: ninguno se presenta como
acordado, y nada de esto se envía a leads reales sin la aprobación de Nicolás
(regla dura 11 de `AGENTS.md`).

## 1. Mensaje inicial

Es lo primero que recibe el lead por WhatsApp. Propuesta:

> Hola, te escribo de Escuela Musk. Hace un tiempo te interesaste por nuestra
> formación en desarrollo. ¿Sigue siendo de tu interés? Te cuento en qué consiste
> y, si encaja, te llamamos sin compromiso.

Pendiente en el código: `initialMessage` de `src/content.ts`.

## 2. Preguntas de cualificación

Serán solo dos, para no cansar al lead. Ninguna puntúa ni excluye a nadie.

- ¿Has estudiado o trabajado algo relacionado con programación, o empezarías
  desde cero?
- ¿Te planteas empezar pronto o más de cara al año que viene?

Pendiente en el código: `qualificationQuestions` de `src/content.ts`.

## 3. Presentación de Escuela Musk

Se usa solo cuando el lead pregunta "¿quiénes sois?". Propuesta:

> Somos Escuela Musk, una escuela de formación tecnológica. Impartimos formación
> práctica, con proyectos reales y acompañamiento del equipo docente.

Si Nicolás quiere añadir o cambiar algo del equipo y de la propuesta, se pasa su
texto: no se inventa.

Pendiente en el código: `companyPresentation` de `src/content.ts`.

## 4. Confirmación de la formación elegida

Por ahora consta como elegida el **Curso de Desarrollo Full Stack**. Si es
correcta, queda cerrada; si se prefiere otra, hay que revisar los textos de
habilidades, salidas y metodología, que están construidos sobre esa formación.

## 5. Revisión de dialecto (registro y español de España)

Se han revisado las frases que ve el lead buscando formulaciones propias del
español de América. Han aparecido tres en el contenido aprobado y dos en el de
ejemplo, todas de la misma familia: la perífrasis "dejar anotado" y el uso
americano de "contactar". El resto del texto revisado no presenta marcadores.

Propuesta de corrección (nada aplicado hasta que Nicolás lo apruebe, regla 11):

| Dónde | Ahora | Propuesta | Motivo |
| --- | --- | --- | --- |
| Respuesta de duda sin contenido aprobado | "…así que lo dejo anotado como duda para que una persona del equipo te lo confirme. ¿Te viene bien que te contacten para aclararlo?" | "…así que lo apunto como duda para que una persona del equipo te lo confirme. ¿Te viene bien que se pongan en contacto contigo?" | "dejar anotado" no es la fórmula española; "contactar a" es la variante americana |
| El lead pide hablar con una persona | "Dejo anotado y te pongo con el equipo. ¿Me confirmas tu teléfono o el mejor momento para que te contacten?" | "Lo apunto y te pongo con el equipo. ¿Me confirmas tu teléfono o el mejor momento para que se pongan en contacto contigo?" | Igual: perífrasis y "contactar" |
| El lead acepta la llamada | "Perfecto, dejo anotado que te va bien la llamada. El equipo se pone en contacto contigo para acordar el detalle." | "Perfecto, queda apuntado que te va bien la llamada. El equipo se pone en contacto contigo para concretar los detalles." | Igual, y "concretar los detalles" es más natural que "acordar el detalle" |
| Contenido de ejemplo (2 apariciones) | "Un portafolio de proyectos propios" · "construir su propio portafolio" | "Un porfolio de proyectos propios" · "construir su propio porfolio" | El diccionario académico recoge "porfolio"; "portafolio" es la variante de América |

Fuentes: Fundéu (RAE) documenta "contactar con" como forma frecuente en el
español europeo frente a "contactar a"; el DLE recoge la forma "porfolio".

**Tratamiento fijado:** tuteo y español de España (decisión de Script9, 18 de
octubre de 2026). La redacción de estas frases solo necesita el visto bueno
final de Nicolás antes de aplicarse (regla 11).

## 6. La muestra de ejemplo dice más que el contenido aprobado

El simulador arranca con el contenido **de ejemplo**, y ese contenido contiene
cuatro afirmaciones que el aprobado evita a propósito.

No es una fuga: la muestra va marcada como muestra. El propio archivo lo dice
("not approved by MUSK"), el selector de la web ofrece "DEMO (muestra, no
aprobado)" y el aviso de contenido aparece en la conversación.

- "…con grabaciones disponibles para que las veas cuando mejor te venga": el
  contenido aprobado habla de clases en directo y workshops, nunca de
  grabaciones.
- "Tienes tutorías personalizadas": lo aprobado es "acompañamiento continuo" y
  "al menos una tutoría semanal", que no es lo mismo.
- "…a tu ritmo entre sesiones": lo aprobado remite los horarios a la llamada.
- "…perfiles junior para incorporarse a un equipo real": lo aprobado evita
  cualquier promesa de incorporación.

Ningún documento del repositorio respalda esas cuatro condiciones. Si el dossier
de MUSK las recoge, la decisión es cuál de los dos textos gobierna; si no, son
frases nuestras. En cualquier caso, **ninguna debería migrar al contenido
aprobado sin confirmación escrita**.

## 7. Revisión de registro (formalidad y cercanía)

Se han revisado las 41 frases de cara al lead de los tres archivos: 10 en
`rules.ts`, 14 en `content.ts` y 17 en `content.demo.ts` (los marcadores
`TODO(decisión)` no son texto para el lead y no cuentan). Criterio: tuteo
profesional de España, claro y cercano, sin sonar administrativo ni informal y
sin perder la cercanía de MUSK.

| Dónde | Ahora | Propuesta | Motivo |
| --- | --- | --- | --- |
| `rules.ts` → `REPLY_TEMPLATES.price` | "No puedo compartir el precio ni los importes por aquí. Lo conversamos con detalle en una llamada con el equipo y te resolvemos todas las dudas. ${CALL_INVITATION}" | "No puedo darte el precio ni los importes por aquí. Lo conversamos con detalle en una llamada con el equipo y te resolvemos todas las dudas. ${CALL_INVITATION}" | Imprecisión: "compartir" da a entender que el agente tiene el precio; en realidad no puede darlo, y la plantilla de financiación ya dice "No puedo darte…". |
| `rules.ts` → `CALL_INVITATION` (compartida por `price` y `callProposal`) | "¿Me dejas tu contacto o un momento en el que te venga bien que te llamen?" | "¿Me dejas tu contacto o un momento en el que te venga bien para que te llamen?" | Redacción trabada: encadena dos "que" seguidos ("en el que… que te llamen"); con "para que te llamen" se lee bien y el sentido no cambia. |
| `rules.ts` → `REPLY_TEMPLATES.stop` | "Entendido, respeto tu decisión: no vuelvo a escribirte. Queda registrado como "no continuar"." | "Entendido, respeto tu decisión: no vuelvo a escribirte. Queda registrado." | Registro administrativo: expone al lead la etiqueta interna del sistema; "Queda registrado" comunica lo mismo sin jerga. |

Son tres cambios nuevos. Todo lo demás ya cumple el criterio y no se toca: se
mantienen las fórmulas naturales ("Perfecto", "Claro", "Buena pregunta",
"¡Hola!", "aquí estoy") y no hay marcadores americanos fuera del apartado 5,
cuyas cinco frases ya tienen propuesta propia y no se repiten aquí. Nada está
aplicado en el código (regla 11); al aplicar los cambios habrá que ajustar la
aserción de `tests/rules.test.ts` sobre la respuesta de parada
(`/no continuar/i`) y las citas literales de `GUION_DEMO.md` e
`INSTRUCCIONES.md`.

## 8. Copy nuevo pendiente de aprobación (contenido de la base de conocimiento)

Tres textos nuevos de cara al lead, ya en el código pero **pendientes del visto
bueno de Nicolás** como el resto de plantillas y contenido de ejemplo (regla
11). Ninguno contiene precios, importes, porcentajes ni temario detallado — lo
garantiza el guardián de salida (`guardReply`), que bloquearía su envío si lo
tuvieran. Los tres viven **solo en el perfil de ejemplo** (`src/content.demo.ts`):
el contenido aprobado (`src/content.ts`) no recibe copy nuevo sin firmar.

1. **Respuesta de catálogo** (contenido de ejemplo, entrada
   `catalogo-formaciones` de `src/content.demo.ts`), para "¿qué cursos
   tenéis?":

   > Ahora mismo trabajamos cinco programas: Curso de programación en Python,
   > Diseño web y Desarrollo Front End con IA, Desarrollo Back End con IA,
   > Desarrollo Full Stack con IA y Máster en Diseño y Desarrollo de Videojuegos
   > con IA. Todos son online, prácticos y se empieza desde cero. Si me cuentas
   > qué te atrae más, te oriento, y el detalle de cada programa lo ves con una
   > persona del equipo.

2. **Respuesta de modalidad enriquecida** (contenido de ejemplo, entrada
   `modalidad` de `src/content.demo.ts`), que ahora también cubre "dónde está la
   academia":

   > Todo es online: campus virtual, comunidad en Discord y tutores personales
   > que te acompañan. No hay horarios fijos de conexión, así que puedes
   > compaginarlo con tu rutina.

3. **Segunda duda consecutiva** (`DEMO_CONTENT.doubtFollowup` de
   `src/content.demo.ts`): cuando el lead hace dos preguntas sin respuesta
   aprobada seguidas, la segunda recibe esta variante en lugar de pedir el
   contacto a secas:

   > Eso también lo anoto como duda para que te lo confirmen. Si te encaja, una
   > persona del equipo te contacta y lo veis todo con calma. ¿Te viene bien?

   Este texto **ya no está en `REPLY_TEMPLATES`** (`src/rules.ts`): las
   plantillas compartidas las usa todo perfil, incluido el contenido aprobado,
   así que meter ahí copy sin firmar lo habría enviado a leads reales (reglas 4
   y 11). Ahora es opcional y propio de cada perfil
   (`ApprovedContent.doubtFollowup`): el perfil aprobado no lo define, así que
   conserva el comportamiento anterior (la invitación aprobada) hasta que
   Nicolas lo firme.

4. **Perfil aprobado (`src/content.ts`): sin copy nuevo, pero sí cambia el
   enrutado.** La entrada `modalidad` del contenido aprobado **no ha cambiado
   de redacción**; solo se le han añadido cinco palabras clave: `donde esta`,
   `donde queda`, `academia`, `ubicacion` y `direccion`. Con ellas, un lead real
   que pregunta "¿dónde está la academia?" deja de caer en la regla 5 (duda
   registrada) y recibe la respuesta aprobada de modalidad, que remite los
   horarios y la disponibilidad a la llamada. Es un cambio de enrutado sobre
   leads reales, aunque no cambie una sola palabra del texto aprobado: por eso
   conviene confirmarlo.

## 9. Copy de la base de conocimiento (35 pasajes, pendiente de aprobación)

La Fase 0 añade una **capa de base de conocimiento**: `src/kb.ts` guarda como
datos 35 pasajes de `escuela-musk-base-conocimiento.md` (qué es la escuela, el
método, las certificaciones, las cinco formaciones, los demás programas, la
guía de recomendación, las preguntas frecuentes del lead y las objeciones
típicas de un lead "congelado") y `src/retrieval.ts` los consulta de forma
determinista (BM25 + cobertura de términos, **sin LLM, sin embeddings y sin
dependencias**). Cada pasaje lleva su **propia** respuesta breve para el lead:
el documento de origen es una fuente, nunca se envía entero (regla 10).

**Los 35 textos de respuesta son copy nuevo de cara al lead y, como todo el
contenido de este repositorio, van como propuesta: no están firmados.** Por
eso viven **solo en el perfil de ejemplo** (`src/content.demo.ts`); el
contenido aprobado (`src/content.ts`) no lleva la base de conocimiento y, sin
ella, el agente se comporta exactamente como hasta ahora (reglas 4 y 11).

Lo que sí se puede afirmar de este copy, y lo que comprueban los tests:

- **No contiene ninguna cifra**: ni precios, ni importes, ni salarios, ni
  porcentajes, ni horas, ni duraciones. Un test recorre los 35 pasajes y falla
  si encuentra un solo dígito en una respuesta.
- **No contiene el temario detallado**: sí el contenido general, las
  habilidades (el stack de cada formación) y las salidas profesionales, que es
  lo que permite la regla 2. Ni un módulo a módulo.
- **No contiene ningún tema prohibido**: precio, condiciones de financiación,
  fechas de inicio, calendario, dedicación semanal, devoluciones, becas o
  bonificaciones, requisitos técnicos de acceso, condiciones del convenio de
  prácticas ni ubicación física de la escuela. Esos temas **escalan siempre** a
  una persona (regla 5), y la capa lo garantiza con una lista explícita de
  temas prohibidos, no con la puntuación.
- **Todas las respuestas pasan el guard de salida** (`guardReply`): ni
  importes, ni porcentajes, ni promociones, ni promesas de empleo. Cuando la
  escuela afirma "prácticas garantizadas", el texto dice que lo garantizado es
  el convenio y que la empresa se asigna al final según las preferencias del
  alumno; no promete puesto, ni remuneración, ni empresa.
- **La FAQ escrita a mano conserva la prioridad**: la base de conocimiento solo
  entra cuando la FAQ no responde.

Lo que necesita Nicolás:

1. **Validar o corregir los 35 textos de respuesta** (son propuesta, no
   acuerdo). Los que más conviene revisar: la descripción de la escuela, el
   método, la certificación ARP y las tres certificaciones específicas, las
   cinco formaciones con su stack y sus salidas, y las cinco objeciones
   ("no tengo tiempo", "no me fío de las academias", "la IA me va a quitar el
   trabajo", "ya lo vi y lo dejé", "el método es práctico").
2. **Decidir qué datos del documento de origen se quedan fuera** tal cual.
   Hoy quedan fuera, por decisión propia: los porcentajes de empleo, los
   salarios, las horas, las fechas, los precios y las inconsistencias internas
   de la web (apartado 9 del documento de origen). Si Nicolás quiere alguno de
   esos datos, **no** se añaden aquí: el producto no comunica cifras (regla 1).
3. **Confirmar el encaje con las cuatro decisiones abiertas** (formación
   elegida, mensaje inicial, cualificación, presentación de MUSK): la base de
   conocimiento amplía lo que el agente sabe, pero no cierra ninguna de las
   cuatro.

## Límites que se mantienen

- Sin precios ni importes (regla 1).
- Sin temario detallado; sí contenido general, habilidades y salidas (regla 2).
- Sin promesas de empleo ni condiciones inventadas (regla 4).
- Las preguntas de cualificación no llevan examen, puntuación ni exclusión
  automática.
- La base de conocimiento (apartado 9) no comunica ninguna cifra y deja fuera
  los temas que deben escalar a una persona.

## Qué ocurre cuando estos puntos estén cerrados

1. Se sustituyen los placeholders `TODO(decisión)` de `src/content.ts`.
2. Se cambia el perfil por defecto del simulador al contenido aprobado
   (hoy `this.profile = options.profile ?? 'demo'` en `ui/chat.ts`).
3. Se aplican las correcciones de copy aprobadas (apartados 5 y 7) y se
   sincronizan la aserción de `tests/rules.test.ts` sobre la respuesta de parada
   y las citas literales de `GUION_DEMO.md` e `INSTRUCCIONES.md`.
4. Se resuelven las cuatro afirmaciones de la muestra (apartado 6): se retiran, o
   Nicolás confirma por escrito que esas condiciones existen.
5. Se regenera la web publicada y se vuelve a verificar contra el bundle local.
6. Si Nicolás firma los 35 pasajes de la base de conocimiento (apartado 9), la
   base pasa del perfil de ejemplo al contenido aprobado: se copia
   `KB_PASSAGES` a `ApprovedContent.kb` en `src/content.ts` y se retiran de
   `src/content.demo.ts`. Hasta entonces, el contenido aprobado se comporta
   como siempre.
