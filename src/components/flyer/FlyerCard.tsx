"use client";

import { useRef, useState } from "react";
import { Camera, Check, Copy, Download, Images, Layers, Users } from "lucide-react";
import type { AdVariant, CampaignResult, FlyerTexts, StudioScene } from "@/lib/schema/campaign";
import type { CutoutMode } from "@/lib/flyer/photo";
import { FlyerCanvas, type FlyerCanvasHandle } from "./FlyerCanvas";
import { GeneratedFlyerCanvas } from "./GeneratedFlyerCanvas";
import { ReviewNotes } from "./ReviewNotes";

type FlyerCardProps = {
  ad: AdVariant;
  scene: StudioScene;
  flyerTexts: FlyerTexts;
  result: CampaignResult;
  previewUrl: string | null;
  /**
   * Arte del paso de imagen (data URL): el flyer IA completo (img2img con la
   * foto real) que se muestra crudo, sin composición encima. `null` →
   * composición 100% local con Canvas.
   */
  posterUrl: string | null;
  index: number;
  cutoutMode: CutoutMode;
};

export function FlyerCard({
  ad,
  scene,
  flyerTexts,
  result,
  previewUrl,
  posterUrl,
  index,
  cutoutMode,
}: FlyerCardProps) {
  const canvasRef = useRef<FlyerCanvasHandle>(null);
  const [copied, setCopied] = useState(false);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [placement, setPlacement] = useState<"post" | "story">("post");

  const fullCopy = `${ad.hook}\n\n${ad.body}\n\n${ad.cta}`;
  const benefit = flyerTexts.bullets[0] ?? result.listing.shortPitch;
  const filename = `${result.skuId}-${placement}-V${index + 1}.png`;
  const rawPoster = posterUrl !== null;
  // Por qué esta variante terminó compuesta en Canvas: sin esto, un fallback por
  // cuota agotada se ve idéntico a un bug, y se pierde el tiempo diagnosticando
  // código que funciona.
  const fallbackReason = posterUrl ? null : (result.posterErrors[index] ?? null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* portapapeles no disponible */
    }
  };

  const handleDownload = () => {
    canvasRef.current?.download(filename);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-night-rule bg-night-panel">
      <div className="flex items-center justify-between border-b border-night-rule px-3 py-2">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-paper-muted">
          {ad.platform === "instagram" ? (
            <Camera className="h-3.5 w-3.5 text-mint" />
          ) : (
            <Users className="h-3.5 w-3.5 text-mint" />
          )}
          {ad.platform} · V{index + 1}
        </span>
        <span
          className={
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
            (posterUrl
              ? "border-mint/40 bg-mint-soft text-mint"
              : "border-night-rule-strong bg-night text-paper-muted")
          }
          title={
            posterUrl
              ? rawPoster
                ? "Flyer completo generado con IA (img2img con tu foto)"
                : "Fondo generado con IA + producto real compuesto localmente"
              : fallbackReason
                ? `Composición local con Canvas. Motivo: ${fallbackReason}`
                : "Composición local con Canvas (fallback)"
          }
        >
          {posterUrl ? <Images className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
          {posterUrl ? (rawPoster ? "Imagen IA" : "Fondo IA + producto") : "Local"}
        </span>
      </div>

      <div className="bg-night p-3">
        <div className="mb-2 flex gap-2" aria-label={`Formato de la variante ${index + 1}`}>
          <button type="button" onClick={() => setPlacement("post")} aria-pressed={placement === "post"} className={`rounded px-3 py-1 text-xs ${placement === "post" ? "bg-mint-soft text-mint" : "text-paper-muted"}`}>Post</button>
          <button type="button" onClick={() => setPlacement("story")} aria-pressed={placement === "story"} className={`rounded px-3 py-1 text-xs ${placement === "story" ? "bg-mint-soft text-mint" : "text-paper-muted"}`}>Historia 9:16</button>
        </div>
        <div className="overflow-hidden rounded-lg border border-night-rule">
          {rawPoster ? (
            <div
              className="cursor-zoom-in"
              onClick={() => setZoomSrc(canvasRef.current?.toPng() ?? posterUrl)}
              title="Ver imagen en tamaño completo"
            >
              <GeneratedFlyerCanvas ref={canvasRef} artworkUrl={posterUrl} designData={result.designData} story={placement === "story"} />
            </div>
          ) : (
            <div
              className={zoomSrc ? "cursor-zoom-in" : undefined}
              onClick={() => {
                if (!zoomSrc) {
                  const png = canvasRef.current?.toPng();
                  if (png) setZoomSrc(png);
                }
              }}
              title="Ver composición en tamaño completo"
            >
              <FlyerCanvas
                ref={canvasRef}
                photoUrl={previewUrl}
                segmentation={result.segmentation}
                scene={scene}
                styleArchetype={ad.styleArchetype}
                designData={result.designData}
                stageUrl={posterUrl}
                badge={scene.badge}
                hook={ad.hook}
                cta={ad.cta}
                benefit={benefit}
                featurePills={ad.featurePills}
                cutoutMode={cutoutMode}
                story={placement === "story"}
              />
            </div>
          )}
        </div>
      </div>

      {fallbackReason ? (
        <p className="border-t border-night-rule bg-night px-3 py-2 font-mono text-[9px] leading-relaxed tracking-wider text-paper-muted">
          ARTE IA NO GENERADO · {fallbackReason}
        </p>
      ) : null}

      {zoomSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={() => setZoomSrc(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomSrc}
            alt={`Flyer V${index + 1}`}
            className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-mint">
          {ad.concept}
        </p>
        <p className="text-sm leading-relaxed text-paper-dim">{ad.body}</p>
        <ReviewNotes review={result.visualReviews[index]} />
        {placement === "story" && <p className="text-[11px] text-paper-muted">La revisión se hizo sobre el post original; comprobá también la adaptación 9:16.</p>}
        <div className="mt-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded border border-night-rule-strong bg-night px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-paper-dim transition-colors hover:border-mint hover:text-mint"
          >
            {copied ? <Check className="h-3 w-3 text-mint" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded border border-mint/40 bg-mint-soft px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-mint transition-colors hover:bg-mint hover:text-ink"
          >
            <Download className="h-3 w-3" />
            Descargar {placement === "story" ? "historia" : "post"} PNG
          </button>
        </div>
      </div>
    </div>
  );
}
