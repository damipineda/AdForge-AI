# Cómo usamos el Meta Model API

Documento de soporte para el Cerebral Valley Hackathon. Explica qué parte del pipeline resuelve cada modelo, cuál es el contrato real que verificamos contra la llave y dónde está el código.

Todo lo de abajo está **medido contra la llave real el 26-oct**; las sondas que lo comprobaron quedaron en `.probe/` (gitignoreadas, contienen fotos de prueba con copyright).

## Mapa rápido

| Modelo | Rol en AdForge | Archivo | Estado |
| --- | --- | --- | --- |
| `muse-spark-1.3` | Visión sobre la foto (bounding box + paleta + arquetipo) | `src/lib/pipeline/sam-segmentation.ts` | live, verificado |
| `muse-spark-1.3` | Listing, copy ES/PT/EN, textos de flyer, audiencias | `src/lib/pipeline/muse-spark.ts` | live, verificado |
| `muse-spark-1.3` | Tokens de las 3 escenas de estudio (fallback Canvas) | `src/lib/pipeline/studio-scenes.ts` | live, verificado |
| `muse-image-1.0` | Los 3 flyers con el copy horneado en el diseño | `src/lib/pipeline/muse-image.ts` | live, verificado |
| `sam-3.1` | **No se usa** — ver el caveat más abajo | — | descartado |
| Muse Code | Módulos auxiliares y exportadores | ver abajo | usado en el sprint |

El transporte HTTP de los cuatro caminos vive en `src/lib/pipeline/meta.ts`. Ningún stage lo llama directo: pasa por el router `src/lib/pipeline/llm.ts`, que expone solo `llmJson()` y `llmImage()`.

## El contrato real del Meta Model API

Base `https://api.meta.ai/v1`, una sola llave (`MUSE_IMAGE_API_KEY`, formato `LLM_...`). Con ella, `GET /v1/models` devuelve `muse-image-1.0`, `muse-spark-1.3`, `sam-3.1`, `muse-wonder-1.0` y `muse-voice-transcribe-1.0`.

**Texto y visión → `POST /v1/responses`.** Es el único endpoint de texto; `/v1/chat/completions` responde 400.

```ts
{
  model: "muse-spark-1.3",
  input: [{ role: "user", content: [
    { type: "input_text", text: prompt },
    { type: "input_image", image_url: `data:${mime};base64,${b64}` },  // opcional
  ]}],
  text: { format: { type: "json_schema", name: "...", strict: true, schema } },
}
```

La respuesta trae el JSON en `output[].content[].text`. `previous_response_id` funciona, así que se puede encadenar una segunda pasada (por ejemplo "cambiame el fondo de este flyer") sin reenviar el contexto completo.


**Imagen sobre la foto real → `POST /v1/images/edits`** (multipart: `model`, `prompt`, `image`, `size`). Devuelve `data[0].b64_json` y el MIME en `output_format`. Es el único camino img2img que acepta la foto; `/v1/images/generations` con imagen da `unknown parameter` — ese endpoint es solo text-to-image.

Ojo con `size`: se pide `1536x2048` y el modelo responde `1344x1792` igual (snap a su propia ladder). El canvas de descarga lee `naturalWidth`/`naturalHeight` para no bajar la resolución del PNG.

**El caveat de `sam-3.1`.** Está en el catálogo y responde 200, pero con `output_text` vacío, y no existe endpoint de máscaras (`/v1/segmentations` y `/v1/masks` dan 404). La pasada de visión — bounding box incluido — la hace `muse-spark-1.3` sobre la foto. El nombre del stage interno sigue siendo `sam` solo porque el SSE y la barra de progreso ya lo usan; renombrarlo no cambia nada observable.

## Latencias y costos medidos

| Etapa | Modelo | Tiempo |
| --- | --- | --- |
| Visión de la foto | muse-spark-1.3 | 13–20 s |
| Copy, listing y audiencias | muse-spark-1.3 | 61–68 s (razona antes de contestar) |
| 3 flyers en paralelo | muse-image-1.0 | 24 s |
| **Total de una corrida** | | **~105 s** |

Muse Image cobra $0.01 por imagen plano, sin importar el razonamiento: **3 flyers = $0.03 por campaña**. Con los créditos del hackathon no conviene routeear nada por un proveedor externo.


## Prompts

**Visión** — pide `dominantColorHex`, `secondaryColorHex`, `styleArchetype` y el bounding box normalizado en `[0, 1]`. La paleta real alimenta al Motor de Estilos, que la convierte en el tema (papel, acento, degradé del split, color de halo) de los tres flyers.

**Copy** — el orquestador exige JSON con el schema serializado y estas reglas:
- Todo el copy en `{locale}`.
- `hook` ≤ 40, `body` ≤ 125, `cta` ≤ 30.
- `bulletFeatures` son extractos literales de las notas del producto, no invenciones.
- Si falta información, va a `missingInformation`, no la inventes.
- `reviewRequired` siempre `true`.

Si la respuesta no valida contra Zod local, se hace un repair attempt con el error de Zod inline antes de devolver error.

**Flyers** — `posterPrompts()` en `src/lib/pipeline/muse-image.ts` arma un prompt distinto por variante con el hook, el CTA, la dirección de arte y el `featurePills` reales, más las instrucciones de composición del arquetipo fijo por posición (V1 `editorial-poster`, V2 `split-commerce`, V3 `bold-dark`). La intención explícita es que **no salga una plantilla**: el layout nace del copy de esa pieza, y el producto es el de la foto subida porque el request es img2img.

## Muse Code — qué hizo

Durante el sprint se le pidió a Muse Code:

1. **Extender el exportador CSV de Meta Commerce Manager.** `toMetaCatalogFeed()` en `src/lib/schema/campaign.ts` arrancó a mano con las columnas obligatorias del feed; el pedido fue cubrir los campos opcionales (`mpid`, `gtin`, `inventory_location`, `adwords_additional_category`).
2. **Ampliar los fixtures demo.** `src/lib/pipeline/demo-fixtures.ts` tenía un solo producto (el termo); el objetivo son 2-3 más (mochila, set de mate, lámpara) para que el video de demo muestre variedad.
3. **Mantener el smoke test.** `scripts/smoke.mjs` (script `pnpm demo:check`) sube un PNG 1×1, consume el SSE y valida los 6 eventos de stage, el orden de arquetipos V1/V2/V3 y que `designData` traiga paleta.
4. **La limpieza del refactor Meta-only**: router `llm.ts`, normalización de `toStrictJsonSchema()` y la poda de los providers que quedaron fuera del camino.

## Cómo se ve el flujo en el video de demo

1. **0:00-0:15** — Portada y pitch de una línea: "Subí una foto de tu producto, tené una campaña completa con tus propios flyers".
2. **0:15-0:35** — Drag & drop de la foto en el dashboard, selector de idioma (cambiar entre ES y PT para mostrar la diferencia).
3. **0:35-1:05** — Barra de progreso en vivo mientras llegan los SSE events. Detenerse en cada píldora y nombrar el modelo: visión con `muse-spark`, copy con `muse-spark`, flyers con `muse-image`. Es la parte larga de verdad (~105 s), así que se graban corridas en paralelo y se edita.
4. **1:05-1:30** — Tab "Estudio Visual": comparador antes/después y los 3 flyers generados. Zoom al copy dentro de la imagen para mostrar que no es una plantilla, y descarga del PNG a resolución nativa.
5. **1:30-1:50** — Tab "Meta Ads Copy": las 3 tarjetas, click en "Copiar" para mostrar el hook, y las audiencias.
6. **1:50-2:05** — Tab "Storefront JSON": click en `.json` y `.csv` para mostrar las descargas.
7. **2:05-2:15** — Cierre: badge **LIVE: META API** en el TopBar, con `mode: "meta"` en el response. "Corriendo sobre el Meta Model API ahora mismo, con una sola llave."
