# Plan de retrieval híbrido: ajustes y datos verificados

Contexto: el plan propuesto (benchmark → BM25 + embeddings locales + RRF → reglas por delante → entregar pasaje aprobado) se mantiene. Este documento añade ajustes y datos contrastados con la documentación (consultados el 21/10/2026).

## Ajustes al plan

1. **Separar dev y test en el benchmark.** Las frases recién corregidas sirven para desarrollo. Reservar un conjunto de test que no se toque hasta el final, para no aprobar por sobreajuste. Incluir casos negativos (fuera de alcance, donde lo correcto es abstenerse).
2. **No usar la puntuación RRF para abstenerse.** RRF solo conserva posiciones, no confianza. Para decidir entre responder, aclarar o derivar, usar la similitud coseno del mejor candidato y/o el margen entre el primero y el segundo, con umbrales ajustados en dev.
3. **Probar primero lo barato, sin modelo:**
   - Enriquecer cada pasaje con 10-20 preguntas de ejemplo.
   - Normalizar tildes y mayúsculas.
   - Stemming en español.
   - N-gramas de caracteres (tolera erratas).
   Si el benchmark ya pasa, no hacen falta embeddings.
4. **Ajustar k de RRF.** Con un corpus pequeño, k=60 da una curva casi plana (rank 1 y 2 casi empatan). Probar k bajos (5-20) en el benchmark.
5. **Paráfrasis de intenciones protegidas.** Las reglas por palabras clave (precio, financiación, temario, rechazo, petición de persona) también fallan con paráfrasis. Incluirlas en el benchmark; si fallan, dejar que el retrieval las detecte y las enrute a la regla correspondiente, nunca a un pasaje genérico.
6. **Hacer commit o rama antes de experimentar**, para comparar con el comportamiento determinista actual y poder volver atrás.

## Datos verificados sobre Vercel

- Tamaño máximo de una función estándar: **250 MB sin comprimir**, incluidas las capas del runtime.
- **Funciones grandes:** con Fluid Compute se admiten paquetes de hasta **5 GB** sin comprimir (Node.js, Python y contenedores). Confirmar disponibilidad en el plan del proyecto.
- Memoria máxima: Hobby 2 GB, Pro/Enterprise 4 GB.
- Los ficheros grandes (JSON, datos) no deben ir dentro del bundle si se pueden servir desde el CDN.
- Se puede controlar qué entra en la función con `includeFiles` / `excludeFiles` en `vercel.json` (en Next.js se usa `outputFileTracingIncludes`).

Fuentes:
- https://vercel.com/docs/functions/limitations
- https://vercel.com/kb/guide/troubleshooting-function-250mb-limit

## Datos verificados sobre el modelo de embeddings

Candidato: `Xenova/multilingual-e5-small` (multilingüe, 384 dimensiones, licencia MIT).

| Variante ONNX | Tamaño |
|---|---|
| model.onnx | ~470 MB |
| model_fp16.onnx | ~235 MB |
| model_quantized.onnx | ~118 MB |

- Más ~17 MB de `tokenizer.json` y ~5 MB de `sentencepiece.bpe.model`.
- **Memoria en ejecución:** una variante con vocabulario recortado documenta que, con transformers.js en q8, la memoria residente baja de ~796 MB a ~414 MB. Medir la memoria real del modelo sin recortar.
- **Prefijos obligatorios:** `query: ` para consultas y `passage: ` para pasajes.
- **No usar** las variantes recortadas solo EN+FR: no sirven para español. Un recorte propio con el corpus en español es opcional.
- Precalcular los embeddings de los pasajes en build y guardarlos en JSON. En runtime solo se embebe la consulta.

Fuentes:
- https://huggingface.co/Xenova/multilingual-e5-small
- https://huggingface.co/kintopp/multilingual-e5-small-rijksmuseum

## Riesgo de despliegue: backend nativo

`@huggingface/transformers` en Node detecta y prioriza por defecto el backend nativo (`onnxruntime-node`), y en Vercel eso puede fallar al desplegar. La solución documentada es forzar el backend WASM (`onnxruntime-web`). **Probarlo en un despliegue de preview, no solo en local.**

Fuente: https://www.technetexperts.com/vercel-onnxruntime-so-fix/amp/

## Sobre RRF

RRF evita calibrar puntuaciones porque usa solo posiciones, pero por eso mismo no expresa "aquí no hay nada bueno". Usarlo para generar candidatos y fusionar, no como medida de confianza. Si hace falta un reranker, tratarlo como paso aparte.

Fuentes:
- https://shop.zimaspace.com/blogs/tech-ai-hub/reciprocal-rank-fusion-when-hybrid-search-benefits
- https://dev.to/adaschevici/the-knobs-run-out-np0

## Criterio de aceptación y de parada

- Aceptar el cambio solo si mejora las paráfrasis del test sin perder aciertos actuales ni introducir falsos positivos.
- Medir en Vercel: tamaño del bundle, memoria, cold start y latencia del modelo concreto.
- Si el modelo no cabe o no rinde, **parar y presentar el resultado**. No cambiar a un proveedor externo de IA sin consultarlo.

## No verificado

Cold start y latencia reales de este modelo en Vercel: no hay cifras fiables publicadas para este caso. Hay que medirlas.
