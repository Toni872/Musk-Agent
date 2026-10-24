# Gama de preguntas para probar el Agente MUSK (DEMO)

## 1) Apertura e interés general
| Frase | Intent esperado | Comportamiento |
| :-- | :-- | :-- |
| `Hola` | `general` | Saludo breve y vuelve a preguntar qué le interesa. |
| `Hola, me gustaría información sobre las formaciones` | `general` | Presentación general, habla de online/práctico, proyectos reales y pregunta para orientar. |
| `Quiero información` / `Dime qué ofrecéis` | `general` | Respuesta breve sin entrar en temario ni precios. |

## 2) Orientación / cambio profesional
| Frase | Intent esperado | Comportamiento |
| :-- | :-- | :-- |
| `Busco un cambio profesional, ¿qué formación me iría mejor?` | `general` | Entrada de orientación: qué te atrae (lógica y datos, parte visual, crear juegos) y propuesta de llamada. |
| `Quiero cambiar de carrera, ¿por dónde empiezo?` | `general` | Igual: orientación + objetivo preguntado en el mismo turno. |
| `Quiero un cambio de sector` | `general` | Igual. Si llega como respuesta a la pregunta de objetivo, se captura la respuesta (no la responde la FAQ). |
| `No sé por dónde empezar` | `general` | Igual: orientación, sin registrar duda. |
| `Estoy perdido, no sé qué formación elegir` | `general` | Igual. |
| `Me gustaría que me orientéis un poco` | `general` | Igual. |
| `Orientadme un poco, por favor` | `general` | Igual. |
| `¿Cuál me conviene más?` | `general` | Igual. |
| `No sé qué hacer con mi vida laboral` | `general` | Igual. |
| `¿Qué me recomendáis?` | `kb` | Base de conocimiento (`kb-guia-recomendacion`): qué programa encaja según lo que te atrae. |
| `¿Qué me recomendáis, Python o Full Stack?` | `kb` | Igual: comparación resuelta por la base de conocimiento. |

## 3) Info general válida (sí responde)
| Frase | Intent esperado | Comportamiento |
| :-- | :-- | :-- |
| `¿Qué salidas tiene?` / `¿De qué puedo trabajar?` | `general` | Habla de salidas/habilidades de forma general. |
| `¿Qué habilidades se aprenden?` | `general` | Contenido general aprobado, nunca lista módulos completos. |
| `¿Cómo se aprende?` / `¿Es online?` | `general` | Modalidad/metodología breve. |
| `¿Cuánto dura?` / `¿Cuántos años dura la formación?` | `general` | Habla de flexibilidad / dos años sin dar horas ni calendario detallado. |
| `¿Hay financiación?` | `financiacion` | Solo dice que hay opciones y que se puede completar en dos años con flexibilidad. Sin importes, intereses ni cuotas. |

## 4) Trampas duras (tienen que bloquearse/escalarse)
| Frase | Intent esperado | Comportamiento |
| :-- | :-- | :-- |
| `¿Cuánto cuesta?` / `¿Qué precio tiene?` | `price` | Regla 1. Niega el precio e invita a hablar con el equipo en llamada. |
| `¿Qué temario tiene el curso de Backend exactamente?` | `temario` | Regla 2. Niega temario detallado. Puede hablar de contenido general/salidas y derivar. |
| `¿Hay becas o descuentos?` | Protegido/`unknown` | Ruta protegida. No inventa nada, suele ir a duda/escalado. |
| `¿Cuándo empiezan las clases?` | Protegido/`unknown` | Fechas no aprobadas. Escalado. |
| `¿Dónde se imparten?` / `¿Es presencial u online?` | Protegido/`unknown` | Si no hay respuesta aprobada -> duda/escalado. |
| `¿Garantizáis prácticas o empleo?` | Protegido/`unknown` | Reglas 4/11. No acepta promesas. |

## 5) Handoff, parada y anáfora
| Frase | Intent esperado | Comportamiento |
| :-- | :-- | :-- |
| `Me gustaría hablar con alguien` / `Quiero hablar con una persona` | Dispara `handoff` | Deriva a Laura. Registra aviso. Tras handoff, el agente deja de seguir preguntando. |
| `Sí, prefiero que me contacten` (tras propuesta de llamada) | Aceptación -> `handoff` | Se considera acuerdo y deriva. |
| `No me interesa, gracias` | `decline` | Rechazo respetado. |
| `No me escribas más` / `Para ya` | `stop` | Se detiene, registra `stop`, marca `stopped`. No sigue la conversación. |
| `Busco información sobre las formaciones` -> `¿Y esa certificación?` | `unknown` | Ahora va a duda/escalado. No responde con el pasaje del KB. |
| `Busco información sobre las formaciones` -> `¿Y eso?` | `unknown` | Igual, sin antecedente -> duda/escalado. |
