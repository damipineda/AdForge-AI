"use client";

import { memo, useCallback, useRef, useState } from "react";
import { Check, Copy, Download, Images, Layers, RectangleVertical, Smartphone, TriangleAlert } from "lucide-react";
import type { PhotoDesignData, Segmentation, StudioScene, StyleArchetype, VisualReview } from "@/lib/schema/campaign";
import type { CutoutMode } from "@/lib/flyer/photo";
import { FlyerCanvas, type FlyerCanvasHandle } from "./FlyerCanvas";
import { GeneratedFlyerCanvas } from "./GeneratedFlyerCanvas";
import { ReviewChecks } from "./ReviewChecks";
import { ReviewNotes } from "./ReviewNotes";
import { automaticCorrectionInstruction, requiresImageCorrection } from "@/lib/pipeline/review-policy";
import { useI18n } from "@/lib/i18n";

type FlyerCardProps = {
  kicker: string;
  filename: string;
  concept: string;
  hook: string;
  body: string | null;
  cta: string;
  benefit: string;
  featurePills: string[];
  scene: StudioScene;
  styleArchetype: StyleArchetype;
  segmentation: Segmentation;
  designData: PhotoDesignData | null;
  previewUrl: string | null;
  previewUrls?: string[];
  posterUrl: string | null;
  fallbackReason: string | null;
  review: VisualReview | null;
  story?: boolean;
  cutoutMode: CutoutMode;
  legacyLayers?: boolean;
  onRefine?: (instruction: string, mode?: "refine" | "regenerate") => Promise<void>;
  logoUrl?: string | null;
  logoPosition?: "auto" | "left" | "right" | null;
};

export const FlyerCard = memo(function FlyerCard({
  kicker,
  filename,
  concept,
  hook,
  body,
  cta,
  benefit,
  featurePills,
  scene,
  styleArchetype,
  segmentation,
  designData,
  previewUrl,
  previewUrls,
  posterUrl,
  fallbackReason,
  review,
  story = false,
  cutoutMode,
  legacyLayers,
  onRefine,
  logoUrl,
  logoPosition,
}: FlyerCardProps) {
  const { t } = useI18n();
  const canvasRef = useRef<FlyerCanvasHandle>(null);
  const [copied, setCopied] = useState(false);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [renderInfo, setRenderInfo] = useState<{ src: string | null; extended: boolean }>({ src: null, extended: false });
  const extended = renderInfo.src === posterUrl && renderInfo.extended;
  const branchKey = `${posterUrl ?? `local:${cutoutMode}`}|${logoUrl ?? ""}|${logoPosition ?? "auto"}`;
  const [readyInfo, setReadyInfo] = useState<{ src: string | null; ready: boolean }>({ src: null, ready: false });
  const [canvasErrorInfo, setCanvasErrorInfo] = useState<{ src: string; message: string } | null>(null);
  const canvasError = canvasErrorInfo?.src === branchKey ? canvasErrorInfo.message : null;
  const ready = readyInfo.src === branchKey && readyInfo.ready;
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const handleRender = useCallback(
    (info: { extended: boolean }) => setRenderInfo({ src: posterUrl, extended: info.extended }),
    [posterUrl],
  );
  const handleReadyChange = useCallback(
    (isReady: boolean) => { setReadyInfo({ src: branchKey, ready: isReady }); if (isReady) setCanvasErrorInfo(null); },
    [branchKey],
  );
  const handleCanvasError = useCallback(
    (message: string) => { setCanvasErrorInfo({ src: branchKey, message }); showToast(message); },
    [showToast, branchKey],
  );

  const fullCopy = body ? `${hook}\n\n${body}\n\n${cta}` : `${hook}\n\n${cta}`;
  const rawPoster = posterUrl !== null;
  const privacyBlocked = Boolean(review?.issues.some((issue) => issue.category === "privacy"));
  const qualityBlocked = requiresImageCorrection(review);
  const autoInstruction = automaticCorrectionInstruction(review);

  const runRefinement = async (request: string, mode?: "refine" | "regenerate") => {
    if (!onRefine || !request.trim() || refining) return;
    setRefining(true); setRefineError(null);
    try { await onRefine(request.trim(), mode); setInstruction(""); showToast(t.flyerCard.refinedToast); }
    catch (error) { setRefineError(error instanceof Error ? error.message : t.flyerCard.refineErrorDefault); }
    finally { setRefining(false); }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleDownload = () => {
    if (qualityBlocked) return;
    if (!ready || !canvasRef.current?.isReady()) {
      showToast(t.flyerCard.preparingToast);
      return;
    }
    canvasRef.current.download(filename);
    window.dispatchEvent(new CustomEvent("adforge:export", { detail: { filename } }));
  };

  const handleZoom = () => {
    if (!ready) {
      showToast(t.flyerCard.preparingToast);
      return;
    }
    const png = canvasRef.current?.toPng() ?? posterUrl;
    if (png) setZoomSrc(png);
    else showToast(t.flyerCard.zoomErrorToast);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-night-rule bg-night-panel">
      <div className="flex items-center justify-between border-b border-night-rule px-3 py-2">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-paper-muted">
          {story ? (
            <Smartphone className="h-3.5 w-3.5 text-mint" />
          ) : (
            <RectangleVertical className="h-3.5 w-3.5 text-mint" />
          )}
          {kicker}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {extended && posterUrl && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-300"
              title={t.flyerCard.extendedArtTitle}
            >
              {t.flyerCard.extendedArt}
            </span>
          )}
          <span
            className={
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
              (posterUrl
                ? "border-mint/40 bg-mint-soft text-mint"
                : "border-night-rule-strong bg-night text-paper-muted")
            }
            title={
              posterUrl
                ? t.flyerCard.aiImageTitle
                : t.flyerCard.localFallbackTitle(fallbackReason)
            }
          >
            {posterUrl ? <Images className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
            {posterUrl ? t.flyerCard.aiImage : t.flyerCard.localImage}
          </span>
        </span>
      </div>

      <div className="bg-night p-3">
        <div className="overflow-hidden rounded-lg border border-night-rule">
          {privacyBlocked ? (
            <p className="p-6 text-sm text-amber-300" role="alert">{t.flyerCard.privacyBlocked}</p>
          ) : rawPoster ? (
            <div className={ready ? "cursor-zoom-in" : "cursor-wait"} onClick={() => { if (!zoomSrc) handleZoom(); }} title={t.flyerCard.zoomTitle}>
              <GeneratedFlyerCanvas ref={canvasRef} artworkUrl={posterUrl} targetWidth={1080} targetHeight={story ? 1920 : 1350} aspect={story ? "9 / 16" : "4 / 5"} onRender={handleRender} onReadyChange={handleReadyChange} onError={handleCanvasError} logoUrl={logoUrl} logoPosition={logoPosition} />
            </div>
          ) : (
            <div
              className={ready && !zoomSrc ? "cursor-zoom-in" : undefined}
              onClick={() => {
                if (!zoomSrc) handleZoom();
              }}
              title={t.flyerCard.zoomTitle}
            >
              <FlyerCanvas
                ref={canvasRef}
                photoUrl={previewUrl}
                photoUrls={previewUrls}
                segmentation={segmentation}
                scene={scene}
                styleArchetype={styleArchetype}
                designData={designData}
                stageUrl={posterUrl}
                badge={scene.badge}
                hook={hook}
                cta={cta}
                benefit={benefit}
                featurePills={featurePills}
                cutoutMode={cutoutMode}
                width={1080}
                height={story ? 1920 : 1350}
                story={story}
                onReadyChange={handleReadyChange}
              />
            </div>
          )}
        </div>
      </div>

      {fallbackReason ? (
        <p className="border-t border-night-rule bg-night px-3 py-2 font-mono text-[9px] leading-relaxed tracking-wider text-paper-muted">
          {t.flyerCard.aiArtNotGenerated} · {fallbackReason}
        </p>
      ) : null}

      <form className="space-y-2 border-t border-night-rule p-3" onSubmit={async (event) => {
        event.preventDefault(); await runRefinement(instruction);
      }}>
        {autoInstruction && <button type="button" disabled={refining || !onRefine} onClick={() => void runRefinement(autoInstruction, "refine")} className="rounded border border-mint/50 bg-mint-soft px-3 py-2 text-xs text-mint disabled:opacity-50">{refining ? t.flyerCard.autoFixing : t.flyerCard.autoFixBtn}</button>}
        <button type="button" disabled={refining || !onRefine} onClick={() => void runRefinement(autoInstruction ?? t.flyerCard.regenerateDefaultPrompt, "regenerate")} className="rounded border border-mint/50 px-3 py-2 text-xs text-mint disabled:opacity-50">{t.flyerCard.regenerateBtn}</button>
        <p className="text-[11px] text-paper-muted">{t.flyerCard.regenerateHint}</p>
        <label className="block text-xs text-paper-dim">{t.flyerCard.refineLabel}
          <textarea className="mt-2 w-full rounded border border-night-rule bg-night p-2 text-xs text-paper" rows={2} maxLength={800} disabled={refining || !onRefine} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={t.flyerCard.refinePlaceholder} />
        </label>
        {legacyLayers && <p className="text-xs text-paper-muted">{t.flyerCard.legacyLayersHint}</p>}
        <button type="submit" disabled={refining || !onRefine || !instruction.trim()} className="rounded border border-mint/40 px-3 py-2 text-xs text-mint disabled:opacity-50">{refining ? t.flyerCard.refiningBtn : t.flyerCard.refineBtn}</button>
        {refining && <p role="status" className="text-xs text-paper-muted">{t.flyerCard.refiningStatus}</p>}
        {!onRefine && <p className="text-xs text-paper-muted">{t.flyerCard.refineDisabledHint}</p>}
        {refineError && <p role="alert" className="text-xs text-amber-300">{refineError}</p>}
      </form>

      {zoomSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={() => setZoomSrc(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomSrc}
            alt={kicker}
            className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <p className="break-words font-mono text-[10px] uppercase tracking-widest text-mint">
          {concept}
        </p>
        {body ? <p className="break-words text-sm leading-relaxed text-paper-dim">{body}</p> : null}
        {qualityBlocked && <p role="alert" className="rounded border border-amber-400/30 bg-amber-400/5 p-2 text-xs text-amber-300">{refining ? t.flyerCard.qualityBlockedFixing : t.flyerCard.qualityBlockedAlert}</p>}
        {!qualityBlocked && review?.issues.some((issue) => issue.category === "diversity") && <p className="text-xs text-paper-muted">{t.flyerCard.diversityOptionalHint}</p>}
        <ReviewChecks review={review} />
        <ReviewNotes review={review} />
        <div className="mt-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded border border-night-rule-strong bg-night px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-paper-dim transition-colors hover:border-mint hover:text-mint"
          >
            {copied ? <Check className="h-3 w-3 text-mint" /> : <Copy className="h-3 w-3" />}
            {copied ? t.flyerCard.copied : t.flyerCard.copy}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!ready || qualityBlocked}
            aria-busy={!ready && !qualityBlocked && !canvasError}
            title={qualityBlocked ? t.flyerCard.fixBeforeDownloadTitle : canvasError ?? (ready ? undefined : t.flyerCard.preparingImage)}
            className={`inline-flex items-center gap-1.5 rounded border border-mint/40 bg-mint-soft px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-mint transition-colors hover:bg-mint hover:text-ink disabled:opacity-50 disabled:hover:bg-mint-soft disabled:hover:text-mint ${qualityBlocked || canvasError ? "disabled:cursor-not-allowed" : "disabled:cursor-wait"}`}
          >
            {qualityBlocked ? <TriangleAlert className="h-3 w-3" /> : <Download className="h-3 w-3" />}
            {qualityBlocked
              ? t.flyerCard.pendingCorrection
              : canvasError
                ? t.flyerCard.imageUnavailable
                : ready
                  ? story
                    ? t.flyerCard.downloadStory
                    : t.flyerCard.downloadFeed
                  : t.flyerCard.preparingImage}
          </button>
        </div>
      </div>
      {toast ? (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-[60] flex max-w-sm -translate-x-1/2 items-center gap-2 rounded-lg border border-danger-dark/40 bg-night-panel px-4 py-2.5 text-sm text-paper shadow-2xl"
        >
          <TriangleAlert className="h-4 w-4 shrink-0 text-danger" />
          {toast}
        </div>
      ) : null}
    </div>
  );
});
