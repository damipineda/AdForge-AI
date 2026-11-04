"use client";

import { ImageOff, Images } from "lucide-react";
import type { CampaignResult } from "@/lib/schema/campaign";
import type { CutoutMode } from "@/lib/flyer/photo";
import { FlyerCard } from "../flyer/FlyerCard";
import { CarouselPreview } from "../flyer/CarouselPreview";
import { ReviewNotes } from "../flyer/ReviewNotes";
import type { PiecePlacement } from "@/lib/pipeline/refine-piece";
import { useI18n } from "@/lib/i18n";

export function VisualStudyTab({
  result,
  previewUrl,
  previewUrls,
  cutoutMode,
  onRefinePiece,
  logoUrl,
  logoPosition,
}: {
  result: CampaignResult | null;
  previewUrl: string | null;
  previewUrls?: string[];
  cutoutMode: CutoutMode;
  onRefinePiece?: (placement: PiecePlacement, instruction: string, mode?: "refine" | "regenerate") => Promise<void>;
  logoUrl?: string | null;
  logoPosition?: "auto" | "left" | "right" | null;
}) {
  const { t } = useI18n();

  if (!result) {
    return (
      <div className="hatch flex h-[360px] items-center justify-center rounded-lg border border-night-rule">
        <p className="text-sm text-paper-muted">{t.visualStudy.empty}</p>
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
              // Product uploads can be local blob URLs; preserve their native preview.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={u}
                alt={t.composer.productAlt(i + 1)}
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
            {result.productCount > 1 ? t.visualStudy.groupHeader(result.productCount) : t.visualStudy.singleHeader}
          </h3>
          <p className="mt-1 text-xs text-paper-dim">
            {t.visualStudy.headerDesc}
          </p>
        </div>
      </section>

      {result.designData && (
        <section className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-night-rule bg-night-panel p-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">
            {t.visualStudy.designDna}
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
              {t.visualStudy.bgLabel} {bg.mode === "solid" ? t.visualStudy.bgSolid : bg.mode === "gradient" ? t.visualStudy.bgGradient : t.visualStudy.bgScene}
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
          {t.visualStudy.bgDecision} <strong className="text-paper">{bg.mode === "solid" ? t.visualStudy.bgSolidLong : bg.mode === "gradient" ? t.visualStudy.bgGradientLong : t.visualStudy.bgSceneLong}</strong> — {bg.reason}
        </p>
      )}

      <div className="rounded-lg border border-night-rule px-3 py-2 text-xs leading-relaxed text-paper-dim">
        {t.visualStudy.creativePlan} {result.planReview.status === "reviewed" ? t.visualStudy.reviewed : t.visualStudy.noAutoReview} · {result.planReview.summary}
      </div>
      <div className="rounded-lg border border-night-rule px-3 py-2 text-xs leading-relaxed text-paper-dim">
        {t.visualStudy.copyLabel} {result.copyReview.status === "reviewed" ? t.visualStudy.reviewed : result.copyReview.status === "needs_review" ? t.visualStudy.needsReview : t.visualStudy.noAutoReview} · {result.copyReview.summary}
      </div>

      <ReviewNotes review={result.diversityReview} title={t.visualStudy.pieceComparison} />

      {result.refinements.length > 0 && (
        <details className="rounded-lg border border-night-rule p-3 text-xs text-paper-dim">
          <summary className="cursor-pointer">{t.visualStudy.versionHistory} · {result.refinements.length}</summary>
          <ul className="mt-2 space-y-3">
            {result.refinements.slice().reverse().map((item) => (
              <li key={item.id} className="space-y-1">
                {item.placement} · {item.mode === "regenerate" ? t.visualStudy.newComposition : t.visualStudy.refinement}
                {item.draft ? t.visualStudy.draftWithNotes : ""}
                <p>{item.instruction}</p>
                <p className="text-paper-muted">{item.review.summary}</p>
                <div className="flex gap-4">
                  {item.beforeUrl && (
                    <a className="text-mint underline" href={item.beforeUrl} target="_blank" rel="noreferrer">
                      {t.visualStudy.viewPrev}
                    </a>
                  )}
                  <a className="text-mint underline" href={item.afterUrl} target="_blank" rel="noreferrer">
                    {t.visualStudy.viewNew}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-paper">{t.visualStudy.piecesHeader}</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {result.feedVariants.map((v, i) => (
            <FlyerCard
              key={`feed-${i}-${result.skuId}-${result.timings.total}`}
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
              previewUrls={urls}
              posterUrl={result.feedImages[i]}
              fallbackReason={result.feedErrors[i]}
              review={result.feedReviews[i]}
              cutoutMode={cutoutMode}
              legacyLayers={Boolean(v.layoutLayers)}
              onRefine={onRefinePiece ? (instruction, mode) => onRefinePiece(i === 0 ? "feed-0" : "feed-1", instruction, mode) : undefined}
              logoUrl={logoUrl}
              logoPosition={logoPosition}
            />
          ))}
          {result.story && (
            <FlyerCard
              key={`story-${result.skuId}-${result.timings.total}`}
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
              previewUrls={urls}
              posterUrl={result.storyImage}
              fallbackReason={result.storyError}
              review={result.storyReview}
              story
              cutoutMode={cutoutMode}
              legacyLayers={Boolean(result.story.layoutLayers)}
              onRefine={onRefinePiece ? (instruction, mode) => onRefinePiece("story", instruction, mode) : undefined}
              logoUrl={logoUrl}
              logoPosition={logoPosition}
            />
          )}
        </div>
      </section>
      {result.carouselSlides && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-paper">{t.visualStudy.carouselHeader}</h3>
            <p className="mt-1 text-xs text-paper-muted">{result.creativeStrategy.carouselReason} {t.visualStudy.carouselVerifyNote}</p>
          </div>
          <CarouselPreview result={result} photoUrl={previewUrl} />
        </section>
      )}
      {!result.carouselSlides && result.creativeStrategy.carouselRecommended && (
        <p className="rounded-lg border border-night-rule px-3 py-2 text-xs leading-relaxed text-paper-dim">
          {t.visualStudy.carouselRecommendedPrefix} {result.creativeStrategy.carouselReason} {t.visualStudy.carouselRecommendedSuffix}
        </p>
      )}
    </div>
  );
}
