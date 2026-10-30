# Guion Neuroventas (empático, sin presión)

## Marco

Todo el copy sigue pendiente de firma de MUSK. Solo se usan datos aprobados en
`src/content.ts` o `src/kb.ts`. No se añaden precios, importes, intereses, cuotas,
prueba gratuita, casos de éxito, plazos de resultado ni promesas de empleo.

Los textos de la tabla son los que el motor emite hoy, copiados de la fuente y no
reconstruidos a mano. Si el copy cambia, esta tabla se queda obsoleta: la prueba de
verdad son los tests y `npm run sim`.

## Tabla por momento

| Momento | Texto | Objetivo comercial | Mecanismo | Dato aprobado que usa |
|---|---|---|---|---|
| Apertura (lead ya contactado) | "Hola, soy el asistente de Escuela Musk. Retomo el contacto sobre la formación. ¿Te pillo en buen momento? Si no, dímelo y no insisto." | Reestablecer contacto sin presión | Permiso explícito para retirarse + reducción de fricción | `initialMessage` (`src/content.ts`) |
| Cualificación (objetivo) | "Antes de contarte nada, me gustaría entender qué buscas. Si no encaja, te lo digo yo. ¿Tienes algo en mente?" | Entender el objetivo sin examen | Marco consultivo + descualificación honesta | Pregunta `goal` (`src/content.ts`) |
| Miedo / inseguridad no cubierta por el KB | "Es de lo que más se escucha, y no significa que no sirvas. Todas las formaciones parten de cero y tienes un tutor personal detrás. ¿Qué es lo que más te preocupa?" | Tranquilizar y seguir conversación | Normalización + reducción de ansiedad | `REPLY_TEMPLATES.reassurance` (`src/rules.ts`), red de seguridad de las reglas 1-4 del KB |
| Sin experiencia / base técnica / edad | "No necesitas experiencia previa ni estudios anteriores: todas las formaciones parten de cero. Tampoco hace falta ser bueno en matemáticas, sino lógica y constancia, y tienes un tutor personal detrás." | Validar elegibilidad sin prometer | Reducción de barrera percibida | `kb-sin-experiencia` (`src/kb.ts:400`) |
| Sin tiempo ("trabajo todo el día", "tengo hijos") | "Tiene sentido. Si ahora no es el momento, no pasa nada: puedes completar la formación en dos años con flexibilidad. El equipo puede orientarte en una llamada." | Quitar la objeción real sin presionar | Aceptación + flexibilidad real, sin promesas de resultado | `kb-obj-no-tiempo` (`src/kb.ts`) |
| Precio | "El precio prefiero que te lo explique una persona. Sí hay opciones de financiación y dos años flexibles para completarla. Si quieres, te paso con el equipo y te lo cuenta en una llamada." | Derivar a humano respetando la regla 1 | Transparencia + derivación controlada | `priceReply` (`src/content.ts`), con `REPLY_TEMPLATES.price` como respaldo |
| Propuesta de llamada (lead dice "sí" o "me interesa") | "¿Te va mejor por la mañana o por la tarde?" | Proponer la llamada con dos opciones cerradas | Reducir la fricción de decisión | `REPLY_TEMPLATES.callProposal` (`src/rules.ts`) |
| Cierre para agendar | "¿Qué día y a qué hora te viene bien que el equipo te llame?" | Convertir en llamada con momento concreto | Pregunta abierta que captura el dato del handoff | `closingInvitation` (`src/content.ts`), con `REPLY_TEMPLATES.callProposal` («¿Te va mejor por la mañana o por la tarde?») como respaldo |
| Cierre conversacional | "Gracias a ti. Si te surge algo, me lo dices y lo movemos." | Cerrar con puerta abierta | Cortesía sin presión | `REPLY_TEMPLATES.closing` (`src/rules.ts`) |

## Técnicas descartadas y por qué

| Técnica | Motivo del descarte |
|---|---|
| Cierre sin opción al "no" (yes-set / cierre forzado) | Va contra «sin presión artificial» (regla 8). El cierre de venta es siempre humano. |
| Pie en la puerta (foot-in-the-door) | Genera presión indebida; se pregunta por disponibilidad con opciones respetuosas. |
| Urgencia artificial («quedan X plazas», «acaba hoy») | Prohibido inventar promociones o plazos (reglas 4 y 6): no hay datos aprobados. |
| Prueba gratuita o «pruébalo sin compromiso» con condiciones | No existe copy aprobado; sería una promesa no verificada. |
| Casos de éxito / cifras de inserción | No están en `src/content.ts` ni en `src/kb.ts` como datos aprobados. |
| Apelar al «cerebro reptiliano», miedos primarios o técnicas manipulativas | Sin base empírica aplicable y contrarias al tono buscado. Se usa validación, normalización y derivación a humano. |

## Nota de evidencia

- Cialdini (*Influence*) y Kahneman (*Thinking, Fast and Slow*) tienen respaldo
  sólido en psicología de la persuasión, pero sus principios se aplican aquí solo
  en su forma ética: permiso, transparencia, reducción de barrera.
- «Cerebro reptiliano» no tiene base neurocientífica precisa para guiar respuestas
  y no se usa.
- Lo aplicado es consultivo: escucha activa, validación, reducción de barreras y
  una sola pregunta por mensaje, siempre sobre copy ya existente.

## Nota importante

**Todo el copy sigue pendiente de firma de MUSK.** Las piezas nuevas o reescritas
(`reassurance`, `price`, `closing`, el `initialMessage` y el preámbulo de la
pregunta `goal`) son empáticas en la forma, pero no son contenido aprobado hasta su
firma. Las once reglas duras siguen vigentes en todo momento y `guardReply` las
verifica en cada salida.
