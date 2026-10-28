"use client";

import type { CampaignResult } from "@/lib/schema/campaign";
import type { CutoutMode } from "@/lib/flyer/photo";
import { FlyerCard } from "../flyer/FlyerCard";

export function MetaAdsTab({
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
        <p className="text-sm text-paper-muted">Las 3 variantes de anuncio aparecen acá.</p>
      </div>
    );
  }
  return (
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
  );
}
