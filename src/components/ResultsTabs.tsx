"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Braces, Images, Megaphone } from "lucide-react";
import type { CampaignResult } from "@/lib/schema/campaign";
import type { CutoutMode } from "@/lib/flyer/photo";
import { VisualStudyTab } from "./tabs/VisualStudyTab";
import { MetaAdsTab } from "./tabs/MetaAdsTab";
import { StorefrontJsonTab } from "./tabs/StorefrontJsonTab";
import type { PiecePlacement } from "@/lib/pipeline/refine-piece";
import { useI18n } from "@/lib/i18n";

type TabId = "visual" | "ads" | "json";

export function ResultsTabs({
  result,
  previewUrls,
  previewUrl,
  onRefinePiece,
  logoUrl,
  logoPosition,
}: {
  result: CampaignResult | null;
  previewUrls?: string[];
  previewUrl?: string | null;
  onRefinePiece?: (placement: PiecePlacement, instruction: string, mode?: "refine" | "regenerate") => Promise<void>;
  logoUrl?: string | null;
  logoPosition?: "auto" | "left" | "right" | null;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>("visual");
  const [cutoutMode, setCutoutMode] = useState<CutoutMode>("auto");

  const tabs: Array<{ id: TabId; label: string; Icon: typeof Images }> = [
    { id: "visual", label: t.resultsTabs.visual, Icon: Images },
    { id: "ads", label: t.resultsTabs.ads, Icon: Megaphone },
    { id: "json", label: t.resultsTabs.json, Icon: Braces },
  ];

  const cutoutModes: Array<{ id: CutoutMode; label: string }> = [
    { id: "auto", label: t.resultsTabs.cutoutAuto },
    { id: "circle", label: t.resultsTabs.cutoutCircle },
    { id: "float", label: t.resultsTabs.cutoutFloat },
  ];

  const urls = previewUrls ?? (previewUrl ? [previewUrl] : []);
  const firstUrl = urls[0] ?? null;

  return (
    <div className="flex h-full flex-col rounded-xl border border-night-rule bg-night-panel">
      <nav className="flex gap-1 border-b border-night-rule p-1">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 font-mono text-[11px] uppercase tracking-widest transition-colors",
              tab === id
                ? "bg-mint-soft text-mint"
                : "text-paper-muted hover:bg-night hover:text-paper",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
      {result && tab !== "json" && [...result.feedImages, result.storyImage].some((p) => !p) && (
        <div className="flex items-center justify-between gap-3 border-b border-night-rule px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">
            {t.resultsTabs.cutoutHeader}
          </span>
          <div className="inline-flex rounded-md border border-night-rule bg-night p-0.5">
            {cutoutModes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setCutoutMode(m.id)}
                className={clsx(
                  "rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  cutoutMode === m.id ? "bg-mint text-ink" : "text-paper-muted hover:text-paper",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto p-5">
        <div hidden={tab !== "visual"}>
          <VisualStudyTab
            result={result}
            previewUrl={firstUrl}
            previewUrls={urls}
            cutoutMode={cutoutMode}
            onRefinePiece={onRefinePiece}
            logoUrl={logoUrl}
            logoPosition={logoPosition}
          />
        </div>
        {tab === "ads" && <MetaAdsTab result={result} previewUrl={firstUrl} cutoutMode={cutoutMode} />}
        {tab === "json" && <StorefrontJsonTab result={result} />}
      </div>
    </div>
  );
}
