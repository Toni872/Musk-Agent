# Decisiones operativas pendientes (Escuela Musk)

Anexo de `docs/pedido-nicolas.md`. El pedido original cierra **qué se dice** (mensaje
inicial, preguntas, presentación). Este documento cierra **cómo se comporta** la
conversación: seguimiento, llamada, aviso y datos del lote.

Estado: **propuesta, no enviada**. Nada de lo que hay aquí está acordado y nada
se aplica al contenido aprobado sin tu visto bueno.

Fecha: 19 de octubre de 2026.

Por qué importa: el flujo mínimo de la especificación (§4) exige "la regla de
seguimiento/parada definida para la prueba", pero esa regla está sin definir
(§3.2 y §7). Sin ella, el agente solo contesta cuando el lead escribe: reactivar
leads antiguos depende de esos mensajes de seguimiento.

---

## 1. Seguimiento y parada (la decisión más importante)

**Qué necesitamos:** cuántos mensajes de seguimiento se envían si el lead no
responde, cada cuánto, con qué texto y cuándo se da por perdido.

**Situación actual:** el agente no inicia seguimientos. Si el lead no responde,
la conversación queda quieta.

**Propuesta:**

| Intento | Cuándo | Contenido |
| --- | --- | --- |
| 1 | 48 h después del último mensaje | Recordatorio breve con la misma invitación a la llamada |
| 2 | 5 días después del primero | Último mensaje, sin presión, con opción de no continuar |
| Cierre | 7 días sin respuesta | Se da por perdido y se registra el motivo |

Cualquier "no" o petición de parada detiene los seguimientos en el acto (regla 7
de `AGENTS.md`).

**Qué desbloquea:** el objetivo del MVP (recuperar leads antiguos) y la métrica
de respuesta.

---

## 2. Cómo se ofrece la llamada

**Qué necesitamos:** elegir una de estas tres formas.

| Opción | Cómo suena | Ventaja | Coste |
| --- | --- | --- | --- |
| a) Pedir el contacto | "¿Me dejas tu teléfono?" | No exige agenda | El lead puede no contestar |
| b) Acordar día y hora | "¿Qué día y a qué hora te viene mejor?" | Llamada más probable | Necesita cobertura real en esa franja |
| c) Pedir una franja | "¿Te va mejor por la mañana o por la tarde?" | Equilibrio entre las dos | Algo menos concreto |

**Situación actual:** la muestra hace (b) y además acepta un teléfono si el lead
lo escribe. Es una decisión tomada por defecto: hay que confirmarla o cambiarla.

**Propuesta:** (c) para la primera prueba, y pasar a (b) cuando haya cobertura
confirmada en el apartado 4.

---

## 3. Cuándo se ofrece la llamada

**Qué necesitamos:** qué señales bastan para proponerla.

**Propuesta:** se ofrece cuando el lead ha respondido las dos preguntas de
cualificación y no ha dicho que no. No se excluye a nadie: las respuestas se
registran, no puntúan (la especificación lo prohíbe expresamente).

Nada impide que el lead pida la llamada antes: en ese caso se ofrece en el acto.

---

## 4. Quién recibe el aviso y con cuánta cobertura

**Qué necesitamos:** persona o grupo que recibe el aviso, horario en el que se
atiende, y qué compromiso podemos escribirle al lead.

**Propuesta:** un grupo de WhatsApp comercial con la persona responsable, de
lunes a viernes de 9:00 a 19:00. Al lead se le dice "el equipo se pone en
contacto contigo", sin prometer un plazo (regla 8). Si se quiere prometer algo,
tiene que ser un plazo que se cumpla siempre.

**Qué desbloquea:** el aviso con contacto ya está construido; falta el destino.

---

## 5. Qué datos lleva el lote

**Qué necesitamos:** confirmar que cada lead del lote trae, como mínimo:

- teléfono;
- bolsa de origen (ilocalizable / no comprador);
- formación de interés;
- motivo por el que se perdió en la campaña (ghosting, no atendió, precio,
  matrícula en otra escuela…).

**Situación actual:** el sistema ya guarda teléfono, bolsa y motivo de pérdida.
La formación es única en esta prueba. El resumen que recibe el comercial incluye
ahora la formación, el motivo de pérdida, las respuestas de cualificación, las
dudas registradas y el último mensaje del lead.

---

## 6. Resultado de la llamada

**Qué necesitamos:** quién anota el resultado y con qué campos.

**Propuesta mínima:** llamada realizada (sí/no), valoración del comercial
(útil / no útil) y motivo si no se pudo cerrar. Sin esto no se puede medir la
hipótesis del MVP, solo la actividad.

Hoy esto no está automatizado: el sistema no sabe qué pasó después de la
derivación.

---

## 7. Oferta a no compradores

**Qué necesitamos:** confirmar que **no** hay oferta en la primera prueba.

**Propuesta:** sin oferta ni importes (regla 6). Si más adelante se quiere
mencionar algo, hace falta un mensaje aprobado por escrito antes de enviarlo.

---

## 8. Frases que conviene validar tal cual

Estas ya están en el código y son las que el lead puede leer. Solo necesitan un
"vale" o una corrección:

- **Precio:** "No puedo compartir el precio ni los importes por aquí. Lo
  conversamos con detalle en una llamada con el equipo y te resolvemos todas las
  dudas. ¿Me dejas tu contacto o un momento en el que te venga bien que te
  llamen?"
- **Temario:** respuesta que remite a la llamada y explica que el detalle se ve
  con una persona, sin listar módulos.
- **Financiación:** se indica que existen opciones y se remite a la llamada, sin
  condiciones.

Los ajustes de redacción ya propuestos están en el apartado 5 y 7 del pedido
original; no se repiten aquí.

---

## Resumen para responder

Si prefieres ir rápido, con estas cinco respuestas se desbloquea casi todo:

1. Seguimiento: ¿vale la propuesta del apartado 1?
2. Llamada: ¿(a), (b) o (c)?
3. Aviso: ¿quién lo recibe y en qué horario?
4. Lote: ¿confirma que trae teléfono, bolsa, formación y motivo de pérdida?
5. Resultado de la llamada: ¿quién lo anota y con qué campos?

Lo demás (contenido, mensaje inicial, presentación de MUSK, preguntas y
correcciones de copy) sigue en `docs/pedido-nicolas.md`.
