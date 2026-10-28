# AdForge AI · Autonomous Product-to-Campaign Pipeline

Sube la foto casera de un producto y tenés una campaña publicitaria completa: una pasada de visión que extrae la paleta real y el bounding box del objeto, el listing de Shopify con SEO, tres variantes de anuncio para Meta Ads con copy ES/PT/EN, tres audiencias y **tres flyers generados por IA con el copy horneado en el diseño** (no una plantilla: el modelo escribe el hook, la dirección de arte y la composición dentro de la imagen). Cada flyer se descarga en PNG a resolución nativa y la salida incluye el JSON de Shopify y el CSV para el Catalog de Meta.

El tiempo en modo `meta` depende del proveedor, del carrusel y de las revisiones y posibles regeneraciones. En modo `demo` no se llama a la red.

Este proyecto está construido para el **Cerebral Valley Hackathon (Meta Model API)**. Corre netamente sobre el Meta Model API — `muse-spark-1.3` para visión y copy, `muse-image-1.0` para los flyers — con una sola llave. Con `DEMO_MODE=true` usa fixtures locales deterministas para desarrollar sin key ni billing.

## Qué hace

- Recibe una imagen (`jpeg`, `png` o `webp`, hasta 8 MB) y un idioma (`es`, `pt`, `en`).
- Ejecuta tres etapas encadenadas (visión → copy → flyers) y las transmite al navegador como **Server-Sent Events** mientras corren, para animar la barra de progreso en vivo.
- Valida la respuesta completa con un schema Zod derivado del `CatalogDraft` de [ecommerce-ai-catalog-agent](https://github.com/damipineda/ecommerce-ai-catalog-agent), extendido con variantes de anuncio, audiencias y assets visuales.
- Exporta dos artefactos listos para producción:
  - **Shopify Product JSON** — compatible con el Importer oficial (`product.title`, `body_html`, `images[]`, `metafields_global_*`).
  - **Meta Commerce Manager CSV** — columnas `id, title, description, image_link, availability, condition, brand, product_type, google_product_category`.
- Marca explícitamente `review_required: true` en la respuesta: ninguna campaña se auto-publica, siempre hay un humano que revisa.

## Quickstart

```bash
pnpm install
cp .env.local.example .env.local   # sin key puesta, el provider cae a demo
pnpm dev                            # http://localhost:3000
```

En el dashboard: arrastrá una foto, elegí mercado, click en **Generar campaña**. El progreso incluye visión, estrategia, generación y revisión, seguidas de las pestañas de resultado.

Para probar el endpoint sin navegador:

```bash
curl -N -X POST http://localhost:3000/api/generate-campaign \
  -F "image=@ruta/a/foto.jpg;type=image/jpeg" \
  -F "locale=es"
```

Vas a recibir seis eventos `stage` (running + done por etapa) y un `result` final con el JSON completo.

## Cambiar a modo live

1. `.env.local` → `MUSE_IMAGE_API_KEY=<llave LLM_... del Meta Model API>`.
2. `.env.local` → `AI_PROVIDER=meta` (y `DEMO_MODE=false`; si falta el provider explícito, manda `DEMO_MODE`).
3. `pnpm dev` y subir una foto real. El TopBar debe decir **LIVE: META API**.

Una sola llave habilita los modelos configurados. El costo depende de las tarifas vigentes, la cantidad de piezas, las llamadas de revisión y hasta dos regeneraciones; verificarlo con el proveedor antes de usarlo a escala.

Si la llave no está o está vacía, `getProvider()` cae a `demo` en vez de reventar a mitad de la corrida — el dashboard sigue renderizando y el badge aclara que es demo.

Nada del frontend ni del schema cambia entre modos.

## Arquitectura

```
        foto + locale
              |
     [Route Handler POST /api/generate-campaign]
              |
              v
   +---------------------+
   |  runPipeline()      |
   |  src/lib/pipeline/  |
   +---------------------+
              |
   stage "sam" running              ~13 s
              v
   +------------------------------------------+
   | muse-spark-1.3 (visión sobre la foto)     | -> bounding box normalizado
   +------------------------------------------+    + paleta dominante/secundaria
              |                                     + arquetipo recomendado
   stage "museSpark" running        ~65 s
              v
   +------------------------------------------+
   | muse-spark-1.3 (/v1/responses con         | -> listing Shopify + SEO
   | text.format=json_schema, strict)          | -> 3 variantes de anuncio
   +------------------------------------------+    (concept, artDirection, hook,
              |                                      body, cta, featurePills)
              |                                   -> 3 audiencias
              |                                   -> flyerTexts
   stage "museImage" running        ~24 s
              v
   +------------------------------------------+
   | muse-image-1.0 (/v1/images/edits,         |
   | img2img sobre la foto REAL, 3 en          | -> 3 flyers con el copy
   | paralelo, el hook horneado en el diseño)  |    dentro, como data URL
   +------------------------------------------+
              |
              v
   campaignResultSchema.parse()   (Zod, estricto)
              |
              v
   SSE: event: result { CampaignResult }
              |
              v
   Dashboard renderiza tabs: Visual · Ads Copy · Storefront JSON
```

El copy se escribe **antes** que los pósters porque Muse Image necesita los hooks y CTA reales para hornearlos en la imagen. Si un flyer falla, la tarjeta cae al compositor Canvas local y `posterErrors[i]` guarda el motivo para que el usuario distinga "modelo saturado" de "código roto".

Todo corre dentro de Next.js 16 (App Router + Turbopack + `cacheComponents: true`). No hay servidor Python aparte: los modelos de Meta se consumen por HTTP desde los Route Handlers, y el pipeline es TypeScript puro.

## Contrato de entrada / salida

| Campo | Tipo | Origen |
| --- | --- | --- |
| `mode` | `demo` \| `meta` | `AI_PROVIDER` / `DEMO_MODE` en `.env.local` |
| `model` | string \| `null` | etiqueta del modelo usado (`null` en demo) |
| `skuId` | string | Fijo en demo; `AFG-` + SHA-256 de la imagen en live |
| `locale` | `es` \| `pt` \| `en` | Form field |
| `listing.standardizedTitle` | ≤ 120 chars | muse-spark-1.3 |
| `listing.bulletFeatures` | 1-6 strings | muse-spark-1.3 |
| `listing.seoMetadata` | title ≤ 60, description ≤ 155, keywords 1-5 | muse-spark-1.3 |
| `adVariants[3]` | concept, artDirection, hook ≤ 40, body ≤ 125, cta ≤ 30, featurePills ≤ 3 | muse-spark-1.3 |
| `adVariants[i].styleArchetype` | `editorial-poster` \| `split-commerce` \| `bold-dark` | Compositor local de respaldo; no determina el arte generado por IA |
| `creativeStrategy` | idea, audiencia, objetivo, mundo visual y decisión de carrusel | Muse Spark para cada producto |
| `audiences[1-6]` | name, interests, ageMin/Max, geo | muse-spark-1.3 |
| `segmentation` | `{x,y,width,height}` normalizado 0..1 | pasada de visión sobre la foto |
| `designData` | `dominantColorHex`, `secondaryColorHex`, arquetipo | pasada de visión sobre la foto |
| `flyerTexts` | headline ≤ 80, subheadline ≤ 140, 3 bullets | muse-spark-1.3 |
| `studioScenes[3]` | paleta, luz, sombra, badge, vibe | muse-spark-1.3 (fallback a `DEFAULT_SCENES`) |
| `posterImages[3]` | data URL \| `null` | muse-image-1.0 vía `/v1/images/edits` |
| `posterErrors[3]` | string \| `null` | Orquestador (motivo del fallback a Canvas) |
| `imageAssets[2-8]` | slot, url, sourceModel | Cutout (`/demo/cutout.svg`, solo en demo) + las 3 escenas de estudio |
| `timings` / `stageEvents[≥3]` | ms por etapa / stage, status, ms | Orquestador |
| `reviewRequired` | literal `true` | Siempre |

El schema completo vive en `src/lib/schema/campaign.ts` y usa `z.strictObject()` para rechazar campos extra, replicando `ConfigDict(extra="forbid")` de Pydantic.

## Cómo usamos los modelos de Meta

**`muse-spark-1.3` — visión.** Primer paso: lee la foto cruda por `POST /v1/responses` con `input_image` y devuelve el bounding box normalizado del producto, la paleta real (dominante + secundaria) y el arquetipo recomendado. El Motor de Estilos convierte esa paleta en el tema de los 3 flyers, así que el diseño sale del producto, no de una plantilla.

**`muse-spark-1.3` — copy.** Segundo paso: con la descripción del producto y el locale escribe el listing de Shopify (título, bullets, SEO), las 3 variantes de anuncio con `concept`, `artDirection`, hook/body/CTA y `featurePills`, los textos del flyer y las 3 audiencias de Meta Ads. Va por el mismo endpoint con `text.format = json_schema` y `strict: true`; `toStrictJsonSchema()` convierte el schema local a JSON Schema canónico (tipos en minúscula, `additionalProperties: false`, todo en `required`). Si la validación Zod local falla, se hace un repair attempt antes de devolver error.

**`muse-image-1.0` — flyers.** Tercer paso: `POST /v1/images/edits` en multipart (`model`, `prompt`, `image`, `size`) con la foto real como referencia y tres prompts en paralelo. Cada prompt comparte la estrategia y recibe el concepto, copy y dirección propios de la variante. No hay recetas fijas por posición. Responde `data[0].b64_json`; la imagen puede alterar detalles y debe revisarse.

**`sam-3.1` — no se usa.** Existe en el catálogo y responde 200, pero con `output_text` vacío y no hay endpoint de máscaras (`/v1/segmentations`, `/v1/masks` → 404). El bounding box lo saca `muse-spark-1.3` de la foto, así que el nombre del stage interno sigue siendo `sam` solo por compatibilidad con el SSE y la barra de progreso.

**Muse Code** — Se usó durante el sprint del 26 de octubre al 4 de noviembre para:
- Generar el exportador de CSV oficial de Meta Commerce Manager (`toMetaCatalogFeed` en `src/lib/schema/campaign.ts`).
- Redactar los fixtures demo en tres idiomas (`src/lib/pipeline/demo-fixtures.ts`).
- Escribir los tests de smoke del pipeline y sondear el contrato real del Meta Model API (las respuestas crudas quedaron en `.probe/`, gitignoreadas).

El detalle completo de prompts y artefactos está en [docs/muse-code-usage.md](docs/muse-code-usage.md).

## Tests

```bash
pnpm build          # TypeScript + Tailwind + Next compile
pnpm lint           # eslint
pnpm dev &          # deja el servidor en :3000
pnpm demo:check     # scripts/smoke.mjs: sube un PNG 1x1, consume el SSE y valida
                    # 6 eventos de stage, arquetipos V1/V2/V3 y designData
```

El pipeline en modo demo es determinista: la misma imagen + locale siempre produce el mismo `CampaignResult` en ~7 ms. Eso hace que `pnpm demo:check` verifique el flujo completo sin tocar red ni gastar créditos.

Para el modo live no hay test automático: cada corrida cuesta $0.03 y tarda ~105 s. Se verifica con el `curl -N` de arriba y mirando que `mode` sea `"meta"`, `posterImages` traiga 3 data URL y `posterErrors` los tres `null`.

## Límites del alcance

- Cada campaña ofrece las tres piezas como post 3:4 y Story estático 9:16; Muse Spark recomienda un carrusel de cuatro láminas cuando aporta al producto. Muse Image intenta generar las láminas con el mismo mundo visual y, si falla, la app compone una versión local con la foto original. Cada lámina se descarga por separado; la app no publica ni crea un carrusel en Meta. La lámina de deseo no debe inventar testimonios.
- Antes de generar se revisan las direcciones creativas; después, un modelo visual inspecciona cada post y lámina generada frente a la foto original y compara los tres posts. Los problemas críticos pueden activar hasta dos regeneraciones por campaña; una alternativa solo reemplaza a la original si su revisión se completa sin problemas críticos. Los fallos del revisor se muestran como revisión no disponible. Las Stories son adaptaciones del post y no reciben una revisión visual independiente. El modo demo no ejecuta estas revisiones.
- Stories se exportan como PNG de 1080 × 1920 con el arte 3:4 centrado y 240 px libres arriba y abajo; la generación nativa 9:16 del proveedor no está verificada. Reel aquí significa un recurso estático, no un video.
- La integración actual utiliza Muse Spark para visión y una caja aproximada. No hay una máscara SAM 3.1 funcional confirmada. Los flyers img2img de Muse Image pueden modificar el producto o su texto; revisar la salida. El carrusel preserva la foto original sin máscara, incluido su fondo.

- La validación del schema revisa estructura, no verdad. En modo live, el copy generado por `muse-spark-1.3` y los flyers de `muse-image-1.0` igual necesitan revisión humana antes de publicar; por eso `reviewRequired` es un literal `true` en el schema, no un default.
- El exportador Shopify deja `variants: []` a propósito: pricing no forma parte de la pipeline de campaña.
- El CSV de Meta Catalog no incluye `price` ni `availability` reales — el merchant los completa antes de subir.
- No hay persistencia: cada request es independiente. Si querés historial, agregás una tabla `campaign` en Postgres y un `INSERT` al final de `runPipeline`.
- `posterImages` viaja como data URL dentro del SSE (~2 MB por flyer). Es lo que hace la corrida pesada en la última etapa; si hay que recortar latencia, se sube a un bucket y se devuelve la URL.

## Descripción para portafolio

“Pipeline TypeScript en Next.js 16 que convierte una foto de producto en una campaña publicitaria completa sobre el Meta Model API: `muse-spark-1.3` extrae la paleta y el bounding box reales de la foto y escribe listing, copy de anuncio y audiencias; `muse-image-1.0` genera tres flyers con el copy horneado en el diseño sobre la foto del producto. Exporta JSON de Shopify y CSV de Meta Catalog, con streaming SSE en vivo, validación Zod estricta y modo demo determinista para desarrollar sin llaves API.”

## Licencia

MIT.
