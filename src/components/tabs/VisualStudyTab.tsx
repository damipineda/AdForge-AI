"use client";

import { ImageOff, Images } from "lucide-react";
import type { CampaignResult } from "@/lib/schema/campaign";
import type { CutoutMode } from "@/lib/flyer/photo";
import { FlyerCard } from "../flyer/FlyerCard";
import { CarouselPreview } from "../flyer/CarouselPreview";
import { ReviewNotes } from "../flyer/ReviewNotes";

export function VisualStudyTab({
  result,
  previewUrl,
  previewUrls,
  cutoutMode,
}: {
  result: CampaignResult | null;
  previewUrl: string | null;
  previewUrls?: string[];
  cutoutMode: CutoutMode;
}) {
  if (!result) {
    return (
      <div className="hatch flex h-[360px] items-center justify-center rounded-lg border border-night-rule">
        <p className="text-sm text-paper-muted">Subí fotos para ver los flyers con tus productos reales.</p>
      </div>
    );
  }

  const urls = previewUrls?.length ? previewUrls : previewUrl ? [previewUrl] : [];
  const benefit = result.flyerTexts.bullets[0] ?? result.listing.shortPitch;
  const bg = result.background;

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-3 rounded-lg border border-night-rule bg-night-panel p-3">
        <div className="flex shrink-0 -space-x-3">
          {urls.length > 0 ? (
            urls.slice(0, 4).map((u, i) => (
              <img
                key={i}
                src={u}
                alt={`Foto ${i + 1}`}
                className="h-20 w-20 rounded-md border-2 border-night-panel object-cover"
              />
            ))
          ) : (
            <div className="hatch flex h-20 w-20 items-center justify-center rounded-md border border-night-rule">
              <ImageOff className="h-5 w-5 text-paper-muted" />
            </div>
          )}
        </div>
        <div>
          <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-paper-muted">
            <Images className="h-3.5 w-3.5 text-mint" />
            {result.productCount > 1 ? `Flyer conjunto · ${result.productCount} productos` : "Una campaña para tu producto"}
          </h3>
          <p className="mt-1 text-xs text-paper-dim">
            Cada pieza se genera en su formato nativo con copy propio. Las imágenes IA usan tus fotos como referencia y pueden modificar etiquetas o detalles: revísalos antes de publicar.
          </p>
        </div>
      </section>

      {result.designData && (
        <section className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-night-rule bg-night-panel p-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">
            DNA de diseño · Muse Spark
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-paper-dim">
            <span
              className="h-3.5 w-3.5 rounded-full border border-night-rule-strong"
              style={{ backgroundColor: result.designData.dominantColorHex }}
            />
            {result.designData.dominantColorHex}
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-paper-dim">
            <span
              className="h-3.5 w-3.5 rounded-full border border-night-rule-strong"
              style={{ backgroundColor: result.designData.secondaryColorHex }}
            />
            {result.designData.secondaryColorHex}
          </span>
          {bg && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-night-rule-strong bg-night px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-paper-dim" title={bg.reason}>
              Fondo: {bg.mode === "solid" ? "sólido" : bg.mode === "gradient" ? "degradado" : "escena"}
              {bg.mode === "solid" && bg.colorHex && (
                <span className="h-3 w-3 rounded-full border border-night-rule-strong" style={{ backgroundColor: bg.colorHex }} />
              )}
            </span>
          )}
          <span className="text-sm text-paper-dim">{result.creativeStrategy.campaignIdea} · {result.creativeStrategy.audience}</span>
        </section>
      )}
      {bg && (
        <p className="rounded-lg border border-night-rule px-3 py-2 text-xs leading-relaxed text-paper-dim">
          Decisión de fondo: <strong className="text-paper">{bg.mode === "solid" ? "plano sólido" : bg.mode === "gradient" ? "degradado simple" : "escena lifestyle"}</strong> — {bg.reason}
        </p>
      )}

      <div className="rounded-lg border border-night-rule px-3 py-2 text-xs leading-relaxed text-paper-dim">
        Plan creativo {result.planReview.status === "reviewed" ? "revisado" : "sin revisión automática"} · {result.planReview.summary}
      </div>
      <div className="rounded-lg border border-night-rule px-3 py-2 text-xs leading-relaxed text-paper-dim">
        Copy {result.copyReview.status === "reviewed" ? "revisado" : result.copyReview.status === "needs_review" ? "requiere revisión" : "sin revisión automática"} · {result.copyReview.summary}
      </div>

      <ReviewNotes review={result.diversityReview} title="Comparación de las piezas" />

      <section>
        <h3 className="mb-3 text-sm font-semibold text-paper">Piezas de campaña · feed y story</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {result.feedVariants.map((v, i) => (
            <FlyerCard
              key={`feed-${i}`}
              kicker={`FEED 4:5 · V${i + 1}`}
              filename={`${result.skuId}-feed-V${i + 1}.png`}
              concept={v.concept}
              hook={v.hook}
              body={v.body}
              cta={v.cta}
              benefit={benefit}
              featurePills={v.featurePills}
              scene={result.studioScenes[i]}
              styleArchetype={v.styleArchetype}
              segmentation={result.segmentation}
              designData={result.designData}
              previewUrl={previewUrl}
              posterUrl={result.feedImages[i]}
              fallbackReason={result.feedErrors[i]}
              review={result.feedReviews[i]}
              cutoutMode={cutoutMode}
            />
          ))}
          {result.story && (
            <FlyerCard
              key="story"
              kicker="STORY 9:16"
              filename={`${result.skuId}-story.png`}
              concept={result.story.concept}
              hook={result.story.hook}
              body={null}
              cta={result.story.cta}
              benefit={result.listing.shortPitch}
              featurePills={[]}
              scene={result.studioScenes[2]}
              styleArchetype={result.designData?.styleArchetype ?? "bold-dark"}
              segmentation={result.segmentation}
              designData={result.designData}
              previewUrl={previewUrl}
              posterUrl={result.storyImage}
              fallbackReason={result.storyError}
              review={result.storyReview}
              story
              cutoutMode={cutoutMode}
            />
          )}
        </div>
      </section>
      {result.carouselSlides && <section className="space-y-3">
        <div><h3 className="text-sm font-semibold text-paper">Carrusel 4:5</h3><p className="mt-1 text-xs text-paper-muted">{result.creativeStrategy.carouselReason} Revisá la fidelidad de las imágenes y el copy antes de publicar.</p></div>
        <CarouselPreview result={result} photoUrl={previewUrl} />
      </section>}
      {!result.carouselSlides && result.creativeStrategy.carouselRecommended && (
        <p className="rounded-lg border border-night-rule px-3 py-2 text-xs leading-relaxed text-paper-dim">
          El modelo recomienda un carrusel para este producto: {result.creativeStrategy.carouselReason} Volvé a generar con el placement activado si lo querés.
        </p>
      )}
    </div>
  );
}
