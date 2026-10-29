import { STYLE_ARCHETYPES, type StyleArchetype } from "@/lib/flyer/style-engine";
import { z } from "zod";

/**
 * Ported from `agent.py`'s Pydantic models (SEOData, CatalogDraft) and extended
 * with the Meta-side shapes (ad variants, audiences, image slots) that AdForge
 * adds on top of the catalog contract.
 */

const text = z.string().trim().min(1).max(2000);
const hex = z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "hex color inválido");

export const localeSchema = z.enum(["es", "pt", "en"]);
export type Locale = z.infer<typeof localeSchema>;
/**
 * Placements que pide la campaña. El usuario los elige en la barra de
 * composición (ComposerBar: feed siempre, story por defecto, carrusel opt-in)
 * (feed siempre, story por defecto, carrusel opt-in) y el pipeline genera
 * cada uno en su formato NATIVO: feed y carrusel 4:5, story 9:16.
 */
export const placementSchema = z.enum(["feed", "story", "carousel"]);
export type Placement = z.infer<typeof placementSchema>;
export const placementsSchema = z.array(placementSchema).min(1).max(3);

export const seoDataSchema = z.strictObject({
  metaTitle: text.max(60),
  metaDescription: text.max(155),
  keywords: z.array(text.max(60)).min(1).max(5),
});
export type SeoData = z.infer<typeof seoDataSchema>;

/**
 * El Motor de Estilos Gráficos fija el arquetipo por POSICIÓN de variante
 * (V1 editorial-poster, V2 split-commerce, V3 bold-dark); el enum de
 * validación es el mismo literal que consume el render.
 */
export const styleArchetypeSchema = z.enum(STYLE_ARCHETYPES);
export type { StyleArchetype };

export const productListingSchema = z.strictObject({
  sku: text.max(64),
  standardizedTitle: text.max(120),
  shortPitch: text.max(180),
  bulletFeatures: z.array(text).min(1).max(6),
  categoryPath: text.max(160),
  seoMetadata: seoDataSchema,
  missingInformation: z.array(text).max(10).default([]),
});
export type ProductListing = z.infer<typeof productListingSchema>;

const imageUrl = z.string().trim().min(1).max(500);

export const feedVariantSchema = z.strictObject({
  /** Idea estratégica que diferencia esta dirección de la otra. */
  concept: text.max(60),
  /** Dirección visual específica que el generador de imagen debe ejecutar. */
  artDirection: text.max(800),
  /** Estructura compositiva del fallback local; no define el arte IA. */
  styleArchetype: styleArchetypeSchema,
  hook: text.max(40),
  body: text.max(125),
  cta: text.max(30),
  imageUrl,
  /** Beneficios cortos (<=3 palabras c/u) que el flyer muestra como "pills". */
  featurePills: z.array(text.max(28)).max(3).default([]),
  /** Copy del post adaptado por red: mismo asset 4:5, texto propio. */
  captionInstagram: text.max(280),
  captionFacebook: text.max(280),
});
export type FeedVariant = z.infer<typeof feedVariantSchema>;

/**
 * Copy corto de la story 9:16: solo titular + CTA, sin apoyo largo ni pills.
 * El arte se genera nativo vertical, no es el feed reencuadrado.
 */
export const storyCopySchema = z.strictObject({
  concept: text.max(60),
  artDirection: text.max(800),
  hook: text.max(40),
  cta: text.max(30),
});
export type StoryCopy = z.infer<typeof storyCopySchema>;

export const audienceSegmentSchema = z.strictObject({
  name: text.max(80),
  interests: z.array(text.max(60)).min(1).max(10),
  ageMin: z.number().int().min(13).max(65),
  ageMax: z.number().int().min(13).max(65),
  geo: z.array(text.max(60)).max(10).default([]),
});
export type AudienceSegment = z.infer<typeof audienceSegmentSchema>;

export const imageSlotSchema = z.enum([
  "original",
  "cutout",
  "studio-1",
  "studio-2",
  "studio-3",
]);

export const imageAssetSchema = z.strictObject({
  slot: imageSlotSchema,
  url: z.string().min(1),
  sourceModel: text,
});
export type ImageAsset = z.infer<typeof imageAssetSchema>;

/** Bounding box normalizado (0..1) del producto dentro de la foto cruda, tal
 * como lo devuelve la pasada de visión. El frontend lo usa como
 * `clip-path: inset(...)` para recortar la imagen real subida cuando no hay un
 * asset de cutout. */
export const segmentationSchema = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
});
export type Segmentation = z.infer<typeof segmentationSchema>;

/**
 * Datos de diseño extraídos de la foto por el modelo de visión (`muse-spark-1.3`):
 * la paleta REAL del producto y el arquetipo de estilo recomendado para el
 * anuncio. El Motor de Estilos los convierte en tema (papel, acento, degradé
 * del split, color de halo) para los 3 flyers.
 */
export const photoDesignSchema = z.strictObject({
  dominantColorHex: hex,
  secondaryColorHex: hex,
  styleArchetype: styleArchetypeSchema,
});
export type PhotoDesignData = z.infer<typeof photoDesignSchema>;

/** Textos para un flyer imprimible / story estática, generados junto al copy. */
export const flyerTextsSchema = z.strictObject({
  headline: text.max(80),
  subheadline: text.max(140),
  bullets: z.array(text).length(3),
});
export type FlyerTexts = z.infer<typeof flyerTextsSchema>;

/**
 * Decisión de fondo tomada por la pasada de visión: cuándo conviene un fondo
 * sólido / degradado simple y cuándo una escena lifestyle completa.
 * - `solid`: producto con textura o etiqueta compleja → plano de color pleno.
 * - `gradient`: producto neutro que necesita jerarquía sin escena.
 * - `scene`: el contexto de uso vende (comida, moda, hogar) → 3 planos.
 */
export const backgroundRecommendationSchema = z.strictObject({
  mode: z.enum(["solid", "gradient", "scene"]),
  colorHex: hex.nullable().default(null),
  reason: text.max(200),
});
export type BackgroundRecommendation = z.infer<typeof backgroundRecommendationSchema>;

export const creativeStrategySchema = z.strictObject({
  campaignIdea: text.max(160),
  audience: text.max(160),
  objective: text.max(120),
  visualWorld: text.max(600),
  carouselRecommended: z.boolean(),
  carouselReason: text.max(300),
});
export type CreativeStrategy = z.infer<typeof creativeStrategySchema>;

export const carouselSlideSchema = z.strictObject({
  stage: z.enum(["attention", "interest", "desire", "action"]),
  headline: text.max(120),
  body: text.max(200),
  cta: text.max(30),
});
export type CarouselSlide = z.infer<typeof carouselSlideSchema>;

/**
 * Configuración de un "fondo de estudio" que el cliente compone con Canvas
 * sobre la foto real del usuario. No es una URL: son tokens visuales (paleta,
 * luz, sombra, badge) para que el producto subido siempre sea el protagonista.
 */
export const studioSceneSchema = z.strictObject({
  name: text.max(40),
  background: z.array(hex).min(2).max(4),
  accent: hex,
  textColor: hex,
  lighting: z.enum(["radial-top", "vignette", "neon-rim", "soft-window", "spotlight"]),
  shadow: z.enum(["soft", "hard", "colored", "none"]),
  badge: text.max(24),
  vibe: text.max(60),
});
export type StudioScene = z.infer<typeof studioSceneSchema>;

export const visualIssueSchema = z.strictObject({
  category: z.enum(["product", "scene", "culture", "typography", "composition", "copy", "diversity", "privacy"]),
  severity: z.enum(["critical", "warning"]),
  description: text.max(300),
  suggestion: text.max(300),
  affectedIndices: z.array(z.number().int().min(1).max(3)).max(3),
});
/**
 * Checks estructurados de la revisión: la UI los muestra con badges en vez de
 * una caja negra. `dimensions` lo calcula el servidor (determinístico, desde
 * los píxeles reales); el resto los informa el revisor visual.
 */
export const reviewCheckSchema = z.strictObject({
  id: z.enum(["dimensions", "safe_zones", "fidelity", "coherence"]),
  passed: z.boolean(),
  detail: text.max(140),
});
export type ReviewCheck = z.infer<typeof reviewCheckSchema>;

export const visualReviewSchema = z.strictObject({
  status: z.enum(["reviewed", "needs_review", "unavailable", "not_generated"]),
  summary: text.max(350),
  issues: z.array(visualIssueSchema).max(8),
  retryCount: z.number().int().min(0).max(1),
  checks: z.array(reviewCheckSchema).max(4).default([]),
  /** Motivo del reintento (primer issue crítico) cuando hubo regeneración. */
  retryReason: text.max(300).nullable().default(null),
});
export type VisualReview = z.infer<typeof visualReviewSchema>;

export const stageNameSchema = z.enum(["sam", "museImage", "museSpark", "review"]);
export const stageEventSchema = z.strictObject({
  stage: stageNameSchema,
  status: z.enum(["running", "done", "error"]),
  ms: z.number().int().min(0).default(0),
});
export type StageEvent = z.infer<typeof stageEventSchema>;

export const pipelineTimingsSchema = z.strictObject({
  sam: z.number().int().min(0),
  museImage: z.number().int().min(0),
  museSpark: z.number().int().min(0),
  review: z.number().int().min(0),
  total: z.number().int().min(0),
});

export const campaignResultSchema = z.strictObject({
  mode: z.enum(["demo", "meta"]),
  model: z.string().nullable(),
  skuId: text,
  locale: localeSchema,
  placements: placementsSchema,
  carouselSlides: z.array(carouselSlideSchema).length(4).nullable().default(null),
  carouselImages: z.array(z.string().nullable()).length(4).nullable().default(null),
  carouselErrors: z.array(z.string().nullable()).length(4).nullable().default(null),
  creativeStrategy: creativeStrategySchema,
  planReview: z.strictObject({ status: z.enum(["reviewed", "unavailable"]), summary: text.max(350) }),
  copyReview: z.strictObject({ status: z.enum(["reviewed", "needs_review", "unavailable"]), summary: text.max(350) }).default({ status: "unavailable", summary: "Esta campaña no incluye revisión editorial automática." }),
  reviewRequired: z.literal(true),
  listing: productListingSchema,
  /** Dos direcciones creativas para feed 4:5 (sirve Instagram y Facebook). */
  feedVariants: z.array(feedVariantSchema).length(2),
  /** Copy de la story 9:16; `null` si el placement no se pidió. */
  story: storyCopySchema.nullable().default(null),
  audiences: z.array(audienceSegmentSchema).min(1).max(6),
  imageAssets: z.array(imageAssetSchema).min(2).max(8),
  segmentation: segmentationSchema,
  flyerTexts: flyerTextsSchema,
  /** Escenas del fallback local: [0] feed V1, [1] feed V2, [2] story. */
  studioScenes: z.array(studioSceneSchema).length(3),
  /** Paleta real + arquetipo recomendado, extraídos de la foto por visión. */
  designData: photoDesignSchema.nullable().default(null),
  /** Decisión de fondo (sólido vs escena) tomada por la visión. */
  background: backgroundRecommendationSchema.nullable().default(null),
  /** Cuántos productos trae la campaña (1 = individual, >1 = flyer conjunto). */
  productCount: z.number().int().min(1).max(4).default(1),
  /**
   * Arte 4:5 generado por el modelo de imagen para cada dirección de feed,
   * como data URL. `null` cuando la generación falló o no hay llave: el
   * cliente compone el flyer con Canvas como fallback.
   */
  feedImages: z.array(z.string().nullable()).length(2).default([null, null]),
  /**
   * Motivo por el que esa dirección NO tiene arte de IA (`null` cuando sí lo
   * tiene). Sin esto, una tarjeta generada por el compositor Canvas se ve igual
   * a una por cuota agotada: el usuario no puede distinguir "código roto" de
   * "falta billing". Se muestra en la UI al pasar por encima el badge LOCAL.
   */
  feedErrors: z.array(z.string().nullable()).length(2).default([null, null]),
  /** Arte 9:16 nativo de la story; `null` si no se pidió o falló. */
  storyImage: z.string().nullable().default(null),
  storyError: z.string().nullable().default(null),
  feedReviews: z.array(visualReviewSchema).length(2),
  storyReview: visualReviewSchema.nullable().default(null),
  /**
   * Dimensiones REALES medidas en píxeles del arte IA entregado (`null` si la
   * pieza es composición local o no se pudo medir). El export del cliente
   * normaliza a 1080x1350 (feed) / 1080x1920 (story) en todos los casos.
   */
  artworkDims: z.strictObject({
    feed: z.array(z.strictObject({ width: z.number().int().min(1), height: z.number().int().min(1) }).nullable()).length(2),
    story: z.strictObject({ width: z.number().int().min(1), height: z.number().int().min(1) }).nullable(),
  }),
  /** Datos comerciales opcionales que el merchant completa en la subida. */
  merchant: z.strictObject({
    price: text.max(64).nullable().default(null),
    link: text.max(500).nullable().default(null),
  }).default({ price: null, link: null }),
  /** Micro-línea legal cuando aplica (ej. alimento congelado + plato servido). */
  legalDisclaimer: text.max(80).nullable().default(null),
  /**
   * Afirmaciones permitidas extraídas del empaque (ej. "4 unidades",
   * "sin gluten"). El copy debe construirse SOLO con estas; el validador
   * determinístico bloquea lo que se salga del léxico prohibido.
   */
  allowedClaims: z.array(text.max(120)).max(8).default([]),
  carouselReviews: z.array(visualReviewSchema).length(4).nullable(),
  diversityReview: visualReviewSchema,
  timings: pipelineTimingsSchema,
  stageEvents: z.array(stageEventSchema).min(3),
});
export type CampaignResult = z.infer<typeof campaignResultSchema>;

/**
 * Shopify Admin API v2024-10 `product` shape, minimally populated so a merchant
 * can copy-paste it into the Product Importer. `variants` is intentionally
 * empty because pricing is not part of the campaign pipeline.
 */
export function toShopifyProduct(c: CampaignResult) {
  const bullets = c.listing.bulletFeatures
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join("");
  return {
    product: {
      title: c.listing.standardizedTitle,
      body_html: `<p>${escapeHtml(c.listing.shortPitch)}</p><ul>${bullets}</ul>`,
      vendor: "AdForge AI",
      product_type: c.listing.categoryPath,
      tags: c.listing.seoMetadata.keywords.join(", "),
      status: "draft",
      metafields_global_title_tag: c.listing.seoMetadata.metaTitle,
      metafields_global_description_tag: c.listing.seoMetadata.metaDescription,
      images: c.imageAssets
        .filter((i) => i.slot !== "original" && /^https?:\/\//.test(i.url))
        .map((i, idx) => ({ src: i.url, alt: `${c.listing.standardizedTitle} ${idx + 1}` })),
      options: [],
      variants: [],
      _adforge: {
        sku_id: c.skuId,
        mode: c.mode,
        locale: c.locale,
        review_required: c.reviewRequired,
      },
    },
  };
}

/**
 * Meta Commerce Manager product-feed CSV. Column names match the official
 * schema (id, title, description, image_link, availability, condition, brand,
 * google_product_category) so it drops straight into Bulk Upload.
 */
export function toMetaCatalogFeed(c: CampaignResult) {
  const headers = [
    "id",
    "title",
    "description",
    "image_link",
    "availability",
    "condition",
    "brand",
    "product_type",
    "google_product_category",
    "price",
    "link",
  ];
  const heroByAd = c.feedVariants.map((v, i) => {
    const studio = c.imageAssets.find((img) => img.slot === `studio-${i + 1}`);
    const imageLink = studio && /^https?:\/\//.test(studio.url) ? studio.url : "";
    return [
      `${c.skuId}-v${i + 1}`,
      v.hook,
      v.body,
      imageLink,
      "in stock",
      "new",
      "AdForge AI",
      c.listing.categoryPath,
      c.listing.categoryPath,
      c.merchant.price ?? "",
      c.merchant.link ?? "",
    ];
  });
  const rows = [headers, ...heroByAd];
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
