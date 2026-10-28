import { createHash } from "node:crypto";
import {
  campaignResultSchema,
  type CampaignResult,
  type CampaignFormat,
  type ImageAsset,
  type Locale,
  type StageEvent,
} from "@/lib/schema/campaign";
import { runSam, type SamInput } from "./sam-segmentation";
import { runMuseImage, type MuseImageInput } from "./muse-image";
import { reviewCampaign } from "./visual-review";
import { reviewCreativePlan } from "./creative-plan";
import { runMuseSpark } from "./muse-spark";
import { bufferToBase64 } from "./image";
import { demoBundles } from "./demo-fixtures";
import { getProvider, MODEL_LABELS } from "./provider";

export type { Provider } from "./provider";
export { getProvider, toMetaTargeting } from "./provider";

export type PipelineInput = {
  image: SamInput;
  locale: Locale;
  format: CampaignFormat;
};

export type PipelineHandlers = {
  onStage: (event: StageEvent) => void;
};

/**
 * Orquesta la pasada de visión -> Muse Spark -> Muse Image emitiendo eventos de
 * stage en cada transición (running/done) para que el route handler los
 * reenvíe como SSE. El copy se escribe antes que los pósters porque Muse Image
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

  const samStart = Date.now();
  emit("sam", "running");
  const sam = await runSam(input.image, provider);
  const samMs = Date.now() - samStart;
  emit("sam", "done", samMs);

  // El copy se escribe ANTES que los pósters: Muse Image integra el hook real
  // de cada variante en el diseño, así que necesita los textos ya listos.
  const sparkStart = Date.now();
  emit("museSpark", "running");
  const spark = await runMuseSpark(
    {
      locale: input.locale,
      productDescription: sam.productDescription,
      designData: sam.designData,
    },
    provider,
  );
  const planned = await reviewCreativePlan({ product: sam.productDescription, locale: input.locale, strategy: spark.creativeStrategy, variants: spark.adVariants }, provider);
  spark.adVariants = planned.variants;
  const sparkMs = Date.now() - sparkStart;
  emit("museSpark", "done", sparkMs);

  const imageStart = Date.now();
  emit("museImage", "running");
  const imageInput: MuseImageInput = {
      locale: input.locale,
      format: input.format,
      productDescription: sam.productDescription,
      designData: sam.designData,
      photo: { base64: bufferToBase64(input.image.bytes), mimeType: input.image.mimeType },
      hooks: tuple3(spark.adVariants.map((v) => v.hook), ""),
      bodies: tuple3(spark.adVariants.map((v) => v.body), ""),
      ctas: tuple3(spark.adVariants.map((v) => v.cta), ""),
      concepts: tuple3(spark.adVariants.map((v) => v.concept), ""),
      artDirections: tuple3(spark.adVariants.map((v) => v.artDirection), ""),
      pills: tuple3(spark.adVariants.map((v) => v.featurePills), [] as string[]),
      creativeStrategy: spark.creativeStrategy,
      carouselSlides: input.format === "carousel" || spark.creativeStrategy.carouselRecommended ? spark.carouselSlides : null,
    };
  const initialImage = await runMuseImage(imageInput, provider);
  const imageMs = Date.now() - imageStart;
  emit("museImage", "done", imageMs);

  const reviewStart = Date.now();
  emit("review", "running");
  const quality = await reviewCampaign(imageInput, initialImage, provider);
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
    skuId: provider === "demo" ? demoBundles[input.locale].skuId : liveSkuId(input.image.bytes),
    locale: input.locale,
    format: input.format,
    creativeStrategy: spark.creativeStrategy,
    planReview: planned.planReview,
    carouselSlides: input.format === "carousel" || spark.creativeStrategy.carouselRecommended ? spark.carouselSlides : null,
    carouselImages: image.carouselImages,
    carouselErrors: image.carouselErrors,
    reviewRequired: true,
    listing: spark.listing,
    adVariants: spark.adVariants,
    audiences: spark.audiences,
    imageAssets,
    segmentation: sam.segmentation,
    designData: sam.designData,
    flyerTexts: spark.flyerTexts,
    studioScenes: image.scenes,
    posterImages: image.posters,
    posterErrors: image.errors,
    visualReviews: quality.visualReviews,
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

function tuple3<T>(list: T[], fallback: T): [T, T, T] {
  const padded = [...list];
  while (padded.length < 3) padded.push(fallback);
  return [padded[0], padded[1], padded[2]];
}

function liveSkuId(bytes: ArrayBuffer): string {
  const fingerprint = createHash("sha256")
    .update(new Uint8Array(bytes))
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  return `AFG-${fingerprint}`;
}
