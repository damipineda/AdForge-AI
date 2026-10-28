"use client";

import { useState } from "react";
import { Download, File, FileSpreadsheet } from "lucide-react";
import { clsx } from "clsx";
import {
  toMetaCatalogFeed,
  toShopifyProduct,
  type CampaignResult,
} from "@/lib/schema/campaign";

type View = "shopify" | "meta" | "raw";

export function StorefrontJsonTab({ result }: { result: CampaignResult | null }) {
  const [view, setView] = useState<View>("shopify");

  if (!result) {
    return (
      <div className="hatch flex h-[360px] items-center justify-center rounded-lg border border-night-rule">
        <p className="text-sm text-paper-muted">El JSON aparece acá cuando termina el pipeline.</p>
      </div>
    );
  }

  const payload =
    view === "shopify"
      ? JSON.stringify(toShopifyProduct(result), null, 2)
      : view === "meta"
        ? toMetaCatalogFeed(result)
        : JSON.stringify(sanitizePosters(result), null, 2);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-night-rule-strong bg-night p-0.5">
          {(
            [
              ["shopify", "Shopify Product"],
              ["meta", "Meta Catalog CSV"],
              ["raw", "Campaign raw"],
            ] as Array<[View, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={clsx(
                "rounded px-3 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors",
                view === key ? "bg-mint-soft text-mint" : "text-paper-muted hover:text-paper",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <DownloadButton
            label=".json"
            icon={<File className="h-3.5 w-3.5" />}
            onClick={() =>
              downloadFile(
                `${result.skuId}.json`,
                JSON.stringify(toShopifyProduct(result), null, 2),
                "application/json",
              )
            }
          />
          <DownloadButton
            label=".csv"
            icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
            onClick={() =>
              downloadFile(`${result.skuId}.csv`, toMetaCatalogFeed(result), "text/csv")
            }
          />
        </div>
      </div>

      <pre className="max-h-[520px] overflow-auto rounded-lg border border-night-rule bg-night p-4 font-mono text-[12px] leading-relaxed text-paper-dim">
        {payload}
      </pre>
    </div>
  );
}

function DownloadButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded border border-night-rule-strong bg-night px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-paper-dim transition-colors hover:border-mint hover:text-mint"
    >
      <Download className="h-3 w-3" />
      {icon}
      {label}
    </button>
  );
}

function downloadFile(name: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reemplaza los data URL de los pósters por un resumen para que la vista
 * "Campaign raw" no tenga que renderizar megabytes de base64 en el <pre>. */
function sanitizePosters(result: CampaignResult) {
  return {
    ...result,
    posterImages: result.posterImages.map((p) =>
      p ? `«póster generado · ~${Math.round(p.length / 1024)} KB de base64»` : null,
    ),
  };
}
