# MUSK — Simulador del asistente (PROBARLO EN VUESTRO EQUIPO)

Esto es el **motor conversacional del MVP**: todavía no está conectado a WhatsApp. Es una ventana de terminal en la que escribes frases como las escribiría un alumno y ves responder al asistente de MUSK.

Funciona **100 % local y offline**: no envía ni recibe datos de ningún sitio, no usa vuestros leads reales, todo es simulado.

---

## 1. Qué necesitas (solo la primera vez)

- Un ordenador con **Windows o Mac**.
- **Node.js 20 o superior**: descárgalo de https://nodejs.org (botón con la versión LTS) e instálalo con las opciones por defecto.
- Internet **solo** para la instalación inicial. Después, todo funciona sin conexión.

## 2. Descomprime e instala

1. Descomprime el zip donde quieras (por ejemplo, en el Escritorio). Dentro te quedará una carpeta (por ejemplo, `Musk-Agent`).
2. Abre una terminal **ya dentro de esa carpeta**. No hace falta ejecutar nada como administrador (y no lo hagas: si el título de la ventana dice "Administrador", ábrela normal).
   - **Windows**: abre esa carpeta en el Explorador → haz clic en la barra de direcciones de arriba → escribe `powershell` → Enter.
   - **Mac**: abre la Terminal, escribe `cd ` (con un espacio al final), arrastra la carpeta a la ventana y pulsa Enter.
3. Comprueba que estás en el sitio correcto: escribe `dir` (Windows) o `ls` (Mac). Debes ver `package.json` entre los archivos. Si no lo ves, no estás dentro de la carpeta.
4. Instala y comprueba que todo está bien:

   ```
   npm install
   npm test
   ```

    La primera vez puede tardar un par de minutos. Si al final del `npm test` pone **209 passed**, todo está correcto y ya puedes arrancar el simulador.

## 3. Arranca el simulador

```
npm run sim
```

Al arrancar verás primero una nota técnica: el bloque `--- opening ---` con el mensaje de apertura (o el aviso de que ese texto sigue pendiente de que lo cerréis con nosotros) y la lista `pending` de lo que todavía falta por aprobar. Debajo aparece `you (lead) >`: desde ahí escribes lo que diría un alumno, igual que siempre.

Si además quieres ver el flujo **completo** (mensaje de apertura + pregunta breve sobre el objetivo + propuesta de llamada), ejecuta `npm run sim:demo`. Ese modo usa contenido de **ejemplo**: la orientación directa a la llamada y las respuestas de financiación están confirmadas; los demás textos de muestra siguen pendientes de validación.

Si prefieres no usar la terminal, tienes la misma prueba en el **navegador**: ejecuta `npm run ui` y abre `http://localhost:4173`. Es exactamente el mismo motor con una interfaz de chat (y un desplegable para alternar entre el contenido real y el de ejemplo). Para cerrarlo, pulsa `Ctrl+C` en la terminal.

## 4. Prueba estas frases, en este orden

| # | Escribe | Qué debes ver |
|---|---|---|
| 1 | `Hola` | El asistente saluda |
| 2 | `¿es online o presencial?` | Explica que es online, con clases en directo |
| 3 | `¿cuánto cuesta?` | **NO da precios**; dice que se habla en una llamada |
| 4 | `¿hay financiación?` | Indica que hay opciones y que puedes completar la formación en dos años con flexibilidad; no da precios ni condiciones de pago |
| 5 | `¿me pasáis el temario?` | **NO da el temario detallado**; ofrece el contenido general |
| 6 | `¿cuánto dura el curso?` | No hay respuesta aprobada: lo registra como duda y propone que os contacten |
| 7 | `me parece muy caro` | Sin importes, invita a la llamada |
| 8 | `bueno, me va bien una llamada` | Acepta la llamada y avisa al equipo — **ese es el objetivo del flujo** |
| 9 | `no me interesa` | Lo respeta con tono amable y deja la puerta abierta (no es una parada) |
| 10 | `no me escribáis más` | Para el seguimiento; cualquier mensaje posterior ya no recibe respuesta |

## 5. Qué debéis comprobar (los criterios de validación)

1. **Nunca** comunica precios ni importes (ni €, ni "euros", ni cifras).
2. **Nunca** comunica el temario detallado.
3. Financiación: indica las opciones y el plazo flexible de dos años; nunca da precios, importes, intereses, cuotas ni otras condiciones de pago.
4. Ante algo sin respuesta aprobada: registra la duda y propone contacto humano, sin inventar.
5. "no me interesa" → trato amable y sin presión; no se confunde con una parada.
6. "no me escribáis más" → respeta el rechazo y detiene el seguimiento.
7. El flujo completo termina en una llamada humana (nunca vende por WhatsApp).
8. La DEMO pregunta una vez qué quiere conseguir el lead, guarda su respuesta y propone directamente la llamada. Es una pregunta de conversación, no un examen ni un filtro. El cierre pide un día y una hora convenientes; el texto se puede cambiar en el perfil.

Probad también frases "fuera de guion" (lo que se os ocurra que diría un alumno real); todas deben caer en alguno de los comportamientos anteriores.

## 6. Mandos del simulador

- `/reset` → empezar una conversación nueva
- `/state` → ver el registro de la conversación
- `/exit` o `Ctrl+C` → salir

## 7. Notas

- Todo es **local y simulado**: no hay canal real, no hay leads reales, no se sube nada a internet.
- La presentación general puede incluir las cinco formaciones; no hace falta ahora un catálogo detallado. La DEMO conserva otros textos de muestra, que siguen pendientes de validación.
- Si algo falla o aparece un error, **copiad el mensaje de error** y enviádselo a Script9 tal cual.
- Si ves un error `EPERM` o una ruta que empieza por `C:\WINDOWS\system32`, es que la terminal se abrió fuera de la carpeta del proyecto (habitualmente porque se abrió como administrador). Cierra esa ventana y repite el paso 2.
