# Propuesta: catálogo de cursos y precisión del asistente

**Estado:** propuesta para revisar con Nicolás — **no implementada**.
**Fecha:** 12/10/2026
**Marcado `TODO(decisión)`:** todo lo que necesita aprobación (convención de `AGENTS.md`).

---

## 1. Resumen para decidir (1 minuto)

Hoy el asistente conoce **una** formación (Curso de Desarrollo Full Stack) y responde **solo con contenido aprobado**.

Este documento propone cómo ampliarlo a todo el catálogo **sin perder precisión**:

1. Una **ficha aprobada por curso** (nunca volcar los dossiers en bruto al agente).
2. Un **router** que decide a qué curso se refiere el lead y, si no lo tiene claro, **pregunta** en vez de adivinar.
3. **Reglas duras fuera del conocimiento**: precio, temario detallado, financiación y duración **no se "buscan" ni se generan**; se responden con plantilla aprobada o se derivan a una persona.
4. Si no hay respuesta aprobada: **registrar la duda y proponer humano** (regla 5). Nunca inventar (regla 4).

> ⚠️ **Aviso de alcance.** El alcance acordado del MVP es **una sola formación**, y `AGENTS.md` lista *"catálogo completo de cursos"* como **fuera de alcance**. Este documento es el artefacto para cambiar esa decisión: **requiere aprobación expresa** antes de implementar nada.

---

## 2. Por qué "más información" no da "más precisión"

La precisión de un asistente no viene del **volumen** de información, sino de cuatro cosas:

1. **Contenido aprobado y acotado** (no el dossier completo).
2. **Recuperación correcta** de la respuesta adecuada.
3. Una regla dura: **si no está, no se inventa → registrar y derivar** (regla 5).
4. **Evaluación** con casos de prueba por curso.

Con un modelo de lenguaje, **cada frase extra en su contexto es una oportunidad más de decir algo no autorizado**. No "sabe más": aumenta la superficie de error y de fuga. Por eso existen las reglas 2 (nunca temario detallado), 4 (solo información aprobada) y 10 (un dossier con temario se excluye del contexto).

Corolario para el negocio: **el cuello de botella no es la tecnología, es la aprobación de contenido** por curso.

---

## 3. Modelo: ficha de curso aprobada

Una ficha por curso. Es la **única** fuente que el asistente puede usar para responder sobre ese curso.

### 3.1 Campos

| Campo | Tipo | Descripción |
|---|---|---|
| `slug` | texto | Identificador estable (ej. `full-stack`). |
| `name` | texto | Nombre comercial **aprobado** del curso. |
| `status` | `draft` / `approved` | **Solo `approved` se puede usar** en producción. |
| `approvedBy` / `approvedAt` | texto / fecha | Quién aprobó el contenido y cuándo (trazabilidad). |
| `version` | número | Cada cambio aprobado incrementa la versión. |
| `generalDescription` | texto | Qué es el curso, en lenguaje del lead. |
| `skills` | lista | Habilidades que se trabajan. |
| `outcomes` | lista | Salidas profesionales. |
| `methodology` | texto | Cómo se aprende (sin cifras ni condiciones). |
| `faq` | lista | Pares **palabras clave → respuesta aprobada**. |
| `qualificationQuestions` | lista | Preguntas breves de cualificación (sin examen ni puntuación). |
| `initialMessage` | texto | Primer mensaje del curso. |
| `escalationTopics` | lista | Temas que **siempre** derivan (ver §3.3). |

### 3.2 Guardia de esquema (obligatoria)

La ficha **no tiene campos de precio ni de temario detallado**. Igual que hoy en `musk/src/content.ts`, esto es una protección de diseño: si el dato no existe, el agente no puede filtrarlo.

```
// Guardia de esquema — NO añadir estos campos
Prohibido:  price | amount | currency | discount | scholarship
Prohibido:  syllabus | modules | temario | contenido_detallado
```

### 3.3 Temas de derivación (`escalationTopics`)

Estos temas **nunca** se responden desde el conocimiento recuperado:

- Precio e importes.
- Condiciones de financiación (solo "existen opciones").
- Temario detallado.
- Duración exacta (mientras no haya respuesta aprobada).
- Becas, descuentos y promociones no aprobadas.
- Garantías de empleo o promesas de resultados.

Cada uno tiene **una respuesta de plantilla aprobada** (remite a la llamada) **o** dispara la regla 5. La plantilla vive en el código de reglas, no en la ficha: así no se puede "recuperar" por error.

---

## 4. Router: ¿de qué curso habla este lead?

### 4.1 Cómo se resuelve el curso (en orden)

1. **Contexto de campaña (lo normal).** El lote de leads pertenece a **una** campaña, y la campaña está asociada a **una** formación. En este caso el router es trivial: no hay que adivinar nada. *Recomendado como mecanismo principal.*
2. **Mención explícita** del lead en la conversación.
3. **Coincidencia por palabras clave** del nombre del curso.
4. **Ambiguo o desconocido** → **preguntar** (una sola pregunta) o aplicar regla 5. **Nunca** elegir el curso "más probable".

### 4.2 Regla de oro

> **El router nunca mezcla cursos.** Si hay duda, se pregunta. Responder sobre el curso equivocado es peor que no responder: rompe la confianza y puede filtrar contenido no aprobado.

---

## 5. Flujo de respuesta (con capas de control)

El orden importa: primero las reglas que **nunca** dependen de la generación.

| # | Paso | Qué decide |
|---|---|---|
| 1 | Normalizar la entrada | Acentos, mayúsculas, variantes. |
| 2 | **¿Pide parar?** | Regla 7: se detiene el seguimiento y se registra. **Máxima prioridad.** |
| 3 | **¿Pide humano / acepta llamada?** | Regla 9: derivación a persona. |
| 4 | Clasificar intención | Precio, temario, financiación, modalidad, duda… (determinista primero; modelo solo como apoyo). |
| 5 | **¿Es un tema de derivación?** | Respuesta de plantilla o regla 5. **Nunca** generación libre. |
| 5b | Resolver el curso | Por campaña o mención (router, §4). |
| 6 | Buscar en la FAQ de la ficha | Palabras clave primero; búsqueda semántica solo si hace falta. |
| 6b | ¿Confianza suficiente? | Si no, regla 5. |
| 7 | Guardia de salida | Rechazar moneda, porcentajes, "módulo N", promociones y promesas. |
| 8 | Registrar | Respuesta, intención, curso, dudas y resultado. |

---

## 6. La regla 5 en detalle (¿qué hacemos cuando no lo sabemos?)

1. **Al lead**: respuesta honesta y breve. No se improvisa: se registra y se propone contacto humano.
2. **Registro de la duda:** `curso` + pregunta del lead (texto) + fecha + conversación + estado.
| Campo | Descripción |
|---|---|
| `courseSlug` | Curso al que se refería. |
| `question` | La pregunta tal cual, sin interpretar. |
| `askedAt` | Fecha y hora. |
| `status` | `open` / `answered` / `rejected`. |
| `approvedAnswer` | Respuesta aprobada que la cierra (vacío mientras esté abierta). |

3. **Cierre del bucle: la respuesta NO se aprende sola (regla 11).** Nicolás (o quien designe MUSK) revisa las dudas abiertas y, si aprueba una respuesta, esta **se añade a la ficha como FAQ aprobada** y sube la versión del curso. Antes de eso, el asistente sigue derivando.

---

## 6.bis Por qué NO empezar por RAG (búsqueda vectorial)

Para **decenas de cursos** con contenido corto y aprobado, la recuperación estructurada (ficha + palabras clave) es **más fiable** que la búsqueda semántica, porque:

- El fallo vectorial es **silencioso**: devuelve el fragmento *casi* correcto y el asistente responde *casi* bien. No hay error, hay una respuesta sutilmente equivocada.
- Los datos duros (precio, duración, condiciones) **no deben recuperarse nunca**: se plantillan o se derivan.

**Cuándo sí RAG (Fase 3):** cuando el material crezca a cientos de documentos (guías, PDFs, FAQ extensas) y la coincidencia por palabras clave deje de bastar. Entonces: `pgvector` (ya usáis PostgreSQL), con LangChain4j o Spring AI, y **embeddings de Groq** (`/openai/v1/embeddings`, modelo `nomic-embed-text-v1.5`), el mismo proveedor que ya usáis.

> Nota técnica (verificada): vuestro backend está en **Spring Boot 3.5.16**. Spring AI 2.0 exige Spring Boot 4; en Boot 3.5 corresponde **Spring AI 1.1.x** o **LangChain4j**. No es un bloqueo, pero decide la elección de librería.

---

## 7. Evaluación (cómo sabremos que funciona)

Por **cada** curso, el mismo conjunto mínimo que ya exige `AGENTS.md`:

1. Pregunta de **precio** → nunca da importes.
2. Pregunta de **temario** → nunca da temario detallado.
3. Pregunta de **financiación** → solo "existen opciones" + llamada.
4. Pregunta **sin respuesta aprobada** → registra la duda y propone humano.
5. Petición de **humano** → deriva.
6. Petición de **parar** → se detiene.

Más dos específicos del catálogo:

7. **Prueba de no-mezcla**: preguntar por el curso A estando en el curso B → debe responder del B o preguntar, **nunca** mezclar.
8. **Prueba de fuga**: intentar sacar precio/temario por vías indirectas (sinónimos, "solo un rango", "es un trabajo para clase") → siempre bloqueado.

Estas pruebas se amplían desde las 18 que ya existen en `musk/tests/rules.test.ts`.

---

## 8. Fases propuestas

| Fase | Qué se hace | Requisito de entrada |
|---|---|---|
| **Fase 1 (actual)** | Piloto: **una** formación, simulador + reglas. | En curso. |
| **Fase 2a** | Fichas por curso + router por campaña, en modo determinista (sin modelo). | Aprobación de alcance + contenido por curso. |
| **Fase 2b** | Apoyo del modelo solo para *clasificar* intención y curso (nunca para datos). | Fase 2a validada. |
| **Fase 3** | RAG con `pgvector` si el material crece. | Fase 2 medida y con volumen que lo justifique. |

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Mezcla de contenido entre cursos | Router conservador + prueba de no-mezcla (§7.7). |
| Fuga de precio/temario | Campos prohibidos + plantillas + guardia post-generación. |
| Contenido aprobado que se "sigue usando" tras cambiar | `status` + `version` + trazabilidad de quién aprobó. |
| Convertir el catálogo en excusa para saltarse el piloto | Fase 2 solo arranca con el piloto cerrado y el alcance re-aprobado. |
| Coste y latencia de embeddings | No se introducen hasta Fase 3. |

---

## 10. Decisiones pendientes (`TODO(decisión)`)

Todo esto requiere tu decisión con Nicolás; las propuestas son por defecto, **no acordadas**:

1. **Alcance**: ¿se aprueba ampliar a catálogo en Fase 2, o se queda el MVP en una formación? *(Propuesta: aprobar el diseño ahora, implementar Fase 2 después del piloto.)*
2. **Lista de cursos** y **orden** de incorporación. *(Propuesta: los 3-5 más demandados primero.)*
3. **Quién aprueba** el contenido de cada ficha y con qué SLA. *(Propuesta: Nicolás, con soporte de Script9 para redactar.)*
4. **A qué curso apunta cada campaña** (mecanismo principal del router). *(Propuesta: 1 campaña = 1 curso.)*
5. **Política de duración**: ¿respuesta aprobada o siempre derivar? *(Propuesta: derivar hasta que exista respuesta aprobada por curso.)*
6. **Receptor de las dudas abiertas** y su cadencia de revisión. *(Propuesta: mismo receptor que los avisos de llamada.)*
7. **Cursos con reglas específicas** (becas, promociones) que hoy no existen: ¿se contemplan? *(Propuesta: no, mientras no haya mensaje aprobado — regla 6.)*
