"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Braces, Images, Megaphone } from "lucide-react";
import type { CampaignResult } from "@/lib/schema/campaign";
import type { CutoutMode } from "@/lib/flyer/photo";
import { VisualStudyTab } from "./tabs/VisualStudyTab";
import { MetaAdsTab } from "./tabs/MetaAdsTab";
import { StorefrontJsonTab } from "./tabs/StorefrontJsonTab";

type TabId = "visual" | "ads" | "json";

const TABS: Array<{ id: TabId; label: string; Icon: typeof Images }> = [
  { id: "visual", label: "Estudio Visual", Icon: Images },
  { id: "ads", label: "Meta Ads Copy", Icon: Megaphone },
  { id: "json", label: "Storefront JSON", Icon: Braces },
];

const CUTOUT_MODES: Array<{ id: CutoutMode; label: string }> = [
  { id: "auto", label: "Silueta" },
  { id: "circle", label: "Círculo" },
  { id: "float", label: "Flotante" },
];

export function ResultsTabs({
  result,
  previewUrl,
}: {
  result: CampaignResult | null;
  previewUrl: string | null;
}) {
  const [tab, setTab] = useState<TabId>("visual");
  const [cutoutMode, setCutoutMode] = useState<CutoutMode>("auto");

  return (
    <div className="flex h-full flex-col rounded-xl border border-night-rule bg-night-panel">
      <nav className="flex gap-1 border-b border-night-rule p-1">
        {TABS.map(({ id, label, Icon }) => (
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
      {result && tab !== "json" && result.posterImages.some((p) => !p) && (
        <div className="flex items-center justify-between gap-3 border-b border-night-rule px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">
            Recorte del producto · variantes locales
          </span>
          <div className="inline-flex rounded-md border border-night-rule bg-night p-0.5">
            {CUTOUT_MODES.map((m) => (
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
        {tab === "visual" && <VisualStudyTab result={result} previewUrl={previewUrl} cutoutMode={cutoutMode} />}
        {tab === "ads" && <MetaAdsTab result={result} previewUrl={previewUrl} cutoutMode={cutoutMode} />}
        {tab === "json" && <StorefrontJsonTab result={result} />}
      </div>
    </div>
  );
}
