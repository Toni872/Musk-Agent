# Canal real de WhatsApp: opciones, coste y esfuerzo de alta

Estado: **borrador técnico de Script9** (16 de noviembre de 2026). No es una
decisión acordada. Documento **interno**: no se envía al lead ni forma parte del
copy aprobado.

Sirve para que MUSK elija, con datos, **por dónde se conecta el agente a WhatsApp**.
Hoy no hay canal: el arnés es un simulador web (`checklist-canal-real.md`, línea 8).
Las cifras de Meta y de proveedores son públicas, pero cambian por trimestre; al
final se indica la fecha exacta en que se comprobó cada una.

## 1. Qué es "canal real"

No es la app de WhatsApp Business del móvil: esa no se puede automatizar ni conectar
a un motor propio. "Canal real" es la **API oficial de WhatsApp Business** con:

- una cuenta de WhatsApp Business (**WABA**) dentro de un Meta Business Manager;
- un **número dedicado** (que no esté ya activo en WhatsApp, o migrarlo);
- un **nombre visible** aprobado por Meta;
- **plantillas de mensaje** aprobadas;
- un **webhook** que recibe las respuestas del lead y los estados de entrega.

El flujo del MVP (reactivar leads antiguos) empieza con un mensaje **iniciado por el
negocio**, así que va como **plantilla de marketing**. Eso cambia coste y requisitos
frente a responder a alguien que escribió primero.

## 2. Lo que exige el canal (común a todas las opciones)

| Requisito | Qué implica | Quién lo hace |
|---|---|---|
| Meta Business Manager + WABA | Alta de la cuenta de negocio | MUSK (titular) |
| Verificación del negocio | Meta valida que la empresa existe | MUSK |
| Número dedicado | Comprar o migrar un número a la API | MUSK |
| Nombre visible | Meta lo aprueba (no puede ser genérico ni engañoso) | MUSK |
| Plantillas | Cada texto se revisa y se aprueba por categoría | MUSK + Script9 |
| Opt-in y baja | WhatsApp exige consentimiento para marketing y vía de baja | MUSK + legal |
| Webhook | Recibir mensajes y estados | Script9 |
| Límite de mensajería | Un número nuevo empieza en 250 usuarios únicos/día y escala | — |
| Ventana de servicio | 24 h tras un mensaje del lead para responder libremente | — |

**Lo que ya tiene MUSK (según lo indicado por el usuario el 16 de noviembre de 2026;
pendiente de confirmar en el alta).** Nicolás ya opera un **Meta Business Manager** y
campañas en Meta. Si es el mismo negocio, eso cubre la **verificación del negocio**,
que es el paso más lento. No cubre el resto: la **WABA**, el **número dedicado** (no
puede ser uno que ya esté activo en la app de WhatsApp Business), el **nombre visible**
ni las **plantillas**. Son un alta aparte dentro de Meta.

Dos cosas que conviene tener claras desde el principio:

- **1.000 mensajes de servicio gratis al mes por número** (desde el 1 de octubre de
  2026). Los mensajes que **envía el lead son gratis**; se paga el mensaje que
  **envía el negocio**.
- **Click-to-WhatsApp**: si el lead entra desde un anuncio de Meta, se abre una
  ventana de 72 h con todo gratis. Eso ayuda a **leads nuevos desde anuncio**, no a
  reactivar leads antiguos por iniciativa propia.

## 3. Las tres rutas

| Ruta | Qué es | Cuota fija | Coste por mensaje | Esfuerzo de alta | Control técnico |
|---|---|---|---|---|---|
| **A) Meta Cloud API directa** | La API oficial, sin intermediario | **0** | Solo la tarifa de Meta | Medio: hay que construir el webhook y el envío | Total |
| **B) Twilio** | Proveedor (BSP) con SDK y alta guiada | 0 | Tarifa de Meta **+ $0.005** por mensaje (entrante y saliente); $0.001 por fallido | Bajo | Alto, pero atado a Twilio |
| **C) 360dialog** | BSP API-only, coste por número | **€49 / número / mes** (Regular) | Tarifa de Meta sin recargo (salvo +7 % en marketing por endpoint estándar) | Bajo-medio | Alto |

Otras opciones existen (Bird, Vonage, Gupshup) con recargos por mensaje parecidos a
Twilio; no cambian la decisión de fondo.

## 4. Cuánto cuesta de verdad

Tarifa de Meta para **números de España (+34)**, efectiva el 1 de octubre de 2026:

| Categoría | Por mensaje entregado |
|---|---|
| Marketing (primer contacto y seguimientos) | ≈ **€0,0585** |
| Utility / autenticación / servicio | ≈ **€0,0166** |

**Ejemplo con un piloto de 200 leads antiguos**, con supuestos explícitos (no es un
presupuesto): 1 mensaje de marketing + hasta 2 seguimientos a quien no responde,
~30 % responde.

- Marketing enviados: ~200 + ~140 + ~100 ≈ **440 mensajes** → 440 × €0,0585 ≈ **€26**.
- Respuestas del lead: **gratis** (Meta no cobra lo que entra).
- Respuestas de servicio dentro de 24 h: dentro de las 1.000 gratis del mes.

| Ruta | Coste estimado del piloto (1 mes) |
|---|---|
| A) Meta directa | ≈ **€26** |
| B) Twilio | ≈ €26 + ($0,005 × ~740 mensajes in/out) ≈ **+ $3,7** |
| C) 360dialog | **€49** de cuota + ≈ €26 ≈ **€75** |

**Conclusión:** a escala de piloto, el coste **no es la restricción** (todo por debajo
de €100). Lo que decide son el **esfuerzo de alta**, el **control** y —sobre todo— el
**consentimiento** del apartado 5.

## 5. La restricción que manda: consentimiento (no es técnica)

Esto es lo que puede tumbar el piloto, no la factura:

- WhatsApp **prohíbe el marketing no solicitado**. Una plantilla de marketing exige
  que el destinatario haya dado su **opt-in** y que exista una **vía de baja**.
- Los leads antiguos son de campañas anteriores: hay que confirmar con MUSK **si
  dieron consentimiento** para recibir comunicaciones y con qué base legal
  (RGPD / LOPDGDD). Es la condición 4 del criterio de salida de
  `checklist-canal-real.md`.
- La regla 7 (respetar el rechazo) ya está en el agente; pero el **alta y la baja**
  del canal son de MUSK y su asesoría legal, no de Script9.

Sin esto cerrado, ninguna de las tres rutas es legalmente viable para leads fríos.

## 6. Recomendación para el caso MUSK

**Por defecto, y a validar por Nicolás: A) Meta Cloud API directa.**

- Es la opción más magra: **sin cuota fija** y el coste por mensaje más bajo.
- Mismo ecosistema Meta del que ya vienen los leads de MUSK.
- Ya tenemos un motor FastAPI; construir el webhook y el envío son pocos endpoints
  (apartado 7).
- Contra: el alta y el soporte corren de nuestra cuenta; no hay SDK de terceros que
  lo simplifique.
- Con Meta ya presente en MUSK, la ruta directa gana: si la verificación del negocio
  ya está hecha, el alta se reduce a crear la WABA y el número.

Cuándo elegir las otras:

- **Twilio** si MUSK prioriza el alta más rápida y un único proveedor para WhatsApp,
  SMS y voz, y no le importa pagar $0,005 por mensaje (incluido el entrante).
- **360dialog** si MUSK quiere un proveedor con soporte y coste predecible por
  número; la cuota de €49/mes pesa poco en un piloto largo, pero es un suelo fijo.

## 7. Qué habría que construir en el repo (plan, no implementado)

**Decisión (16 de noviembre de 2026): se deja planificado.** No se escribe código
hasta cerrar el alta (WABA + número) y el consentimiento. Nada de esto está hecho;
depende de la ruta que se elija (hoy, Meta directa).

Orden propuesto, de menor a mayor riesgo:

1. **Puertos (seam)**: `ChannelPort` y `CrmPort` en `app/channel/` y `app/crm/`. El
   motor (`MuskAgent`) depende de los puertos, nunca del proveedor. `CrmPort` arranca
   como **no-op** (aviso simulado).
2. **Adaptador Meta directa**: `send_text(to, text)` vía Graph API y `parse_webhook`
   con verificación de la firma `X-Hub-Signature-256` (HMAC-SHA256).
3. **Webhook fail-closed**: `GET`/`POST /webhook/whatsapp` solo se registran si hay
   `MUSK_WHATSAPP_VERIFY_TOKEN`; sin configurar, 404. La ruta queda fuera del Basic
   Auth **solo** si la firma HMAC es válida.
4. **Mapeo** número/WA ID ↔ sesión del agente; el motor (`MuskAgent`) ya existe.
5. **Plantillas**: se dan de alta en Meta; el código solo referencia nombre e idioma.
6. **Estados** sent/delivered/read/failed → métricas del piloto.
7. **Idempotencia**: los webhooks se reintentan; deduplicar por `message.id`.
8. **Configuración por entorno** (propuesta, aún no en `.env.example`):
   `MUSK_WHATSAPP_PROVIDER`, `MUSK_WHATSAPP_PHONE_ID`, `MUSK_WHATSAPP_TOKEN`,
   `MUSK_WHATSAPP_VERIFY_TOKEN`, `MUSK_WHATSAPP_APP_SECRET`.
9. **Aislamiento del lote** (ya pendiente en `checklist-canal-real.md`, §6).

## 8. Decisiones abiertas para MUSK (`TODO(decisión)`)

1. Proveedor: **Meta directa** (recomendado), Twilio o 360dialog.
2. Titularidad de la WABA y del Meta Business Manager: MUSK ya tiene Business Manager
   (según el usuario); confirmar que la WABA se crea bajo ese mismo negocio y quién la
   gestiona.
3. ¿Los leads antiguos tienen **consentimiento** vigente? Base legal.
4. Número dedicado: nuevo o migrado.
5. Texto del mensaje inicial como **plantilla de marketing** (depende de la firma de
   copy, reglas 4 y 11).
6. Cadencia y parada del seguimiento (ya en `decisiones-operativas-nicolas.md` §1).
7. Cómo se registra la **baja** del lead y durante cuánto tiempo se conserva.

## 9. Fuentes y fecha de comprobación

- Meta, WhatsApp Business Platform Pricing — consultado el 16 de noviembre de 2026;
  tarifas efectivas el 1 de octubre de 2026. Meta cambia tarifas el 1 de enero,
  abril, julio y octubre: **revalidar antes de presupuestar**.
- Tarifa EUR de España (marketing €0,0585; utility/autenticación/servicio €0,0166):
  contentoren.com (6 nov 2026) y feedback-studios.com (2 nov 2026).
- Twilio: $0,005 por mensaje entrante o saliente; $0,001 por fallido —
  twilio.com/en-us/whatsapp/pricing (septiembre de 2026).
- 360dialog: Regular €49 / $59 por número y mes; Premium €99 / $119; Scale €500 —
  360dialog.com/pricing (octubre de 2026); +7 % en marketing por endpoint estándar.
- Límite inicial de 250 usuarios únicos/día y verificación de negocio: páginas de
  Meta sobre límites de mensajería.

## 10. Encaje con el CRM (decisión abierta)

Conectar al CRM está **fuera del alcance documentado** del MVP (`AGENTS.md`;
`musk-mvp-spec.md`: Clientify y el CRM propio de MUSK en desarrollo quedan fuera, y
"no diseñar alrededor del CRM propio"). Si se incorpora, es una **decisión de alcance**
de MUSK, no un detalle de implementación.

Lo que está claro aunque todavía no se sepa cuál es:

- WhatsApp y el CRM son **dos adaptadores distintos**; el motor no debe depender de
  ninguno de los dos.
- Propuesta magra: dos puertos, `ChannelPort` y `CrmPort`. Hoy `CrmPort` queda como
  **no-op** (el aviso simulado actual). Cuando se elija CRM, se añade un adaptador real
  sin tocar el motor.
- El registro mínimo del MVP (aviso con contacto y bolsa de origen) ya existe simulado;
  el CRM real solo cambiaría el destino de ese aviso.

`TODO(decisión)`: cuál CRM (Clientify o el propio en desarrollo), quién autoriza la
integración y qué campos se escriben.

## Criterio de aceptación

- Este documento existe y está enlazado desde `docs/README.md`.
- Cada cifra lleva **moneda, mercado y fecha** de comprobación.
- Nicolás puede elegir una de las tres rutas **sin leer código**.
