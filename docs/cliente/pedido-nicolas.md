# Pedido de contenido a Nicolás (Escuela Musk)

Estado: propuesta enviada con respuestas parciales de Nicolás recibidas inline en
el correo de Miguel (fecha no indicada en el material compartido). Las secciones
que siguen marcadas como propuestas continúan pendientes; las confirmaciones se
registran en el apartado 10 y no implican que el contenido completo esté firmado.

Fecha: 17 de octubre de 2026. Revisión de dialecto y registro: 18 de octubre de
2026 (apartados 5 a 7).

Actualización (27 de octubre de 2026): perfil único en `app/content.py`; las
referencias al perfil DEMO de más abajo describen el copy que ahora vive ahí,
pendiente de firma.

Actualización (13 de noviembre de 2026): las plantillas de cara al lead de
`app/rules.py` y las preguntas de cierre de `app/agent.py` se reescribieron para un
tono más humano y cercano, con formulaciones variadas y sin perífrasis internas.
Ese copy sigue pendiente de firma de MUSK (regla 11), como el resto del copy
unificado; los apartados 5 y 7 reflejan el texto aplicado.

Relacionado: `app/content.py` (perfil único con copy unificado pendiente de firma
de MUSK), `AGENTS.md` ("Decisiones abiertas"),
`docs/operacion/decisiones-operativas-nicolas.md` (seguimiento, llamada, aviso y datos del
lote: las decisiones que no son de contenido) y `docs/operacion/checklist-canal-real.md`
(qué queda por cerrar antes de tocar un lead real).

## Contexto

El simulador arranca con el perfil único (`app/content.py`). Ese perfil reúne el
copy que antes se repartía entre el contenido aprobado y el de ejemplo, y sigue
pendiente de firma de MUSK. Mientras no esté firmado, la web publicada no debe
usarse con leads reales.

Los cuatro puntos de abajo van como **propuesta**: ninguno se presenta como
acordado, y nada de esto se envía a leads reales sin la aprobación de Nicolás
(regla dura 11 de `AGENTS.md`).

## 1. Mensaje inicial

Es lo primero que recibe el lead por WhatsApp. Propuesta:

> Hola, te escribo de Escuela Musk. Hace un tiempo te interesaste por nuestra
> formación en desarrollo. ¿Sigue siendo de tu interés? Te cuento en qué consiste
> y, si encaja, te llamamos sin compromiso.

Pendiente en el código: `initial_message` de `app/content.py`.

## 2. Preguntas de cualificación (propuesta original, sustituida en la DEMO)

La propuesta original planteaba dos preguntas; la respuesta posterior de Nicolás
priorizó ir directamente a la entrevista o llamada, no hacer una cualificación
extensa. La DEMO usa ahora una única pregunta breve sobre el objetivo del lead,
como conversación para orientar la llamada. No es un examen ni un filtro. El
contenido aprobado conserva sus marcadores `TODO(decisión)` y no se ha modificado.

- ¿Has estudiado o trabajado algo relacionado con programación, o empezarías
  desde cero?
- ¿Te planteas empezar pronto o más de cara al año que viene?

Pendiente en el código: la pregunta `goal` del prompt de `app/agent.py`.

## 3. Presentación de Escuela Musk

Se usa solo cuando el lead pregunta "¿quiénes sois?". Propuesta:

> Somos Escuela Musk, una escuela de formación tecnológica. Impartimos formación
> práctica, con proyectos reales y acompañamiento del equipo docente.

Si Nicolás quiere añadir o cambiar algo del equipo y de la propuesta, se pasa su
texto: no se inventa.

Pendiente en el código: `company_presentation` de `app/content.py`.

## 4. Confirmación de la formación elegida

Por ahora consta como elegida el **Curso de Desarrollo Full Stack**. Si es
correcta, queda cerrada; si se prefiere otra, hay que revisar los textos de
habilidades, salidas y metodología, que están construidos sobre esa formación.

## 5. Revisión de dialecto (registro y español de España)

Se han revisado las frases que ve el lead buscando formulaciones propias del
español de América. Aparecieron en el contenido de ejemplo ("portafolio") y, antes
de la reescritura de tono del 13-11-2026, en la familia "dejar anotado" de las
plantillas de `app/rules.py`. Esa reescritura ya sustituyó esas plantillas por un
texto más humano, sin perífrasis ni "contactar a" (sigue pendiente de firma de
MUSK). Estado de cada una:

| Dónde | Ahora | Propuesta | Motivo |
| --- | --- | --- | --- |
| Respuesta de duda sin contenido aprobado | "Prefiero que esto te lo confirme una persona del equipo para no darte algo a medias. ¿Te viene bien que te contacten?" | *(aplicado el 13-11-2026 con la reescritura de tono)* | Se retiró la familia "dejar anotado"; el texto nuevo es más humano y sigue pendiente de firma de MUSK |
| El lead pide hablar con una persona | "Claro, mejor que hables con una persona. Te paso con el equipo. ¿Me confirmas tu teléfono o el mejor momento para que te contacten?" | *(aplicado el 13-11-2026)* | Igual: sin perífrasis y sin "contactar a" |
| El lead acepta la llamada | "Perfecto, el equipo se pondrá en contacto contigo para concretar la llamada. ¡Gracias!" | *(aplicado el 13-11-2026)* | Igual; "concretar la llamada" en lugar de "acordar el detalle" |
| Contenido de ejemplo (2 apariciones) | "Un portafolio de proyectos propios" · "construir su propio portafolio" | "Un porfolio de proyectos propios" · "construir su propio porfolio" | El diccionario académico recoge "porfolio"; "portafolio" es la variante de América |

Fuentes: Fundéu (RAE) documenta "contactar con" como forma frecuente en el
español europeo frente a "contactar a"; el DLE recoge la forma "porfolio".

**Tratamiento fijado:** tuteo y español de España (decisión de Script9, 18 de
octubre de 2026). La redacción de estas frases necesita el visto bueno final de
Nicolás (regla 11); las tres plantillas del cuadro ya están aplicadas y el copy
sigue pendiente de firma.

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

Se han revisado las 41 frases de cara al lead: 10 en `app/rules.py`, 14 en el
contenido aprobado y 17 en el de ejemplo (hoy unificados en `app/content.py`; los marcadores
`TODO(decisión)` no son texto para el lead y no cuentan). Criterio: tuteo
profesional de España, claro y cercano, sin sonar administrativo ni informal y
sin perder la cercanía de MUSK.

| Dónde | Ahora | Propuesta | Motivo |
| --- | --- | --- | --- |
| `app/content.py` → respuesta de precio (`price_reply`) | "El precio prefiero que te lo explique una persona. Sí hay opciones de financiación y dos años flexibles para completarla. Si quieres, te paso con el equipo y te lo cuenta en una llamada." | *(aplicado)* | Ya no dice "compartir": usa "prefiero que te lo explique", coherente con la respuesta de financiación |
| Preguntas de cierre (`app/agent.py`) | "¿Quieres que te lo explique una persona en una llamada?" · "¿Te va bien que te llamen y te lo cuenten con calma?" · "¿Prefieres una llamada para que te lo expliquen todo?" · … | *(aplicado el 13-11-2026)* | Set variado de preguntas de llamada y de seguimiento para no repetir la misma frase; la cadencia la decide el interés real |
| `app/rules.py` → `REPLY_TEMPLATES["stop"]` | "Perfecto, respeto tu decisión y no te vuelvo a escribir. Gracias por tu tiempo." | *(aplicado el 13-11-2026)* | Ya no expone la etiqueta interna "no continuar" ni usa registro administrativo |

Los tres cambios del apartado 7 quedaron aplicados el 13-11-2026 con la
reescritura de tono. Todo lo demás ya cumple el criterio y no se toca: se
mantienen las fórmulas naturales ("Perfecto", "Claro", "¡Hola!", "aquí estoy").
Se retira "Buena pregunta" por decisión de Script9 (13-11-2026): es una muletilla
que hoy usan casi todos los asistentes de IA y resta naturalidad, igual que
"excelente pregunta" o "me alegra que preguntes". El copy sigue pendiente de firma
de MUSK (regla 11). No hay marcadores americanos fuera del apartado 5, cuya
propuesta de "porfolio" sigue pendiente.

## 8. Copy nuevo pendiente de aprobación (contenido de la base de conocimiento)

Tres textos nuevos de cara al lead, ya en el código pero **pendientes del visto
bueno de Nicolás** como el resto de plantillas y contenido de ejemplo (regla
11). Ninguno contiene precios, importes, porcentajes ni temario detallado — lo
garantiza el guardián de salida (`guard_reply`), que bloquearía su envío si lo
tuvieran. Los tres viven **solo en el perfil único** (`app/content.py`), como
copy pendiente de firma: el contenido no recibe copy nuevo sin firmar.

1. **Respuesta de catálogo** (entrada `catalogo-formaciones` de
   `app/content.py`), para "¿qué cursos
   tenéis?":

   > Cinco programas: Python, Front End, Back End, Full Stack y el máster de
   > videojuegos. Todos online y desde cero, con IA en los de desarrollo y
   > videojuegos.

   Se acompaña de la pregunta de objetivo en el mismo mensaje; ya no incluye
   «Dime qué te atrae y te oriento», porque la pregunta siguiente lo dice.

2. **Respuesta de modalidad enriquecida** (entrada `modalidad` de
   `app/content.py`), que ahora también cubre "dónde está la
   academia":

   > Todo es online: campus virtual, comunidad en Discord y tutores personales
   > que te acompañan. No hay horarios fijos de conexión, así que puedes
   > compaginarlo con tu rutina.

3. **Segunda duda consecutiva** (la antigua variante de segunda duda del perfil
   de ejemplo): cuando el lead hace dos preguntas sin respuesta
   aprobada seguidas, la segunda recibe esta variante en lugar de pedir el
   contacto a secas:

   > Eso también lo anoto como duda para que te lo confirmen. Si te encaja, una
   > persona del equipo te contacta y lo veis todo con calma. ¿Te viene bien?

   Este texto **ya no está en `REPLY_TEMPLATES`** de `app/rules.py`: las
   plantillas compartidas las usa todo el motor, así que meter ahí copy sin
   firmar lo habría enviado a leads reales (reglas 4 y 11). Ahora es opcional y
   propio del contenido: el perfil único no lo define, así que conserva el
   comportamiento anterior (la invitación aprobada) hasta que Nicolás lo firme.

4. **Perfil único (`app/content.py`): sin copy nuevo, pero sí cambia el
   enrutado.** La entrada `modalidad` del contenido aprobado **no ha cambiado
   de redacción**; solo se le han añadido cinco palabras clave: `donde esta`,
   `donde queda`, `academia`, `ubicacion` y `direccion`. Con ellas, un lead real
   que pregunta "¿dónde está la academia?" deja de caer en la regla 5 (duda
   registrada) y recibe la respuesta aprobada de modalidad, que remite los
   horarios y la disponibilidad a la llamada. Es un cambio de enrutado sobre
   leads reales, aunque no cambie una sola palabra del texto aprobado: por eso
   conviene confirmarlo.

## 9. Copy de la base de conocimiento (pendiente de aprobación, salvo excepción indicada)

La Fase 0 añade una **capa de base de conocimiento**: `app/kb.py` guarda como
datos 35 pasajes de `escuela-musk-base-conocimiento.md` (qué es la escuela, el
método, las certificaciones, las cinco formaciones, los demás programas, la
guía de recomendación, las preguntas frecuentes del lead y las objeciones
típicas de un lead "congelado") y `app/retrieval.py` los consulta de forma
determinista (BM25 + cobertura de términos, **sin LLM, sin embeddings y sin
dependencias**). Cada pasaje lleva su **propia** respuesta breve para el lead:
el documento de origen es una fuente, nunca se envía entero (regla 10).

Los textos de respuesta son copy de cara al lead y, como todo el contenido de
este repositorio, van como propuesta: no están firmados, **salvo el pasaje sobre
el plazo flexible de finalización**, cuyo dato concreto sí confirmó Nicolás en
su respuesta inline. Esa confirmación no firma el resto de la base. Por
eso los textos de respuesta viven en la capa de base de conocimiento
(`app/kb.py`), como copy pendiente de firma, no en el contenido aprobado
(reglas 4 y 11).

Lo que sí se puede afirmar de este copy, y lo que comprueban los tests:

- **No contiene cifras numéricas**: ni precios, importes, salarios, porcentajes u
  horas. El plazo confirmado de dos años se escribe con palabras, sin dígitos.
- **No contiene el temario detallado**: sí el contenido general, las
  habilidades (el stack de cada formación) y las salidas profesionales, que es
  lo que permite la regla 2. Ni un módulo a módulo.
- **No contiene temas de pago no autorizados**: precio, importes, intereses,
  cuotas u otras condiciones. Las fechas de inicio, calendario, dedicación
  semanal, devoluciones, becas o
  bonificaciones, requisitos técnicos de acceso, condiciones del convenio de
  prácticas ni ubicación física de la escuela. Esos temas **escalan siempre** a
  una persona (regla 5), y la capa lo garantiza con una lista explícita de
  temas prohibidos, no con la puntuación.
- **Todas las respuestas pasan el guard de salida** (`guard_reply`): ni
  importes, ni porcentajes, ni promociones, ni garantías ni promesas de empleo.
  El guard rechaza cualquier forma de «garantiz*»; los pasajes de prácticas,
  orientación laboral, videojuegos y contenido freelance no aseguran resultados,
  una empresa asignada ni una publicación.
- **La FAQ escrita a mano conserva la prioridad**: la base de conocimiento solo
  entra cuando la FAQ no responde.

Lo que necesita Nicolás:

1. **Validar o corregir los textos de respuesta pendientes** (son propuesta, no
   acuerdo). El plazo flexible de finalización es la excepción ya confirmada. Los
   que más conviene revisar: la descripción de la escuela, el
   método, la certificación ARP y las tres certificaciones específicas, las
   cinco formaciones con su stack y sus salidas, y las cinco objeciones
   ("no tengo tiempo", "no me fío de las academias", "la IA me va a quitar el
   trabajo", "ya lo vi y lo dejé", "el método es práctico").
2. **Decidir qué datos del documento de origen se quedan fuera** tal cual.
   Hoy quedan fuera, por decisión propia: los porcentajes de empleo, los
   salarios, las horas, las fechas, los precios y las inconsistencias internas
   de la web (apartado 9 del documento de origen). Si Nicolás quiere alguno de
   esos datos, **no** se añaden aquí: el producto no comunica cifras (regla 1).
3. **Confirmar el encaje con las decisiones de contenido que siguen abiertas**
   (mensaje inicial, cualificación del perfil aprobado, presentación de MUSK): la base de
   conocimiento amplía lo que el agente sabe, pero no cierra ninguna de las
   cuatro.

## Límites que se mantienen

- Sin precios ni importes (regla 1).
- Sin temario detallado; sí contenido general, habilidades y salidas (regla 2).
- Sin promesas de empleo ni condiciones inventadas (regla 4).
- Nicolás confirmó que existen opciones de financiación y que la formación se
  puede completar en dos años con flexibilidad. Precio, importes, intereses,
  cuotas y otras condiciones de pago siguen fuera del contenido aprobado.
- Las preguntas de cualificación no llevan examen, puntuación ni exclusión
  automática.
- La base de conocimiento no contiene dígitos; el pasaje de tiempo confirmado
  puede expresar «dos años» con palabras. Los demás temas que deben escalar siguen
  bloqueados.

## Qué ocurre cuando el copy unificado esté firmado

1. Se registra la validación de Nicolás en este documento y en
   `docs/operacion/checklist-canal-real.md`, sin darla por supuesta antes de que exista.
2. Si Nicolás corrige alguna redacción, se aplica en `app/content.py` y se
   sincronizan los tests y las citas literales de `docs/guiones/GUION_DEMO.md` e
   `INSTRUCCIONES.md`.
3. Se comprueba de nuevo el conjunto de evaluación y se reconstruye la imagen
   Docker; después se verifica en local (`http://localhost:4173`).

No hay perfiles que alternar ni una base de conocimiento que migrar: los 35
pasajes y el resto del copy ya viven en el perfil único, pendientes de firma.

## 10. Respuestas confirmadas por Nicolás (correo de Miguel)

Estas decisiones se implementan como datos editables en los perfiles de contenido;
no se han codificado como textos rígidos de la máquina de estados:

- **Formaciones:** se puede empezar con las cinco a nivel de presentación general.
  No hace falta preparar ahora el catálogo detallado completo.
- **Objetivo de conversación:** llevar al lead directamente a la entrevista o
  llamada. Las preguntas deben conducir a esa conversación, no convertirse en un
  cuestionario extenso.
- **Financiación y tiempo:** se puede decir que hay opciones de financiación y que
  la formación se puede completar en dos años con flexibilidad. No se autorizan
  precios, importes, intereses, condiciones de cuotas ni otras condiciones de pago.
- **Aviso:** Laura es la destinataria y decide a quién asignarlo. En este repositorio
  el destino es solo simulado; no se envía un WhatsApp real ni se integra el CRM.

La pregunta y el cierre del perfil DEMO son copy configurable; otros contenidos de
la DEMO y la base de conocimiento siguen pendientes de firma. Estas confirmaciones
no cierran la cobertura real de Laura, el canal, la privacidad ni las demás
decisiones previas al piloto.
