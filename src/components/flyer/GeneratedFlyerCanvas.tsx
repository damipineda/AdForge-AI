"use client";

import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react";
import { loadImageElement } from "@/lib/flyer/image-loader";
import { pickLogoCorner, sampleBusyGrid, type BusyGrid } from "@/lib/flyer/layer-render";
import type { FlyerCanvasHandle } from "./FlyerCanvas";

type Props = {
  artworkUrl: string;
  targetWidth: number;
  targetHeight: number;
  aspect?: string;
  className?: string;
  onRender?: (info: { extended: boolean; srcWidth: number; srcHeight: number }) => void;
  onReadyChange?: (ready: boolean) => void;
  onError?: (message: string) => void;
  /** Logo real de la marca: se compone nítido en la esquina más libre (inferior o superior). */
  logoUrl?: string | null;
  /** Esquina inferior fijada por el usuario (auto = la más libre). */
  logoPosition?: "auto" | "left" | "right" | null;
};

/** Muse owns the entire design. Canvas only exports its unchanged pixels at native resolution. */
export const GeneratedFlyerCanvas = memo(forwardRef<FlyerCanvasHandle, Props>(function GeneratedFlyerCanvas(
  { artworkUrl, className, onRender, onReadyChange, onError, logoUrl, logoPosition }, ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef(false);
  const callbacks = useRef({ onRender, onReadyChange, onError });
  callbacks.current = { onRender, onReadyChange, onError };
  useImperativeHandle(ref, () => ({
    toPng: () => readyRef.current ? canvasRef.current?.toDataURL("image/png") ?? null : null,
    isReady: () => readyRef.current,
    download: (filename) => {
      if (!readyRef.current || !canvasRef.current) return;
      const anchor = document.createElement("a");
      anchor.href = canvasRef.current.toDataURL("image/png"); anchor.download = filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    },
  }));
  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    callbacks.current.onReadyChange?.(false);
    void Promise.all([
      loadImageElement(artworkUrl),
      logoUrl ? loadImageElement(logoUrl).catch(() => null) : Promise.resolve(null),
    ]).then(([image, logo]) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0);
      if (logo) drawBrandLogo(ctx, logo, canvas.width, canvas.height, logoPosition === "left" || logoPosition === "right" ? logoPosition : null);
      readyRef.current = true;
      callbacks.current.onRender?.({ extended: false, srcWidth: canvas.width, srcHeight: canvas.height });
      callbacks.current.onReadyChange?.(true);
    }).catch((error: unknown) => {
      if (!cancelled) callbacks.current.onError?.(error instanceof Error ? error.message : "No se pudo cargar la pieza.");
    });
    return () => { cancelled = true; };
  }, [artworkUrl, logoUrl, logoPosition]);
  return <canvas ref={canvasRef} className={className} aria-label="Pieza completa diseñada por Muse Image" style={{ width: "100%", height: "auto", display: "block" }} />;
}));

type PreparedLogo = {
  source: CanvasImageSource;
  transparentSource: CanvasImageSource | null;
  width: number;
  height: number;
  opaqueBox: boolean;
  isWhiteBg: boolean;
};

/**
 * Si el logo subido viene dentro de un cuadrado blanco/uniforme opaco con mucho
 * margen vacío (típico JPG/PNG como perfil de Instagram), recorta el excedente
 * dejando un padding equilibrado alrededor de la tinta real y genera además una
 * versión con el fondo blanco knockeado a transparente (`transparentSource`)
 * para que sobre fondos claros el logo se apoye limpio sin parche cuadrado.
 */
function prepareLogoBadge(logo: HTMLImageElement): PreparedLogo {
  const iw = logo.naturalWidth || 1;
  const ih = logo.naturalHeight || 1;
  try {
    const off = document.createElement("canvas");
    off.width = iw;
    off.height = ih;
    const octx = off.getContext("2d");
    if (!octx) return { source: logo, transparentSource: null, width: iw, height: ih, opaqueBox: false, isWhiteBg: false };
    octx.drawImage(logo, 0, 0);
    const { data } = octx.getImageData(0, 0, iw, ih);
    const sample = (x: number, y: number) => {
      const i = (y * iw + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
    };
    const corners = [
      sample(0, 0),
      sample(iw - 1, 0),
      sample(0, ih - 1),
      sample(iw - 1, ih - 1),
    ];
    const opaqueCorners = corners.every((c) => c[3] >= 240);
    if (!opaqueCorners) {
      return { source: logo, transparentSource: null, width: iw, height: ih, opaqueBox: false, isWhiteBg: false };
    }
    const [br, bg, bb] = corners[0];
    const uniformCorners = corners.every(
      (c) => Math.abs(c[0] - br) + Math.abs(c[1] - bg) + Math.abs(c[2] - bb) < 36,
    );
    if (!uniformCorners) {
      return { source: logo, transparentSource: null, width: iw, height: ih, opaqueBox: true, isWhiteBg: false };
    }
    const isWhiteBg = br >= 235 && bg >= 235 && bb >= 235;

    let minX = iw;
    let minY = ih;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        const i = (y * iw + x) * 4;
        const diff = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb);
        if (diff > 32) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) {
      return { source: logo, transparentSource: null, width: iw, height: ih, opaqueBox: true, isWhiteBg };
    }
    const contentW = maxX - minX + 1;
    const contentH = maxY - minY + 1;
    const padX = Math.round(contentW * 0.18);
    const padY = Math.round(contentH * 0.18);
    const sx = Math.max(0, minX - padX);
    const sy = Math.max(0, minY - padY);
    const sw = Math.min(iw - sx, contentW + padX * 2);
    const sh = Math.min(ih - sy, contentH + padY * 2);

    const cropped = document.createElement("canvas");
    cropped.width = sw;
    cropped.height = sh;
    const cctx = cropped.getContext("2d");
    if (!cctx) return { source: logo, transparentSource: null, width: iw, height: ih, opaqueBox: true, isWhiteBg };
    cctx.drawImage(off, sx, sy, sw, sh, 0, 0, sw, sh);

    let transparentSource: CanvasImageSource | null = null;
    if (isWhiteBg) {
      const matte = document.createElement("canvas");
      matte.width = sw;
      matte.height = sh;
      const mctx = matte.getContext("2d");
      if (mctx) {
        const imgData = cctx.getImageData(0, 0, sw, sh);
        const px = imgData.data;
        for (let p = 0; p < px.length; p += 4) {
          const diff = Math.max(Math.abs(px[p] - br), Math.abs(px[p + 1] - bg), Math.abs(px[p + 2] - bb));
          if (diff <= 14) {
            px[p + 3] = 0;
          } else if (diff < 72) {
            px[p + 3] = Math.round(((diff - 14) / (72 - 14)) * px[p + 3]);
          }
        }
        mctx.putImageData(imgData, 0, 0);
        transparentSource = matte;
      }
    }
    return { source: cropped, transparentSource, width: sw, height: sh, opaqueBox: true, isWhiteBg };
  } catch {
    return { source: logo, transparentSource: null, width: iw, height: ih, opaqueBox: false, isWhiteBg: false };
  }
}

/** Mediana de luminancia (0..1) del rectángulo donde caerá el logo. */
function cornerLuminance(ctx: CanvasRenderingContext2D, dx: number, dy: number, w: number, h: number, W: number, H: number): number {
  try {
    const x0 = Math.max(0, Math.min(W - 1, Math.round(dx)));
    const y0 = Math.max(0, Math.min(H - 1, Math.round(dy)));
    const rw = Math.max(1, Math.min(W - x0, Math.round(w)));
    const rh = Math.max(1, Math.min(H - y0, Math.round(h)));
    const { data } = ctx.getImageData(x0, y0, rw, rh);
    const samples: number[] = [];
    const stepX = Math.max(1, Math.floor(rw / 10));
    const stepY = Math.max(1, Math.floor(rh / 10));
    for (let sy = 0; sy < rh; sy += stepY) {
      for (let sx = 0; sx < rw; sx += stepX) {
        const i = (sy * rw + sx) * 4;
        samples.push((data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255);
      }
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] ?? 0.7;
  } catch {
    return 0.7;
  }
}

/**
 * Logo real de la marca, compuesto nítido (el modelo nunca lo dibuja para
 * no deformarlo): evalúa las 4 esquinas y elige la más libre, salvo esquina
 * fijada por el usuario. Si el logo
 * viene en fondo blanco y la esquina elegida es clara, elimina la caja blanca
 * para apoyar la tipografía limpia sobre la foto; si la esquina es oscura,
 * dibuja una pastilla redondeada compacta.
 */
function drawBrandLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, W: number, H: number, forcedSide?: "left" | "right" | null) {
  const prepared = prepareLogoBadge(logo);
  const iw = prepared.width || 1;
  const ih = prepared.height || 1;
  const scale = Math.min((W * 0.145) / iw, (H * 0.048) / ih);
  if (!Number.isFinite(scale) || scale <= 0) return;
  const w = iw * scale;
  const h = ih * scale;
  const story = H / W > 1.5;
  const grid = gridOf(ctx, W, H);
  const wPct = (w / W) * 100;
  const hPct = (h / H) * 100;
  let picked = pickLogoCorner(
    grid,
    wPct,
    hPct,
    3,
    story ? 87 : 100 - 2.5,
    story ? 15 : 3,
    forcedSide ?? null,
  );
  // En Story (9:16), el titular siempre empieza entre el 13% y el 25% superior
  // (justo donde cae minTopPct = 15). Si el logo subió a una esquina superior
  // o si el 87% inferior está ocupado por un botón CTA ancho, probamos también
  // la esquina superior alta (3.5% del alto, encima del titular) y el borde
  // inferior bajo (94% del alto, debajo del CTA) para elegir la zona más limpia.
  if (story && !forcedSide && (picked.corner === "top-left" || picked.corner === "top-right" || picked.busy > 0.09)) {
    const highTop = pickLogoCorner(grid, wPct, hPct, 3, 87, 3.5, null);
    if (highTop.busy <= picked.busy + 0.01) {
      picked = highTop;
    }
  }
  const { x, y } = picked;
  const dx = (x / 100) * W;
  const dy = (y / 100) * H;
  const luma = cornerLuminance(ctx, dx, dy, w, h, W, H);
  ctx.save();
  if (prepared.isWhiteBg && prepared.transparentSource && luma >= 0.48) {
    // Esquina clara: dibujamos la tinta directa sin parche cuadrado blanco
    ctx.shadowColor = "rgba(255,255,255,0.65)";
    ctx.shadowBlur = Math.max(4, W * 0.005);
    ctx.shadowOffsetY = 0;
    ctx.drawImage(prepared.transparentSource, dx, dy, w, h);
  } else if (prepared.opaqueBox) {
    ctx.shadowColor = "rgba(0,0,0,0.26)";
    ctx.shadowBlur = Math.max(6, W * 0.01);
    ctx.shadowOffsetY = Math.max(2, H * 0.0025);
    const r = Math.min(w, h) * 0.26;
    ctx.beginPath();
    ctx.roundRect(dx, dy, w, h, r);
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    ctx.drawImage(prepared.source, dx, dy, w, h);
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = Math.max(6, W * 0.01);
    ctx.shadowOffsetY = Math.max(2, H * 0.0025);
    ctx.drawImage(prepared.source, dx, dy, w, h);
  }
  ctx.restore();
}

/** Mapa de ocupación del arte ya dibujado; incluye gradiente de luminancia y
 * saturación cromática para detectar tanto titulares como botones CTA de color. */
function gridOf(ctx: CanvasRenderingContext2D, W: number, H: number): BusyGrid {
  try {
    const { data } = ctx.getImageData(0, 0, W, H);
    const base = sampleBusyGrid((x, y) => {
      const o = (y * W + x) * 4;
      return (data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722) / 255;
    }, W, H);
    const { cols, rows } = base;
    const cw = W / cols;
    const ch = H / rows;
    const satSums = new Array<number>(cols * rows).fill(0);
    const counts = new Array<number>(cols * rows).fill(0);
    for (let y = 1; y < H - 1; y += 3) {
      for (let x = 1; x < W - 1; x += 3) {
        const o = (y * W + x) * 4;
        const r = data[o];
        const g = data[o + 1];
        const b = data[o + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        // Croma normalizado sobre 255: detecta botones y bloques de color real
        // (ej. azul #0d74b8 o lima #b8f25c → chroma > 0.55) sin confundir
        // sombras oscuras entintadas (ej. negro rojizo RGB 38,14,14 → chroma 0.09).
        const chroma = max > 85 ? (max - min) / 255 : 0;
        const idx = Math.min(rows - 1, Math.floor(y / ch)) * cols + Math.min(cols - 1, Math.floor(x / cw));
        satSums[idx] += chroma;
        counts[idx] += 1;
      }
    }
    for (let i = 0; i < base.cells.length; i++) {
      const avgChroma = counts[i] ? satSums[i] / counts[i] : 0;
      if (avgChroma > 0.36) {
        base.cells[i] += (avgChroma - 0.36) * 0.75;
      }
    }
    return base;
  } catch {
    return { cols: 1, rows: 1, cells: [Number.POSITIVE_INFINITY] };
  }
}
