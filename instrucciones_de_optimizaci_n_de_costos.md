# Guía y Reglas de Optimización de Costos (DeepSeek + OpenCode)

> **Objetivo:** Maximizar el rendimiento y duración del saldo de la API minimizando el consumo de tokens y maximizando la tasa de aciertos de caché ( Cache Hit Ratio ).

---

## 1. Contexto de Facturación y Caché
- **Diferencia de costo:** Un acierto de caché (*Cache Hit*) es **50 veces más barato** que un fallo (*Cache Miss*).
- **Mecanismo de Caché:** Funciona por coincidencia exacta del **prefijo** de la conversación. Cualquier alteración al inicio del prompt destruye la caché.
- **Ruta crítica:** Mantener los prefijos idénticos y estables entre solicitudes.

---

## 2. Reglas Directivas para el Asistente de IA

### 📥 Reglas de Entrada y Lectura (Lado del Asistente)
1. **Acceso estricto:** Lee únicamente los archivos especificados de forma explícita por el usuario. No leas ni inspecciones archivos no mencionados por iniciativa propia.
2. **Búsqueda eficiente:** Si necesitas comprender la estructura del proyecto o localizar código, utiliza comandos específicos como `glob` o `grep` antes de leer contenido completo.
3. **Lectura acotada:** Al leer archivos, prioriza siempre el uso de rangos de líneas (ejemplo: `read file.ts lines 50-120`) en lugar de cargar el archivo entero.

### 📤 Reglas de Salida y Generación (Tu Respuesta)
1. **Concisión extrema:** Responde de la forma más breve y directa posible. 
   - Prohibido repetir la pregunta del usuario.
   - Prohibido incluir introducciones, saludos o explicaciones de cortesía.
2. **Edición compacta:** Al modificar código, muestra únicamente las líneas modificadas junto a 2 o 3 líneas de contexto superior e inferior. **Nunca repitas el archivo completo.**
3. **Manejo de ambigüedad:** Si una solicitud es ambigua, realiza una pregunta aclaratoria corta antes de asumir la respuesta y generar bloques extensos.
4. **Respuestas de estado:** No resumas "lo que hiciste antes" ni expliques el proceso. Limítate a responder `completado` o `modificado [X]`.
5. **Cero código redundante:** Queda estrictamente prohibido incluir código de ejemplo innecesario, bloques de comentarios explicativos o documentación adicional a menos que el usuario lo pida expresamente.

### ⚡ Reglas de Mantenimiento de Caché
1. **Prompt del Sistema:** Mantén las instrucciones base sin modificaciones entre llamadas para conservar el prefijo estable.
2. **Continuidad temática:** Si el usuario pasa a un tema totalmente no relacionado, recuérdale iniciar una **sesión nueva** para no arrastrar un historial largo innecesario.
3. **Modo de operación:** Prioriza la versión de modelo **Flash** sobre la Pro a menos que la tarea requiera un razonamiento complejo explícito.

---

## 3. Hábitos Operativos Recomendados
- **Horarios Valle:** Las horas punta (9:00-12:00 y 14:00-18:00 UTC+8 de L-V) cuestan el doble. Programa tareas no urgentes en horario nocturno o fines de semana.
- **Consultas focalizadas:** Realiza preguntas precisas citando la función y el archivo específico en vez de solicitudes genéricas.
- **Gestión de Sesiones:** Evita el uso repetido de `/clear` (destruye la caché desde cero) y los plugins de poda agresivos si ya cuentas con un *hit-rate* alto.