import { createHash } from "node:crypto";
import {
  campaignResultSchema,
  type CampaignResult,
  type ImageAsset,
  type Locale,
  type Placement,
  type StageEvent,
} from "@/lib/schema/campaign";
import { runSam, type SamInput } from "./sam-segmentation";
import { runMuseImage, type MuseImageInput } from "./muse-image";
import { reviewCampaign } from "./visual-review";
import { reviewCreativePlan } from "./creative-plan";
import { reviewCampaignCopy } from "./copy-review";
import { runMuseSpark } from "./muse-spark";
import { bufferToBase64 } from "./image";
import { demoBundles } from "./demo-fixtures";
import { getProvider, MODEL_LABELS } from "./provider";

export type { Provider } from "./provider";
export { getProvider, toMetaTargeting } from "./provider";

export type PipelineInput = {
  /** 1 a 4 fotos de producto. Con >1 se analiza cada una y se agrupa en un
   * flyer conjunto cuando `groupMode` es true. */
  images: SamInput[];
  /** Compat: un solo `image` equivale a `images: [image]`. */
  image?: SamInput;
  locale: Locale;
  placements: Placement[];
  merchant: { price: string | null; link: string | null };
  /** Agrupar varios productos en un mismo flyer (default true con >1 foto). */
  groupMode?: boolean;
};

export type PipelineHandlers = {
  onStage: (event: StageEvent) => void;
};

/**
 * Orquesta la pasada de visión -> Muse Spark -> Muse Image emitiendo eventos de
 * stage en cada transición (running/done) para que el route handler los
 * reenvíe como SSE. El copy se escribe antes que las piezas porque Muse Image
 * integra el hook real en el diseño. Cada etapa se despacha según el provider:
 * `demo` usa fixtures locales y `meta` llama al Meta Model API.
 */
export async function runPipeline(
  input: PipelineInput,
  handlers: PipelineHandlers,
): Promise<CampaignResult> {
  const provider = getProvider();
  const startedAt = Date.now();
  const events: StageEvent[] = [];

  const emit = (stage: StageEvent["stage"], status: StageEvent["status"], ms = 0) => {
    const event: StageEvent = { stage, status, ms };
    events.push(event);
    handlers.onStage(event);
  };

  const images = (input.images?.length ? input.images : input.image ? [input.image] : []).slice(0, 4);
  if (images.length === 0) throw new Error("Falta al menos una imagen de producto.");
  const groupMode = input.groupMode ?? images.length > 1;
  const productCount = images.length;

  const samStart = Date.now();
  emit("sam", "running");
  const sams = [];
  for (const img of images) {
    sams.push(await runSam(img, provider));
  }
  const samMs = Date.now() - samStart;
  emit("sam", "done", samMs);

  const sam = sams[0];
  // Descripción conjunta: cada producto numerado para que el copy los agrupe
  // sin mezclar atributos ("Producto 1: ... / Producto 2: ...").
  const productDescription = sams
    .map((s, i) => (productCount > 1 ? `Producto ${i + 1}: ${s.productDescription}` : s.productDescription))
    .join("\n");
  // Fondo del conjunto: POR DEFECTO escena. El sólido solo gana por
  // UNANIMIDAD (todas las fotos lo piden con choque explícito); basta que
  // una foto pida escena para mantener el entorno fotográfico de estudio y
  // no destruirlo con un plano que hace ver los productos pegados.
  const background = pickBackground(sams.map((s) => s.background));
  const designData = sam.designData;

  // Skill aprendido: reglas activas para esta categoría (puede variar).
  // Se inyectan en copy, imagen y revisión; con DB vacía es [] y no hay ruido.
  const { classifyCategory } = await import("@/lib/store/learning");
  const { getActiveRuleTexts } = await import("@/lib/store/db");
  const learnedRules = getActiveRuleTexts(classifyCategory(productDescription));

  // El copy se escribe ANTES que las piezas: Muse Image integra el hook real
  // de cada dirección en el diseño, así que necesita los textos ya listos.
  const sparkStart = Date.now();
  emit("museSpark", "running");
  const spark = await runMuseSpark(
    {
      locale: input.locale,
      productDescription,
      designData,
      placements: input.placements,
      merchantLink: input.merchant.link,
      productCount,
      groupMode,
      background,
      learnedRules,
    },
    provider,
  );
  const editedCopy = await reviewCampaignCopy({ product: productDescription, locale: input.locale, claims: spark.allowedClaims, strategy: spark.creativeStrategy, feed: spark.feedVariants, story: spark.story, merchantLink: input.merchant.link, legalDisclaimer: spark.legalDisclaimer }, provider);
  spark.feedVariants = editedCopy.feed;
  spark.story = editedCopy.story;
  const planned = await reviewCreativePlan({ product: productDescription, locale: input.locale, strategy: spark.creativeStrategy, feed: spark.feedVariants, story: spark.story }, provider);
  spark.feedVariants = planned.feed;
  spark.story = planned.story;
  const sparkMs = Date.now() - sparkStart;
  emit("museSpark", "done", sparkMs);

  const imageStart = Date.now();
  emit("museImage", "running");
  const imageInput: MuseImageInput = {
      locale: input.locale,
      productDescription,
      designData,
      photo: { base64: bufferToBase64(images[0].bytes), mimeType: images[0].mimeType },
      feed: spark.feedVariants.map((v) => ({
        hook: v.hook,
        body: v.body,
        cta: v.cta,
        concept: v.concept,
        artDirection: v.artDirection,
        pills: v.featurePills,
        captionInstagram: v.captionInstagram,
        captionFacebook: v.captionFacebook,
      })) as MuseImageInput["feed"],
      story: spark.story ? { hook: spark.story.hook, cta: spark.story.cta, concept: spark.story.concept, artDirection: spark.story.artDirection } : null,
      creativeStrategy: spark.creativeStrategy,
      carouselSlides: input.placements.includes("carousel") ? spark.carouselSlides : null,
      productCount,
      groupMode,
      background,
      learnedRules,
    };
  const initialImage = await runMuseImage(imageInput, provider);
  const imageMs = Date.now() - imageStart;
  emit("museImage", "done", imageMs);

  const reviewStart = Date.now();
  emit("review", "running");
  const quality = await reviewCampaign(imageInput, initialImage, provider);
  const captionFeedback = quality.feedReviews.flatMap((review) => review.issues.filter((issue) => /^DESCRIPCI[ÓO]N:/i.test(issue.description)).map((issue) => `${issue.description} ${issue.suggestion}`));
  let finalCopyReview = editedCopy.copyReview;
  if (provider === "meta" && captionFeedback.length > 0) {
    const artworks = quality.image.feed.map((url) => {
      const match = url?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
      return match ? { mimeType: match[1], base64: match[2] } : null;
    });
    if (artworks.every((artwork) => artwork !== null)) {
      const corrected = await reviewCampaignCopy({ product: productDescription, locale: input.locale, claims: spark.allowedClaims, strategy: spark.creativeStrategy, feed: spark.feedVariants, story: spark.story, merchantLink: input.merchant.link, legalDisclaimer: spark.legalDisclaimer, artworks: artworks as Array<{ mimeType: string; base64: string }>, feedback: captionFeedback, captionsOnly: true }, provider);
      spark.feedVariants = corrected.feed;
      finalCopyReview = corrected.copyReview;
    }
  }
  const reviewMs = Date.now() - reviewStart;
  emit("review", "done", reviewMs);
  const image = quality.image;

  const studioSlots = ["studio-1", "studio-2", "studio-3"] as const;
  const imageAssets: ImageAsset[] = [
    ...(sam.cutout ? [sam.cutout] : []),
    ...image.scenes.map((scene, i) => ({
      slot: studioSlots[i],
      url: `canvas://studio-${i + 1}`,
      sourceModel: scene.name,
    })),
  ];

  const result: CampaignResult = {
    mode: provider,
    model: provider === "demo" ? null : MODEL_LABELS[provider],
    skuId: provider === "demo" ? demoBundles[input.locale].skuId : liveSkuId(combinedBytes(images.map((i) => i.bytes))),
    locale: input.locale,
    placements: input.placements,
    creativeStrategy: spark.creativeStrategy,
    planReview: planned.planReview,
    copyReview: finalCopyReview,
    carouselSlides: input.placements.includes("carousel") ? spark.carouselSlides : null,
    carouselImages: image.carouselImages,
    carouselErrors: image.carouselErrors,
    reviewRequired: true,
    listing: spark.listing,
    feedVariants: spark.feedVariants,
    story: spark.story,
    audiences: spark.audiences,
    imageAssets,
    segmentation: sam.segmentation,
    designData,
    background,
    productCount,
    flyerTexts: spark.flyerTexts,
    studioScenes: image.scenes,
    feedImages: image.feed,
    feedErrors: image.feedErrors,
    storyImage: image.storyImage,
    storyError: image.storyError,
    feedReviews: quality.feedReviews,
    storyReview: quality.storyReview,
    artworkDims: quality.artworkDims,
    merchant: input.merchant,
    legalDisclaimer: spark.legalDisclaimer,
    allowedClaims: spark.allowedClaims,
    carouselReviews: quality.carouselReviews,
    diversityReview: quality.diversityReview,
    timings: {
      sam: samMs,
      museImage: imageMs,
      museSpark: sparkMs,
      review: reviewMs,
      total: Date.now() - startedAt,
    },
    stageEvents: events,
  };

  return campaignResultSchema.parse(result);
}

function liveSkuId(bytes: ArrayBuffer): string {
  const fingerprint = createHash("sha256")
    .update(new Uint8Array(bytes))
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  return `AFG-${fingerprint}`;
}

function combinedBytes(parts: ArrayBuffer[]): ArrayBuffer {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), offset);
    offset += p.byteLength;
  }
  return out.buffer;
}

function pickBackground(items: Array<{ mode: "solid" | "gradient" | "scene"; colorHex: string | null; reason: string }>) {
  if (items.length === 0) return { mode: "scene" as const, colorHex: null, reason: "Escena completa por defecto." };
  // Bundle: el sólido exige unanimidad; con una sola escena, la escena gana.
  if (items.length > 1 && !items.every((b) => b.mode === "solid")) {
    const scene = items.find((b) => b.mode === "scene");
    if (scene) return scene;
    const gradient = items.find((b) => b.mode === "gradient");
    if (gradient) return gradient;
  }
  const solid = items.find((b) => b.mode === "solid");
  if (solid) return solid;
  const gradient = items.find((b) => b.mode === "gradient");
  if (gradient) return gradient;
  return items[0] ?? { mode: "scene" as const, colorHex: null, reason: "Escena completa por defecto." };
}
