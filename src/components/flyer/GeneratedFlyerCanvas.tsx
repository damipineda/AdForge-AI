"use client";

import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react";
import { fitStrategy } from "@/lib/flyer/fit";
import { loadImageElement } from "@/lib/flyer/image-loader";
import type { FlyerCanvasHandle } from "./FlyerCanvas";

type GeneratedFlyerCanvasProps = {
  /** Póster TERMINADO generado por el modelo de imagen (data URL). La
   * tipografía, el producto y los recursos gráficos ya viven horneados en
   * los píxeles: acá NO se compone nada encima — lo que se ve es lo que se
   * descarga. */
  artworkUrl: string;
  /** Tamaño EXACTO de exportación del placement (feed 1080x1350, story
   * 1080x1920). El lienzo siempre sale en estas dimensiones. */
  targetWidth: number;
  targetHeight: number;
  /** Proporción CSS del placement ("4 / 5" feed/carrusel, "9 / 16" story). */
  aspect?: string;
  className?: string;
  /** Informa cómo se encuadró el arte (para el badge "Arte extendido"). */
  onRender?: (info: { extended: boolean; srcWidth: number; srcHeight: number }) => void;
  /** Avisa cuando el primer frame quedó dibujado (para habilitar descarga/zoom). */
  onReadyChange?: (ready: boolean) => void;
  /** La imagen no se pudo cargar: el padre muestra toast en vez de negro. */
  onError?: (message: string) => void;
};

export const GeneratedFlyerCanvas = memo(
  forwardRef<FlyerCanvasHandle, GeneratedFlyerCanvasProps>(function GeneratedFlyerCanvas(
    { artworkUrl, targetWidth, targetHeight, className, aspect = "4 / 5", onRender, onReadyChange, onError },
    ref,
  ) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef(false);
  // Callbacks por ref: si entraran en las deps, cada render del padre
  // recargaría la imagen y el canvas parpadearía en loop.
  const callbacksRef = useRef({ onRender, onReadyChange, onError });
  callbacksRef.current = { onRender, onReadyChange, onError };
  const setReady = (ready: boolean) => {
    readyRef.current = ready;
    callbacksRef.current.onReadyChange?.(ready);
  };

  useImperativeHandle(ref, () => ({
    toPng: () => (readyRef.current ? (canvasRef.current?.toDataURL("image/png") ?? null) : null),
    download: (filename: string) => {
      const canvas = canvasRef.current;
      if (!canvas || !readyRef.current) return;
      const anchor = document.createElement("a");
      anchor.href = canvas.toDataURL("image/png");
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    },
    isReady: () => readyRef.current,
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    setReady(false);
    let cancelled = false;
    // El await es load-bearing: dibujar/exportar antes del onload sale negro.
    void loadImageElement(artworkUrl).then(
      (image) => {
        if (cancelled) return;
        const extended = drawExact(ctx, image, targetWidth, targetHeight);
        callbacksRef.current.onRender?.({ extended, srcWidth: image.naturalWidth, srcHeight: image.naturalHeight });
        setReady(true);
      },
      (error: unknown) => {
        if (cancelled) return;
        setReady(false);
        callbacksRef.current.onError?.(error instanceof Error ? error.message : "No se pudo cargar la imagen para exportar.");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [artworkUrl, targetWidth, targetHeight]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "auto", display: "block", aspectRatio: aspect }}
    />
  );
  }),
);

/**
 * Exportación a dimensiones EXACTAS del placement, sin deformar jamás.
 * Devuelve `true` si hubo que extender (mismatch de aspecto) para que la UI
 * lo señalice. Ver `fitStrategy` (testeado) para la decisión crop/extend.
 */
function drawExact(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  W: number,
  H: number,
): boolean {
  const iw = image.naturalWidth || W;
  const ih = image.naturalHeight || H;
  const { mode } = fitStrategy(iw, ih, W, H);

  if (mode === "crop") {
    const scale = Math.max(W / iw, H / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(image, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return false;
  }

  gradientExtend(ctx, image, iw, ih, W, H);
  return true;
}

/**
 * Extensión con degradado muestreado del propio arte (plan B intencional, no
 * relleno borroso): el fondo es un degradado vertical entre el color medio
 * del borde superior e inferior del arte, levemente oscurecido, y encima va
 * el arte nítido completo, encajado y centrado, sin recortes ni deformación.
 */
function gradientExtend(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  iw: number,
  ih: number,
  W: number,
  H: number,
) {
  const top = edgeColor(image, "top");
  const bottom = edgeColor(image, "bottom");
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(top, 0.88));
  g.addColorStop(1, shade(bottom, 0.88));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const fscale = Math.min(W / iw, H / ih);
  const fw = iw * fscale;
  const fh = ih * fscale;
  ctx.drawImage(image, (W - fw) / 2, (H - fh) / 2, fw, fh);
}

/** Color medio del borde superior o inferior del arte (muestreo 16x16). */
function edgeColor(image: HTMLImageElement, edge: "top" | "bottom"): [number, number, number] {
  const sample = document.createElement("canvas");
  sample.width = 16;
  sample.height = 16;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  if (!sctx) return [21, 24, 31];
  sctx.drawImage(image, 0, 0, 16, 16);
  const row = edge === "top" ? 0 : 15;
  const data = sctx.getImageData(0, row, 16, 1).data;
  let r = 0, green = 0, b = 0;
  for (let x = 0; x < 16; x++) {
    r += data[x * 4];
    green += data[x * 4 + 1];
    b += data[x * 4 + 2];
  }
  return [Math.round(r / 16), Math.round(green / 16), Math.round(b / 16)];
}

function shade([r, g, b]: [number, number, number], factor: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
