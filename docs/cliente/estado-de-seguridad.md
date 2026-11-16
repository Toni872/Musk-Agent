# Estado de la seguridad — en lenguaje llano

Este documento es para que **Nicolás** pueda releerlo cuando se pierda. No hace
falta saber de ciberseguridad: está escrito para saber *qué está cerrado, qué
falta y qué decisión es tuya*. El detalle técnico vive en
`docs/operacion/endurecimiento-pii.md`.

## La idea en una frase

La agente **ya funciona y está probada**. La seguridad es una capa aparte que
protege los **datos** de los leads; **no cambia lo que la agente dice**.

## Qué está hecho y qué protege

| Candado | Qué protege | En una frase |
|---|---|---|
| Puerta con llave (auth) | Que nadie de fuera entre a ver los datos | Sin contraseña, la app se queda cerrada |
| La llave no viaja por fuera (sesión) | Que el id de una conversación no se pueda robar de la URL | El identificador va por dentro, no por el enlace |
| Tope de visitas (límite de peticiones) | Que nadie inunde el sistema | 30 peticiones por minuto por visitante |
| Tope de tamaño | Que no se pueda colar un archivo gigante | El mensaje tiene un máximo |
| Papeles con fecha de caducidad (retención) | Que los datos no vivan para siempre | A los 90 días sin actividad, se borran |
| No gritar datos por la ventana (redacción) | Que el teléfono/email del lead no salga hacia el proveedor de IA | Antes de mandar el texto, se tapan los datos |
| Cada empleado con su llave (cuentas por operador) | Saber **quién** miró o hizo qué, en vez de una sola clave compartida | Cada persona con su usuario y contraseña + registro de accesos |
| Seguro probado (copias de seguridad + restauración) | Poder recuperar la base si se rompe o se borra por error | Una copia consistente y su restauración, comprobadas |
| Cifrado en reposo | Que si roban el disco o se filtra una copia, no se pueda leer | Las copias van cifradas con una clave; el disco del servidor se cifra al desplegar |

## Qué falta (y qué protegerá)

| Pendiente | Qué protegerá | Quién lo decide |
|---|---|---|
| Contrato con el proveedor de IA (DPA) | Que el tercero que recibe el texto no entrene con tus datos | Tú + MUSK |
| Base legal y texto de transparencia | Que el lead sepa qué se hace con sus datos | Tú + MUSK |

## Tus decisiones (son solo estas)

1. **Plazo de retención** — propuesto: 90 días.
2. **Proveedor de IA y su contrato (DPA)** — hoy es Groq, falta firmarlo.
3. **Base legal y texto de transparencia** — qué aviso recibe el lead.
4. **Quién tiene cuenta de acceso** — los nombres de las personas que mirarán.
5. **Cadencia y destino de las copias** — cada cuánto se hacen y dónde se guardan.

Todo lo demás lo ejecuto yo y te muestro el recibo.

El detalle técnico y de comandos está consolidado en el PDF
`docs/operacion/control-accesos-musk.pdf` (regenerable con
`python -m app.control_pdf`).

## Cómo sé que está bien

Cada cambio termina con la suite completa en verde (hoy **272 pruebas**), el
análisis de tipos y el linter limpios, y una comprobación de que el texto que
sale respeta las 11 reglas duras. Si algo se rompiera, una prueba lo pilla antes
de que llegue a un lead real.
