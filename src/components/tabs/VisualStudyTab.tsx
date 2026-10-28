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
  cutoutMode,
}: {
  result: CampaignResult | null;
  previewUrl: string | null;
  cutoutMode: CutoutMode;
}) {
  if (!result) {
    return (
      <div className="hatch flex h-[360px] items-center justify-center rounded-lg border border-night-rule">
        <p className="text-sm text-paper-muted">Sube una foto para ver los flyers con tu producto real.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-3 rounded-lg border border-night-rule bg-night-panel p-3">
        <div className="hatch h-20 w-20 shrink-0 overflow-hidden rounded-md border border-night-rule">
          {previewUrl ? (
            <img src={previewUrl} alt="Foto cruda" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageOff className="h-5 w-5 text-paper-muted" />
            </div>
          )}
        </div>
        <div>
          <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-paper-muted">
            <Images className="h-3.5 w-3.5 text-mint" />
            Una campaña para tu producto
          </h3>
          <p className="mt-1 text-xs text-paper-dim">
            Cada propuesta incluye su adaptación a historia. Las imágenes IA usan tu foto como referencia y pueden modificar etiquetas o detalles: revísalos antes de publicar.
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
          <span className="text-sm text-paper-dim">{result.creativeStrategy.campaignIdea} · {result.creativeStrategy.audience}</span>
        </section>
      )}

      <div className="rounded-lg border border-night-rule px-3 py-2 text-xs leading-relaxed text-paper-dim">
        Plan creativo {result.planReview.status === "reviewed" ? "revisado" : "sin revisión automática"} · {result.planReview.summary}
      </div>

      <ReviewNotes review={result.diversityReview} title="Comparación de las tres piezas" />

      <section>
        <h3 className="mb-3 text-sm font-semibold text-paper">Piezas de campaña · post e historia</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {result.adVariants.map((v, i) => (
            <FlyerCard
              key={`${v.platform}-${i}`}
              ad={v}
              scene={result.studioScenes[i]}
              flyerTexts={result.flyerTexts}
              result={result}
              previewUrl={previewUrl}
              posterUrl={result.posterImages[i]}
              index={i}
              cutoutMode={cutoutMode}
            />
          ))}
        </div>
      </section>
      {result.carouselSlides && <section className="space-y-3">
        <div><h3 className="text-sm font-semibold text-paper">Carrusel recomendado</h3><p className="mt-1 text-xs text-paper-muted">{result.creativeStrategy.carouselReason} Revisá la fidelidad de las imágenes y el copy antes de publicar.</p></div>
        <CarouselPreview result={result} photoUrl={previewUrl} />
      </section>}
    </div>
  );
}
