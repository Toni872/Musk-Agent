# Feature: operadores-auditoria — Fase B3 del endurecimiento de PII

Objetivo: sustituir la única clave compartida por una cuenta por operador y
dejar registro de quién accedió a qué, sin reescribir el mecanismo de auth.
Rama: `security/pii-hardening`. Entrega: work-unit commits en la rama; push y
merge los decide el humano. Runner: `uv run pytest`.

## Specs

- **S1.** `MUSK_OPERATORS` (`nombre:contraseña` separados por coma) da a cada
  persona su cuenta; la pareja única `MUSK_BASIC_AUTH_USER` /
  `MUSK_BASIC_AUTH_PASSWORD` sigue funcionando y se trata como un solo operador.
- **S2.** Una entrada mal formada (sin dos puntos, nombre o contraseña vacíos) se
  ignora sin deshabilitar al resto; una lista vacía o toda mal formada falla
  cerrado (sin auth → 401).
- **S3.** Cada operador autentica con su contraseña; un usuario desconocido o una
  contraseña equivocada recibe 401. La comparación es de tiempo constante.
- **S4.** En una petición autenticada, el nombre del operador se adjunta a
  `request.state.operator` y se registra un evento `access` (operador, método,
  ruta) a nivel INFO.
- **S5.** La documentación técnica y de negocio queda actualizada y el gate
  completo sigue verde; las once reglas duras no cambian.

## Tasks

| ID | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|
| T1 | S1, S2 | inline | hecho | `app/auth.py` (`load_operators_from_env`, `_parse_operators`), `tests/test_operators.py`. |
| T2 | S3, S4 | inline | hecho | `app/auth.py` (`BasicAuthMiddleware` con `credentials` + `access`), `app/main.py`, `tests/test_operators.py` (atribución vía ruta `echo`). |
| T3 | S5 | inline | hecho | `docs/operacion/endurecimiento-pii.md` (B3), `docs/cliente/estado-de-seguridad.md`, `README.md`, `.env.example`, recuentos a 262. |
| T4 | gate | inline | hecho | ruff limpio, mypy strict (26 ficheros), 262 tests, pilot_gate limpio. |

## Log

- **L1 (petición original).** «pues las dos no?? la cosa es que me está costando
  seguirte en este punto, no entiendo muy bien de ciberseguridad. Quiero estar
  tranquilo de que todo va a estar bien y el flujo del agente va a ser correcto.»
  → se separa el flujo (ya probado) de la seguridad, y se entrega
  `docs/cliente/estado-de-seguridad.md` en lenguaje llano antes de implementar.
- **L2 (autorización).** «si» → se implementa primero cuentas por operador, luego
  copias de seguridad.
- **L3 (decisión técnica).** Se mantiene `MUSK_BASIC_AUTH_USER/PASSWORD` por
  compatibilidad y se añade `MUSK_OPERATORS`; una lista mal formada falla cerrado
  (nunca abre la app por un typo).
- **L4 (decisión de auditoría).** El evento `access` se emite a INFO y se ve con
  `log_level=INFO`: no se sube el nivel por defecto para no inundar los logs del
  resto. Queda documentado.
- **L5 (decisión abierta).** La lista definitiva de operadores (quiénes y sus
  contraseñas) se fija al desplegar; no se versiona ningún secreto.
