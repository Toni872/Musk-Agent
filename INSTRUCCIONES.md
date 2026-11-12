# MUSK — Simulador del asistente (PROBARLO EN VUESTRO EQUIPO)

Esto es el **motor conversacional del MVP**: todavía no está conectado a WhatsApp. Es una página web local en la que escribes frases como las escribiría un alumno y ves responder al asistente de MUSK.

Funciona **en local y sin leads reales**: todo es simulado. Sin clave de LLM, no sale nada a internet; con el LLM configurado, el texto de la conversación se envía al proveedor (Groq) para que el agente responda.

---

## 1. Qué necesitas (solo la primera vez)

- Un ordenador con **Windows o Mac**.
- **uv**, el gestor de Python de Astral. Instálalo así:
  - **Windows**: abre PowerShell y ejecuta
    ```
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    ```
  - **Mac**: abre la Terminal y ejecuta
    ```
    curl -LsSf https://astral.sh/uv/install.sh | sh
    ```
  - Cierra y vuelve a abrir la terminal al terminar.
  - uv descarga Python 3.12 por su cuenta; no hace falta instalar Python a mano.
- Internet **solo** para la instalación inicial. Después, todo funciona sin conexión (salvo que configures el LLM).

## 2. Descomprime e instala

1. Descomprime el zip donde quieras (por ejemplo, en el Escritorio). Dentro te quedará una carpeta (por ejemplo, `Musk-Agent`).
2. Abre una terminal **ya dentro de esa carpeta**. No hace falta ejecutar nada como administrador (y no lo hagas: si el título de la ventana dice "Administrador", ábrela normal).
   - **Windows**: abre esa carpeta en el Explorador → haz clic en la barra de direcciones de arriba → escribe `powershell` → Enter.
   - **Mac**: abre la Terminal, escribe `cd ` (con un espacio al final), arrastra la carpeta a la ventana y pulsa Enter.
3. Comprueba que estás en el sitio correcto: escribe `dir` (Windows) o `ls` (Mac). Debes ver `pyproject.toml` entre los archivos. Si no lo ves, no estás dentro de la carpeta.
4. Instala y comprueba que todo está bien:

   ```
   uv sync
   uv run pytest
   ```

   La primera vez puede tardar un par de minutos. Si al final del `uv run pytest` pone **201 passed**, todo está correcto y ya puedes arrancar el simulador.

## 3. Arranca el simulador

```
uv run uvicorn app.main:app --port 4173
```

Abre `http://localhost:4173` en el navegador. Verás la página de la demo: pulsa **Empezar la demo** y escribe lo que diría un alumno. El asistente responde y hace una sola pregunta por turno, con el perfil único de `app/content.py` (**copy unificado pendiente de firma de MUSK**). Para cerrarlo, pulsa `Ctrl+C` en la terminal.

## 4. Prueba estas frases, en este orden

| # | Escribe | Qué debes ver |
|---|---|---|
| 1 | `Hola` | El asistente saluda |
| 2 | `¿es online o presencial?` | Explica que es online, con clases en directo |
| 3 | `¿cuánto cuesta?` | **NO da precios**; dice que se habla en una llamada |
| 4 | `¿hay financiación?` | Indica que hay opciones y que puedes completar la formación en dos años con flexibilidad; no da precios ni condiciones de pago |
| 5 | `¿me pasáis el temario?` | **NO da el temario detallado**; ofrece el contenido general |
| 6 | `¿cuánto dura el curso?` | Indica que tienes dos años para completarla con flexibilidad; remite el calendario y las fechas de inicio a una llamada, sin dar cifras |
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
8. La conversación es libre y empática: el asistente hace una pregunta por turno (sin examen ni filtro) y propone la llamada cuando hay interés real. El cierre pide un día y una hora convenientes.

Probad también frases "fuera de guion" (lo que se os ocurra que diría un alumno real); todas deben caer en alguno de los comportamientos anteriores.

## 6. Controles de la página

- **Reiniciar** → empieza una conversación nueva (pide confirmación).
- **Estado de la conversación** → panel con los registros, las dudas, las métricas y el aviso simulado.
- **Descargar informe** → PDF de la sesión.
- **Descargar JSON** → los mismos datos en JSON.
- **Copiar aviso** → copia el aviso simulado para Laura.
- `Ctrl+C` en la terminal → detiene el servidor.

## 7. Notas

- Todo es **local y simulado**: no hay canal real, no hay leads reales. Sin clave de LLM no sale nada a internet; con ella, la conversación se envía al proveedor para que responda el modelo.
- La presentación general puede incluir las cinco formaciones; no hace falta ahora un catálogo detallado.
- Si quieres activar el LLM, copia `.env.example` a `.env`, rellena `MUSK_LLM_BASE_URL` y `MUSK_LLM_API_KEY`, y vuelve a arrancar el servidor. Sin esas dos variables, el agente funciona en modo determinista con los pasajes aprobados.
- Si prefieres Docker, los comandos están en `README.md`.
- No hay una URL pública: el repositorio no despliega solo. Para una muestra controlada, hablad con Script9.
- Si algo falla o aparece un error, **copiad el mensaje de error** y enviádselo a Script9 tal cual.
- Si la terminal se abrió como administrador o fuera de la carpeta del proyecto, ciérrala y repite el paso 2.
