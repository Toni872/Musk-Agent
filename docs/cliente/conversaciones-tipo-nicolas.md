# Conversaciones tipo para validar con MUSK

**Estado:** propuesta de trabajo para revisar con Nicolás. **No enviada a ningún lead.**
**Fecha:** 30/10/2026 · **Autor:** Script9
**Qué es:** diez tipos de conversación ya implementados en el simulador, con su
transcripción real, para que MUSK los lea, los marque y nos diga qué cambia.

## 1. Cómo leer este documento

- Las respuestas de la columna **AGENTE** son **reales**: las ha escrito el agente
  del simulador (modelo de lenguaje + base de conocimiento aprobada), no son
  ejemplos redactados a mano.
- El **LEAD** es un lead ficticio. No hay datos personales reales, ni WhatsApp
  real, ni CRM. El aviso al comercial se simula y la destinataria (Laura) también.
- El texto sigue siendo **copy unificado pendiente de firma de MUSK**. Hasta que lo
  apruebes, el agente no atiende leads reales.
- Lo que te pedimos es sencillo: en cada tipo, marca **vale** o **así no**, y
  escribe al lado cómo lo diríais vosotros. No hace falta que redactes tú las
  respuestas: con tu criterio nos vale.

## 2. El arranque común

Todos los tipos de conversación empiezan con el mismo mensaje inicial:

> **AGENTE:** Hola, soy el asistente de Escuela Musk. Te escribo sobre la formación,
> pero sin prisa: si ahora no es buen momento, me lo dices y hablamos otro día.
> ¿Cómo llevas la semana?

**Por qué así:** se presenta, no vende, deja la puerta abierta a que el lead diga
«ahora no» y abre con una pregunta cotidiana, no con un formulario. El objetivo no
es cualificar: es conseguir respuesta y llevar la conversación a una llamada.

## 3. Los diez tipos de conversación

### 3.1. Reapertura en frío de un lead antiguo

**Cuándo ocurre:** el lead contesta al primer mensaje con desconfianza («¿quién
eres?») o pide contexto.

> **LEAD:** ¿Quién eres?
> **AGENTE:** Soy el asistente virtual de WhatsApp de Escuela Musk, la escuela online
> de programación, videojuegos e inteligencia artificial. Entiendo que quieras saber
> más, ¿te paso con el equipo?
>
> **LEAD:** Ah, ya, la escuela. ¿Y eso qué es exactamente?
> **AGENTE:** Escuela Musk es una escuela online de formación tecnológica que enseña
> programación, desarrollo de videojuegos e inteligencia artificial mediante clases
> en directo, tutorías y proyectos guiados con acompañamiento continuo. Es una
> formación práctica y acompañada para dar el salto profesional en el sector. ¿Te
> paso con el equipo?

**Qué hace el agente:** se identifica sin rodeos, explica la escuela solo con
información aprobada y cierra cada respuesta con la llamada.

**Qué necesitamos que valides:**

- [ ] ¿Te encaja que se presente como «asistente virtual de WhatsApp»?
- [ ] ¿La descripción de la escuela es la que quieres que lea un lead antiguo?
- [ ] ¿Prefieres otra fórmula de cierre en vez de «¿te paso con el equipo?»?

---

### 3.2. Pregunta de precio

**Cuándo ocurre:** es la pregunta más frecuente y la más delicada.

> **LEAD:** ¿cuánto cuesta?
> **AGENTE:** El precio prefiero que te lo explique una persona; sí hay opciones de
> financiación y dos años flexibles para completarla. ¿Te paso con el equipo?

**Qué hace el agente:** no da ninguna cifra. Reconoce que hay financiación y el
plazo flexible de dos años (lo único aprobado), y lleva a la llamada.

**Qué necesitamos que valides:**

- [ ] ¿La fórmula «el precio prefiero que te lo explique una persona» es la tuya?
- [ ] ¿Quieres que mencione la financiación en la misma frase del precio o en un
      segundo mensaje si el lead insiste?
- [ ] ¿Hay algo más que sí puedas decir del precio sin dar importes?

---

### 3.3. Financiación y falta de tiempo

**Cuándo ocurre:** el lead mezcla dinero con su situación real (trabajo, familia).

> **LEAD:** ¿se puede pagar a plazos? trabajo y no tengo mucho tiempo
> **AGENTE:** Sí, hay opciones de financiación y puedes pagar a plazos, con hasta dos
> años para completar la formación de forma flexible. Entiendo que trabajas y
> dispones de poco tiempo, por eso la metodología es online y sin horarios fijos.
> ¿Te paso con el equipo para que te expliquen todo en una llamada?

**Qué hace el agente:** confirma que existen opciones de financiación y el plazo de
dos años, **sin** importes, intereses ni condiciones de cuotas; después conecta con
su problema (tiempo) y ofrece la llamada.

**Qué necesitamos que valides:**

- [ ] ¿«puedes pagar a plazos» es correcto, o preferís que solo diga «hay opciones
      de financiación»?
- [ ] ¿«online y sin horarios fijos» describe bien la metodología?
- [ ] ¿Quién da las condiciones de pago: el comercial en la llamada?

---

### 3.4. Pregunta trivial fuera de tema (dirección, horario, redes)

**Cuándo ocurre:** el lead pregunta algo que no es del curso.

> **LEAD:** ¿en qué calle estáis?
> **AGENTE:** No tengo la dirección exacta a mano, pero puedo confirmártela por
> teléfono. Si te interesa conocer más sobre nuestros cursos y cómo encajan con tus
> objetivos, lo mejor es que hables directamente con el equipo. ¿te paso con ellos
> para que te llamen?

**Qué hace el agente:** contesta en una frase, **no inventa** la dirección y
reconduce al curso y a la llamada.

> **Aviso importante:** la dirección es contenido **no aprobado**. Si quieres que el
> agente dé la calle por WhatsApp, hay que aprobarla explícitamente; hasta entonces
> dirá que se confirma por teléfono. Lo mismo con horarios de oficina y redes.

**Qué necesitamos que valides:**

- [ ] ¿Damos la dirección por WhatsApp o se confirma siempre por teléfono?
- [ ] Si se da, ¿cuál es la dirección exacta y cómo debe escribirla?
- [ ] ¿Reconducir al curso en la misma frase, o responder y esperar al siguiente
      mensaje?

---

### 3.5. Objeción personal («no es para mí», «soy mayor»)

**Cuándo ocurre:** el lead duda de sí mismo, no del producto. Es el momento más
delicado para el tono.

> **LEAD:** no sé si esto es para mí, vengo de otro sector
> **AGENTE:** Sí, nuestras formaciones están diseñadas para personas sin experiencia
> previa y te acompañamos paso a paso con proyectos reales y tutorías. Si te
> interesa, el equipo puede orientarte sobre cuál programa encaja mejor con tu perfil
> y tus objetivos. ¿Te paso con alguien para que te cuente más en una llamada?
>
> **LEAD:** me da miedo ser demasiado mayor
> **AGENTE:** No te preocupes, nuestras formaciones están pensadas para cualquier
> edad y nivel; puedes avanzar a tu ritmo y contar con tutorías personalizadas
> durante todo el programa. Además, tienes dos años para completarla con total
> flexibilidad, así que puedes compaginarla con tus responsabilidades actuales. ¿Te
> paso con el equipo para que te expliquen con más detalle en una llamada?

**Qué hace el agente:** valida la objeción, responde con lo aprobado (sin
experiencia previa, acompañamiento, flexibilidad) y vuelve a la llamada. No
presiona ni promete resultados.

**Qué necesitamos que valides:**

- [ ] ¿«personas sin experiencia previa» es cierto para todas las formaciones?
- [ ] ¿«cualquier edad y nivel» se puede afirmar sin matices?
- [ ] ¿Qué frase usa tu comercial cuando alguien dice «soy mayor para esto»?

---

### 3.6. Salidas y empleo

**Cuándo ocurre:** el lead pregunta si esto le va a servir para trabajar. Es la
pregunta con más riesgo de promesa.

> **LEAD:** ¿esto me sirve para encontrar trabajo?
> **AGENTE:** Hay orientación laboral desde el primer día: el CV de la escuela, el
> LinkedIn preparado, masterclasses, pruebas técnicas y contacto con reclutadoras.
> El acompañamiento lo lleva una persona del equipo. ¿Quieres que te lo explique una
> persona en una llamada?

**Qué hace el agente:** describe el acompañamiento aprobado y **no promete empleo**
(ni porcentajes, ni «encontrarás trabajo»).

**Qué necesitamos que valides:**

- [ ] ¿La lista de acompañamiento (CV, LinkedIn, masterclasses, pruebas técnicas,
      reclutadoras) es exacta?
- [ ] ¿Se puede decir algo más sin prometer? Si hay un dato de empleabilidad, ¿cuál
      es el número aprobado y con qué denominador?

---

### 3.7. El lead pide hablar con una persona

**Cuándo ocurre:** petición explícita de humano. Es un disparador confirmado.

> **LEAD:** prefiero hablar con una persona
> **AGENTE:** Claro, prefieres hablar con una persona. Dejo anotado y te pongo con el
> equipo. ¿Me confirmas tu teléfono o el mejor momento para que te contacten?

**Aviso que se genera (simulado, destinataria Laura):**

> Formación tecnológica de Escuela Musk: el lead pidió hablar con una persona.
> Bolsa de origen: ilocalizables. Dudas registradas: ninguna. Último mensaje del
> lead: prefiero hablar con una persona

**Qué hace el agente:** deja de vender, confirma la derivación y pide el dato que
necesita el comercial.

**Qué necesitamos que valides:**

- [ ] ¿Pedimos teléfono y mejor momento, o solo el momento (el teléfono ya lo
      tenemos de la campaña)?
- [ ] ¿El texto del aviso tiene todo lo que necesita Laura para enrutar?
- [ ] ¿La derivación debe avisar también cuando el lead pide precio dos veces?

---

### 3.8. El lead acepta la llamada

**Cuándo ocurre:** el lead da un teléfono o un horario. Es el otro disparador
confirmado.

> **LEAD:** ¿qué ofrecéis exactamente?
> **AGENTE:** Ofrecemos programas de Python, Front End, Back End, Full Stack, el máster
> de videojuegos, Python con IA Engineering y los másteres de Inteligencia
> Artificial, Machine Learning y Deep Learning. Entiendo que quieras conocer bien
> todas las opciones. ¿Te paso con el equipo para que te cuenten más en detalle?
>
> **LEAD:** vale, llámame al 612 345 678
> **AGENTE:** Perfecto, dejo anotado que te va bien la llamada. El equipo se pone en
> contacto contigo para acordar el detalle.

**Aviso que se genera (simulado):**

> Formación tecnológica de Escuela Musk: el lead aceptó la llamada. Bolsa de origen:
> ilocalizables. Dudas registradas: ninguna. Último mensaje del lead: vale, llámame
> al 612 345 678

**Qué hace el agente:** nombra el catálogo cerrado (nunca inventa un programa),
confirma la aceptación y no promete una hora que no puede cumplir.

**Qué necesitamos que valides:**

- [ ] ¿El catálogo es el correcto y en ese orden?
- [ ] ¿«El equipo se pone en contacto contigo» es suficiente, o hay que dar un
      compromiso de plazo (p. ej. «en horario laboral»)?
- [ ] ¿La llamada la hace el comercial o hay que agendar antes?

---

### 3.9. El lead pide parar

**Cuándo ocurre:** el lead pide que no le escriban más. Se respeta siempre.

> **LEAD:** no me escribas más, por favor
> **AGENTE:** Entendido, respeto tu decisión: no vuelvo a escribirte. Queda
> registrado como "no continuar".

**Qué hace el agente:** se despide sin insistir, no vuelve a escribir en ese hilo y
registra la parada.

**Qué necesitamos que valides:**

- [ ] ¿La fórmula de despedida es la que quieres?
- [ ] ¿La parada se queda solo en el asistente o tiene que llegar al CRM/campaña
      para que nadie más le escriba?

---

### 3.10. Piden el temario completo

**Cuándo ocurre:** el lead pide el contenido detallado. No se puede enviar.

> **LEAD:** mándame el temario completo del curso
> **AGENTE:** Te lo cuento con gusto. ¿Prefieres que siga contándote por aquí o que
> te lo explique una persona en una llamada para que te quede todo claro?

**Qué hace el agente:** no envía módulos ni el dossier, y ofrece la llamada.

**Ajuste que proponemos (necesita tu aprobación):** decirlo de forma más clara, por
ejemplo «el temario detallado no te lo envío por aquí, pero te lo explican en la
llamada». Hoy la respuesta es segura pero algo evasiva.

**Qué necesitamos que valides:**

- [ ] ¿Se puede decir explícitamente que el temario detallado no se envía por
      WhatsApp?
- [ ] ¿Qué parte del contenido general sí se puede contar (habilidades, salidas)?

## 4. Lo que el agente nunca hace

Estas son las líneas rojas que ya están implementadas y probadas. Se respetan
aunque el lead insista:

1. No da precios, importes, porcentajes, cuotas, intereses ni condiciones de pago.
2. No envía el temario detallado ni el dossier.
3. No promete empleo, garantías, becas ni promociones no aprobadas.
4. No inventa datos (dirección, horarios, condiciones): si no está aprobado, dice
   que se confirma con el equipo.
5. No ofrece nada a los no compradores que no haya aprobado MUSK.
6. Si el lead pide parar, para y lo registra.
7. No encadena preguntas: cada mensaje termina con **una sola** pregunta, siempre
   orientada a la llamada.

## 5. Qué necesitamos de ti

1. **Validar los diez tipos.** Marca cada uno como *vale* o *así no*, y escribe al
   lado cómo lo diríais vosotros. Con eso ajustamos el tono y las respuestas.
2. **Enviarnos tres o cinco conversaciones reales de vuestro equipo** (capturas de
   WhatsApp, correos o llamadas transcritas). No para copiarlas, sino para ver cómo
   habláis de verdad: saludos, cierres, cómo llamáis a los cursos, qué preguntáis y
   qué evitáis. Como decía Miguel, quien define cómo se habla con los futuros
   clientes sois vosotros; nosotros podemos orientar, pero la voz es vuestra.
3. **Aprobar o corregir los textos concretos** que dependen de vosotros: dirección,
   condiciones de financiación, datos de salidas y plazo de contacto tras aceptar la
   llamada.

## 6. Cómo probarlo tú mismo

- URL del simulador: <https://musk-agent.vercel.app> (sin contraseña, sin datos
  reales; es una simulación).
- Puedes escribir como un lead y ver las respuestas, y descargar un informe PDF de la
  sesión o exportar el JSON.
- Si algo te suena raro, cópianos la frase exacta y la pregunta que la provocó: con
  eso lo ajustamos en el contenido aprobado, no en el código.

## 7. Anexo: qué pasa si el agente no sabe o falla

- Si la pregunta no tiene respuesta aprobada, **no improvisa**: registra la duda y
  ofrece contacto humano («Lo dejo anotado para que una persona del equipo te lo
  confirme. ¿Te viene bien que te contacten para aclararlo?»). Las dudas quedan en el
  informe de la sesión para revisarlas.
- Si el proveedor del modelo falla o la respuesta no pasa el filtro de seguridad,
  tampoco improvisa: si la pregunta pide el catálogo («¿qué ofrecéis?»), responde
  con la lista cerrada de programas; en cualquier otro caso registra la duda y
  ofrece contacto humano.
