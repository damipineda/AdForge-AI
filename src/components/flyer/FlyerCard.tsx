"use client";

import { memo, useCallback, useRef, useState } from "react";
import { Check, Copy, Download, Images, Layers, RectangleVertical, Smartphone, TriangleAlert } from "lucide-react";
import type { PhotoDesignData, Segmentation, StudioScene, StyleArchetype, VisualReview } from "@/lib/schema/campaign";
import type { CutoutMode } from "@/lib/flyer/photo";
import { FlyerCanvas, type FlyerCanvasHandle } from "./FlyerCanvas";
import { GeneratedFlyerCanvas } from "./GeneratedFlyerCanvas";
import { ReviewChecks } from "./ReviewChecks";
import { ReviewNotes } from "./ReviewNotes";

type FlyerCardProps = {
  /** "FEED 4:5 · V1" / "STORY 9:16": placement real, no red social. */
  kicker: string;
  filename: string;
  concept: string;
  hook: string;
  /** Apoyo largo; `null` en la story (titular + CTA). */
  body: string | null;
  cta: string;
  benefit: string;
  featurePills: string[];
  scene: StudioScene;
  styleArchetype: StyleArchetype;
  segmentation: Segmentation;
  designData: PhotoDesignData | null;
  previewUrl: string | null;
  /**
   * Arte del paso de imagen (data URL): la pieza IA completa (img2img con la
   * foto real) que se muestra cruda, sin composición encima. `null` →
   * composición 100% local con Canvas.
   */
  posterUrl: string | null;
  fallbackReason: string | null;
  review: VisualReview | null;
  story?: boolean;
  cutoutMode: CutoutMode;
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
  posterUrl,
  fallbackReason,
  review,
  story = false,
  cutoutMode,
}: FlyerCardProps) {
  const canvasRef = useRef<FlyerCanvasHandle>(null);
  const [copied, setCopied] = useState(false);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  // A qué arte corresponde el último reporte de encuadre: si el arte cambió y
  // el canvas aún no reportó, el badge viejo se ignora sin necesidad de efecto.
  const [renderInfo, setRenderInfo] = useState<{ src: string | null; extended: boolean }>({ src: null, extended: false });
  const extended = renderInfo.src === posterUrl && renderInfo.extended;
  // Rama de render (arte IA o composición local + modo): la readiness vieja
  // de otra rama se ignora comparando, sin efectos ni loops.
  const branchKey = posterUrl ?? `local:${cutoutMode}`;
  const [readyInfo, setReadyInfo] = useState<{ src: string | null; ready: boolean }>({ src: null, ready: false });
  const ready = readyInfo.src === branchKey && readyInfo.ready;
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Callbacks estables: si se recrearan por render, los efectos de los
  // canvas recargarían la imagen en loop (= parpadeo).
  const handleRender = useCallback(
    (info: { extended: boolean }) => setRenderInfo({ src: posterUrl, extended: info.extended }),
    [posterUrl],
  );
  const handleReadyChange = useCallback(
    (isReady: boolean) => setReadyInfo({ src: branchKey, ready: isReady }),
    [branchKey],
  );
  const handleCanvasError = useCallback(
    (message: string) => showToast(message),
    [showToast],
  );

  const fullCopy = body ? `${hook}\n\n${body}\n\n${cta}` : `${hook}\n\n${cta}`;
  const rawPoster = posterUrl !== null;
  const privacyBlocked = Boolean(review?.issues.some((issue) => issue.category === "privacy"));

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
    if (privacyBlocked) return;
    if (!ready || !canvasRef.current?.isReady()) {
      showToast("La imagen aún se está preparando, probá en unos segundos.");
      return;
    }
    canvasRef.current.download(filename);
    // Señal humana de éxito para el skill: esta pieza gustó lo suficiente
    // como para exportarla. El Dashboard la escucha y la registra.
    window.dispatchEvent(new CustomEvent("adforge:export", { detail: { filename } }));
  };

  const handleZoom = () => {
    if (!ready) {
      showToast("La imagen aún se está preparando, probá en unos segundos.");
      return;
    }
    const png = canvasRef.current?.toPng() ?? posterUrl;
    if (png) setZoomSrc(png);
    else showToast("No se pudo generar la vista ampliada.");
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
              title="El proveedor devolvió otro aspecto y el export extendió el fondo con degradado para llegar al tamaño exacto"
            >
              Arte extendido
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
                ? "Pieza completa generada con IA (img2img con tu foto)"
                : fallbackReason
                  ? `Composición local con Canvas. Motivo: ${fallbackReason}`
                  : "Composición local con Canvas (fallback)"
            }
          >
            {posterUrl ? <Images className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
            {posterUrl ? "Imagen IA" : "Local"}
          </span>
        </span>
      </div>

      <div className="bg-night p-3">
        <div className="overflow-hidden rounded-lg border border-night-rule">
          {privacyBlocked ? (
            <p className="p-6 text-sm text-amber-300" role="alert">Se detectó o no se pudo descartar información sensible. La vista y descarga están bloqueadas. Ocultá la patente en la foto original y generá nuevamente.</p>
          ) : rawPoster ? (
            <div
              className={ready ? "cursor-zoom-in" : "cursor-wait"}
              onClick={() => {
                if (!zoomSrc) handleZoom();
              }}
              title="Ver imagen en tamaño completo"
            >
              <GeneratedFlyerCanvas ref={canvasRef} artworkUrl={posterUrl} targetWidth={1080} targetHeight={story ? 1920 : 1350} aspect={story ? "9 / 16" : "4 / 5"} onRender={handleRender} onReadyChange={handleReadyChange} onError={handleCanvasError} />
            </div>
          ) : (
            <div
              className={ready && !zoomSrc ? "cursor-zoom-in" : undefined}
              onClick={() => {
                if (!zoomSrc) handleZoom();
              }}
              title="Ver composición en tamaño completo"
            >
              <FlyerCanvas
                ref={canvasRef}
                photoUrl={previewUrl}
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
        <ReviewChecks review={review} />
        <ReviewNotes review={review} />
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
            disabled={!ready || privacyBlocked}
            title={privacyBlocked ? "Revisá los datos sensibles antes de generar de nuevo" : ready ? undefined : "La imagen aún se está preparando"}
            className="inline-flex items-center gap-1.5 rounded border border-mint/40 bg-mint-soft px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-mint transition-colors hover:bg-mint hover:text-ink disabled:cursor-wait disabled:opacity-50 disabled:hover:bg-mint-soft disabled:hover:text-mint"
          >
            <Download className="h-3 w-3" />
            {privacyBlocked ? "Descarga bloqueada" : ready ? `Descargar ${story ? "historia" : "feed"} PNG` : "Preparando imagen…"}
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
