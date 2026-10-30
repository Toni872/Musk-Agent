# Decisiones operativas pendientes (Escuela Musk)

Actualización (27 de octubre de 2026): perfil único en `src/content.ts`; las
referencias al perfil DEMO de más abajo describen el copy que ahora vive ahí,
pendiente de firma.

Anexo de `docs/cliente/pedido-nicolas.md`. El pedido original cierra **qué se dice** (mensaje
inicial, preguntas, presentación). Este documento cierra **cómo se comporta** la
conversación: seguimiento, llamada, aviso y datos del lote.

Estado: propuesta operativa con decisiones parciales confirmadas en las respuestas
inline de Nicolás al correo de Miguel (fecha no indicada en el material compartido).
El resto sigue pendiente; la confirmación no autoriza envíos reales ni integración.

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

En la propuesta inicial se compararon estas tres formas; la respuesta posterior
de Nicolás confirmó que el objetivo es conducir directamente a la entrevista o
llamada:

| Opción | Cómo suena | Ventaja | Coste |
| --- | --- | --- | --- |
| a) Pedir el contacto | "¿Me dejas tu teléfono?" | No exige agenda | El lead puede no contestar |
| b) Acordar día y hora | "¿Qué día y a qué hora te viene mejor?" | Llamada más probable | Necesita cobertura real en esa franja |
| c) Pedir una franja | "¿Te va mejor por la mañana o por la tarde?" | Equilibrio entre las dos | Algo menos concreto |

**Decisión confirmada:** el flujo debe ir directamente a la entrevista o llamada,
con preguntas breves que conduzcan a esa conversación humana. La muestra pide un
día y una hora convenientes, en una llamada sin presión. La disponibilidad real del
equipo antes de prometer cualquier plazo sigue pendiente.

**Estado:** el texto del perfil único pregunta qué día y a qué hora viene bien. Es
copy configurable pendiente de firma de MUSK; no supone una agenda automática ni
confirma cobertura.

---

## 3. Cuándo se ofrece la llamada

**Qué necesitamos:** qué señales bastan para proponerla.

**Decisión confirmada:** objetivo de llamada directa, sin cuestionario extenso. El
perfil único usa una única pregunta configurable `goal` que acepta tanto la
formación que interesa al lead como lo que quiere conseguir, y después propone
acordar la llamada. Es una conversación, no un examen ni un filtro; no se puntúa ni
se excluye a nadie. La pregunta ya está redactada y no quedan marcadores
`TODO(decisión)`, pero su copy sigue pendiente de firma de MUSK.

Nada impide que el lead pida la llamada antes: en ese caso se ofrece en el acto.

---

## 4. Quién recibe el aviso y con cuánta cobertura

**Decisión confirmada:** Laura recibe el aviso y decide a quién asignarlo. En este
repositorio, Laura es solo el destino configurado de una notificación simulada: no
se envía un WhatsApp real ni se integra el CRM.

**Pendiente:** confirmar la cobertura de Laura y el compromiso que puede asumir el
equipo. Al lead no se le promete atención inmediata ni un plazo sin validar (regla
8).

El aviso simulado incluye contacto y bolsa de origen para facilitar el enrutado
manual.

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

Las respuestas de precio y financiación están confirmadas por Nicolás en su
respuesta inline y el texto se conserva configurable en los perfiles. El resto de
la redacción que sigue pendiente no se considera firmada:

- **Precio:** "El precio prefiero que te lo explique una persona. Sí hay opciones de
  financiación y dos años flexibles para completarla. Si quieres, te paso con el
  equipo y te lo cuenta en una llamada."
- **Temario:** respuesta que remite a la llamada y explica que el detalle se ve
  con una persona, sin listar módulos.
- **Financiación y tiempo:** "Sí, hay opciones de
  financiación. Tienes dos años para completar la formación con flexibilidad. El
  equipo puede explicarte las opciones en una llamada." No incluye precio, importe,
  intereses, condiciones de cuotas ni otras condiciones de pago.

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
correcciones de copy) sigue en `docs/cliente/pedido-nicolas.md`.
