# MUSK — Simulador del asistente (PROBARLO EN VUESTRO EQUIPO)

Esto es el **motor conversacional del MVP**: todavía no está conectado a WhatsApp. Es una ventana de terminal en la que escribes frases como las escribiría un alumno y ves responder al asistente de MUSK.

Funciona **100 % local y offline**: no envía ni recibe datos de ningún sitio, no usa vuestros leads reales, todo es simulado.

---

## 1. Qué necesitas (solo la primera vez)

- Un ordenador con **Windows o Mac**.
- **Node.js 20 o superior**: descárgalo de https://nodejs.org (botón con la versión LTS) e instálalo con las opciones por defecto.
- Internet **solo** para la instalación inicial. Después, todo funciona sin conexión.

## 2. Descomprime e instala

1. Descomprime el zip en cualquier carpeta (por ejemplo, Documentos).
2. Abre una terminal:
   - **Windows**: PowerShell (menú Inicio → escribe "PowerShell").
   - **Mac**: Terminal (Aplicaciones → Utilidades).
3. Entra en la carpeta del simulador y ejecuta:

   ```
   cd musk
   npm install
   ```

   Espera a que termine (la primera vez puede tardar un par de minutos).

## 3. Arranca el simulador

```
npm run sim
```

Verás el saludo del asistente y `you (lead) >`. Desde ahí, escribes lo que diría un alumno.

## 4. Prueba estas frases, en este orden

| # | Escribe | Qué debes ver |
|---|---|---|
| 1 | `Hola` | El asistente saluda |
| 2 | `¿es online o presencial?` | Explica que es online, con clases en directo |
| 3 | `¿cuánto cuesta?` | **NO da precios**; dice que se habla en una llamada |
| 4 | `¿hay financiación?` | Dice que existen opciones; no da condiciones |
| 5 | `¿me pasáis el temario?` | **NO da el temario detallado**; ofrece el contenido general |
| 6 | `¿cuánto dura el curso?` | No hay respuesta aprobada: lo registra como duda y propone que os contacten |
| 7 | `me parece muy caro` | Sin importes, invita a la llamada |
| 8 | `bueno, me va bien una llamada` | Acepta la llamada y avisa al equipo — **ese es el objetivo del flujo** |
| 9 | `no me interesa` | Lo respeta con tono amable y deja la puerta abierta (no es una parada) |
| 10 | `no me escribáis más` | Para el seguimiento; cualquier mensaje posterior ya no recibe respuesta |

## 5. Qué debéis comprobar (los criterios de validación)

1. **Nunca** comunica precios ni importes (ni €, ni "euros", ni cifras).
2. **Nunca** comunica el temario detallado.
3. Financiación: solo dice que existen opciones y remite a la llamada.
4. Ante algo sin respuesta aprobada: registra la duda y propone contacto humano, sin inventar.
5. "no me interesa" → trato amable y sin presión; no se confunde con una parada.
6. "no me escribáis más" → respeta el rechazo y detiene el seguimiento.
7. El flujo completo termina en una llamada humana (nunca vende por WhatsApp).

Probad también frases "fuera de guion" (lo que se os ocurra que diría un alumno real); todas deben caer en alguno de los comportamientos anteriores.

## 6. Mandos del simulador

- `/reset` → empezar una conversación nueva
- `/state` → ver el registro de la conversación
- `/exit` o `Ctrl+C` → salir

## 7. Notas

- Todo es **local y simulado**: no hay canal real, no hay leads reales, no se sube nada a internet.
- El contenido es el del **piloto (Curso de Desarrollo Full Stack)** trabajado desde el dossier; la redacción final está pendiente de vuestra validación.
- Si algo falla o aparece un error, **copiad el mensaje de error** y enviádselo a Script9 tal cual.