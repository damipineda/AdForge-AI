"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PhotoDesignData } from "@/lib/schema/campaign";
import type { FlyerCanvasHandle } from "./FlyerCanvas";

type GeneratedFlyerCanvasProps = {
  /** Póster TERMINADO generado por el modelo de imagen (data URL). La
   * tipografía, el producto y los recursos gráficos ya viven horneados en
   * los píxeles: acá NO se compone nada encima — lo que se ve es lo que se
   * descarga. */
  artworkUrl: string;
  /** Paleta extraída de la foto (visión): se usa solo para rellenar las
   * bandas laterales cuando el arte IA no viene en 3:4 exacto. */
  designData: PhotoDesignData | null;
  story?: boolean;
  width?: number;
  height?: number;
  className?: string;
};

export const GeneratedFlyerCanvas = forwardRef<
  FlyerCanvasHandle,
  GeneratedFlyerCanvasProps
>(function GeneratedFlyerCanvas(
  { artworkUrl, designData, width, height, className, story = false },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    toPng: () => canvasRef.current?.toDataURL("image/png") ?? null,
    download: (filename: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const anchor = document.createElement("a");
      anchor.href = canvas.toDataURL("image/png");
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const W = width ?? 768;
    const H = height ?? 1024;
    canvas.width = W;
    canvas.height = H;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      // El arte IA ya viene en 2K (1536x2048). Si el caller no fijó un tamaño
      // explícito, el lienzo toma las dimensiones NATURALES de la imagen: así
      // el PNG descargado conserva la resolución del modelo en vez de bajarla
      // a 768 px. El CSS mantiene el aspect 3:4 en pantalla.
      if (story) {
        canvas.width = 1080;
        canvas.height = 1920;
        ctx.fillStyle = designData?.dominantColorHex ?? "#15181f";
        ctx.fillRect(0, 0, 1080, 1920);
        // 3:4 centrado entre las bandas reservadas para controles de Stories.
        ctx.save();
        ctx.translate(0, 240);
        draw(ctx, image, 1080, 1440, designData);
        ctx.restore();
        return;
      }
      if (!width || !height) {
        canvas.width = image.naturalWidth || W;
        canvas.height = image.naturalHeight || H;
      }
      draw(ctx, image, canvas.width, canvas.height, designData);
    };
    image.src = artworkUrl;

    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [artworkUrl, designData, width, height, story]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "auto", display: "block", aspectRatio: story ? "9 / 16" : "3 / 4" }}
    />
  );
});

/**
 * Renderizado del arte IA: la imagen generada se muestra COMPLETA, protegida
 * contra recortes que rompan la tipografía horneada. Si el modelo respetó el
 * 3:4 pedido, se llena el cuadro (cover). Si trajo otra proporción, en lugar
 * de recortar se encaja (fit) y las bandas sobrantes se rellenan con un
 * degradé de la paleta real de la foto (o neutro oscuro), para que el PNG
 * descargado siga siendo 3:4 sin arruinar el diseño.
 */
function draw(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  W: number,
  H: number,
  designData: PhotoDesignData | null,
) {
  const iw = image.naturalWidth || W;
  const ih = image.naturalHeight || H;
  const srcRatio = iw / ih;
  const dstRatio = W / H;
  const skew = Math.abs(srcRatio - dstRatio) / dstRatio;

  if (skew <= 0.06) {
    // Proporción ok (≤6% de desvío): cover sin recortes perceptibles de copy.
    coverDraw(ctx, image, W, H);
    return;
  }

  fillBands(ctx, W, H, dstRatio, srcRatio, designData);
  const scale = Math.min(W / iw, H / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(image, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  W: number,
  H: number,
) {
  const scale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  ctx.drawImage(image, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

const NEUTRAL_BANDS: [string, string, string] = ["#0d0f14", "#15181f", "#0d0f14"];

function fillBands(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dstRatio: number,
  srcRatio: number,
  designData: PhotoDesignData | null,
) {
  const stops = bandStops(designData);
  const g = srcRatio > dstRatio
    ? ctx.createLinearGradient(0, 0, 0, H) // banda arriba/abajo → gradiente vertical
    : ctx.createLinearGradient(0, 0, W, 0); // bandas laterales → gradiente horizontal
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.5, stops[1]);
  g.addColorStop(1, stops[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function bandStops(designData: PhotoDesignData | null): [string, string, string] {
  const hex = /^#[0-9a-fA-F]{6}$/;
  const d = designData?.dominantColorHex ?? "";
  const s = designData?.secondaryColorHex ?? "";
  if (hex.test(d) && hex.test(s)) return [shade(d, 0.72), shade(s, 0.8), shade(d, 0.72)];
  return NEUTRAL_BANDS;
}

/** Oscurece un hex para que las bandas no compitan con el flyer. */
function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
