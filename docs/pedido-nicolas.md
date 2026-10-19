# Pedido de contenido a Nicolás (Escuela Musk)

Estado: **propuesta enviada — pendiente de respuesta de Nicolás**. Nada de lo que
hay aquí está acordado.

Fecha: 17 de octubre de 2026. Revisión de dialecto y registro: 18 de octubre de
2026 (apartados 5 a 7).

Relacionado: `musk/src/content.ts` (contenido aprobado), `musk/src/content.demo.ts`
(contenido de ejemplo), `AGENTS.md` ("Decisiones abiertas") y
`docs/decisiones-operativas-nicolas.md` (seguimiento, llamada, aviso y datos del
lote: las decisiones que no son de contenido).

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

## Límites que se mantienen

- Sin precios ni importes (regla 1).
- Sin temario detallado; sí contenido general, habilidades y salidas (regla 2).
- Sin promesas de empleo ni condiciones inventadas (regla 4).
- Las preguntas de cualificación no llevan examen, puntuación ni exclusión
  automática.

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
