# Cómo documentar el flujo del agente MUSK

## ¿Dónde vive hoy la documentación?
- **En memoria del agente** (`src/agent.ts`): `conversationRecords`, `doubts[]`, `qualificationAnswers`, `HandoffContext` (con `afterHandoff`).
- **En el simulador UI** (`ui/`): panel "Conversación" (lead/agente), panel "Registros" (cronología de decisiones), panel "Dudas" (contador + listado).
- **En logs de prueba**: `scripts/test-flow.ts` muestra el flujo completo + estado final.

## Recomendación práctica
**No generes un PDF estático con una conversación ficticia. Genera un PDF dinámico por sesión.**

Tienes dos opciones, yo te aconsejo la **opción A** por sencillez.

### A) Añadir "Exportar informe" en el simulador (recomendada)
Añadir un botón "Exportar informe PDF/JSON" en la UI que genere un informe con:

| Sección | Contenido |
|---|---|
| Cabecera | Fecha/hora, lead (id/contacto/bucket), URL; no hay campo de perfil en la exportación |
| Conversación completa | Todos los mensajes en orden: `LEAD: ...` / `AGENTE: ...` con timestamp si se añade |
| Registros | Tabla cronológica: tipo, intent, acción, detalle |
| Respuestas capturadas | Pregunta del agente -> respuesta del lead |
| Dudas registradas | Listado deduplicado (con texto literal) |
| Handoff / Aviso a Laura | Razón, contacto, bolsa, formación, cualificaciones, dudas, último mensaje, resumen comercial, mensajes post-handoff |
| Estado final | `stopped`, `handoffFired`, turnos, dudas totales |

**Ventaja:** Siempre fiel a lo que realmente pasó. Sin riesgo de desactualizarlo.
**Esfuerzo:** Bajo (añadir timestamps + función export).

### B) Exportar desde CLI (rápida para pruebas)
Usando `scripts/test-flow.ts` ampliado: generar `docs/informes/<fecha>-<leadId>.pdf` con `mdpdf`/`md-to-pdf`. Útil para tests, menos práctico para demos con Nicolás.

### C) Guardar HTML/JSON y convertir a PDF
Exportar JSON desde la UI (`ChatState`) y generar un PDF con plantilla. Funciona, pero requiere herramienta extra.

## Mi recomendación concreta
**Ve por la A.** 

Pasos que te sugiero:
1. **Añadir timestamps** a `ConversationRecord` (`src/agent.ts`) y a los mensajes (`ChatMessage`). Hoy solo hay orden, con hora se ve mucho más claro para supervisión.
2. **Añadir botón "Descargar informe"** en `ui/main.ts`. Generar un HTML con todo y usar `window.print()` con estilos CSS para imprimir a PDF, o bien generar PDF con `jsPDF`.
3. **Incluirlo en el panel "Registros/Estado"** o en la cabecera del simulador.
4. **Guardar también JSON** (útil para revisar con datos).

**Mi consejo:** Usa `window.print()` primero. Es lo más rápido, no añade dependencias, funciona en Vercel y te permite guardar como PDF desde el navegador sin romper nada.

Así tendrás **la documentación exacta de cada prueba**: peticiones del lead + respuestas del agente + trazas + handoff, todo en un solo PDF generado por sesión.
