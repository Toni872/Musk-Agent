# Feature: redaccion-llm — Fase B2 del endurecimiento de PII

Objetivo: que el teléfono, el email y el documento (DNI/NIE) que un lead escriba
en el chat no salgan hacia el proveedor del LLM. Reducción del envío, no
eliminación: el texto limpio sigue viajando, así que el DPA sigue pendiente.
Rama: `security/pii-hardening`. Entrega: work-unit commits en la rama; push y
merge los decide el humano. Runner: `uv run pytest`.

## Specs

- **S1.** `redact(text)` sustituye emails por `[email]`, teléfonos (9+ dígitos,
  con prefijo de país opcional) por `[telefono]` y DNI/NIE por `[documento]`.
- **S2.** `redact` no toca nombres, años («2026»), cantidades («2 años»,
  «6 meses») ni texto sin datos personales: solo lo que identifica de forma
  directa, para no degradar la conversación.
- **S3.** La única copia que llega al modelo —el historial que arma
  `_build_history_messages`— se redacta; la copia guardada (`self._history`), la
  recuperación y el modo determinista conservan el texto original.
- **S4.** La redacción está siempre activa en el límite del LLM (sin flag ni
  configuración) y no depende del proveedor.
- **S5.** La documentación técnica y de negocio queda actualizada y el gate
  completo sigue verde; las once reglas duras no cambian.

## Tasks

| ID | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|
| T1 | S1, S2 | inline | hecho | `app/redaction.py` (nuevo), `tests/test_redaction.py` (nuevo, 11 verdes). |
| T2 | S3, S4 | inline | hecho | `app/agent.py` (`_build_history_messages` redacta todo el historial), `tests/test_agent.py::test_history_sent_to_the_llm_is_redacted`. |
| T3 | S5 | inline | hecho | `docs/operacion/endurecimiento-pii.md` (B2 hecho), `AGENTS.md`, `README.md`, recuentos de tests a 253. |
| T4 | gate | inline | hecho | ruff limpio, mypy strict (26 ficheros), 253 tests, pilot_gate limpio. |

## Log

- **L1 (petición original).** Tras B1, el usuario pregunta «que me aconsejas?»;
  la respuesta acordada es redacción antes del LLM (el flujo de mayor frecuencia
  y sin dependencia de terceros), por delante del cifrado en reposo.
- **L2.** «Si, mejor asi no?» — autoriza la redacción de teléfonos, emails e
  identificadores, con el DPA y los nombres como decisión abierta.
- **L3 (contexto).** El usuario aporta un prompt de otra IA (rol de auditor PII
  RGPD/NIST). Se confirma que es el corpus estándar ya recogido en
  `endurecimiento-pii.md`, y se incorporan tres matices que faltaban: copias del
  proveedor (trazas/datasets), pseudonimización ≠ anonimización, y zero-trust
  por petición → cuentas por operador.
- **L4 (decisión técnica).** La redacción vive en el límite del LLM
  (`_build_history_messages`), no en el proveedor ni en la recuperación: lo que
  sale va limpio, lo que se guarda y se busca conserva el original. Se redacta
  todo el historial (no solo el turno del lead) para cerrar el eco de un dato en
  una respuesta anterior de la agente.
- **L5 (decisión de alcance).** Teléfono, email y DNI/NIE se redactan siempre;
  los nombres y las secuencias numéricas largas arbitrarias no, para no romper
  frases como «2 años de experiencia». Los nombres quedan `TODO(decisión)`.
- **L6 (límite declarado).** Redactar reduce pero no elimina: el texto limpio
  sigue yendo al proveedor. El cierre legal es el DPA y un proveedor que no
  entrene, pendientes de MUSK.
