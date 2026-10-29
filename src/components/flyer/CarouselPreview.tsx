"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { CampaignResult, CarouselSlide } from "@/lib/schema/campaign";
import { loadImageElement } from "@/lib/flyer/image-loader";
import { ReviewNotes } from "./ReviewNotes";

const labels: Record<CampaignResult["locale"], string[]> = {
  es: ["Atención", "Interés", "Deseo", "Acción"],
  pt: ["Atenção", "Interesse", "Desejo", "Ação"],
  en: ["Attention", "Interest", "Desire", "Action"],
};

export const CarouselPreview = memo(function CarouselPreview({ result, photoUrl }: { result: CampaignResult; photoUrl: string | null }) {
  const [active, setActive] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Clave de lámina: la readiness vieja de otra lámina se ignora comparando.
  const [readyInfo, setReadyInfo] = useState<{ key: number; ready: boolean }>({ key: -1, ready: false });
  const ready = readyInfo.key === active && readyInfo.ready;
  const slides = result.carouselSlides ?? [];
  const slide = slides[active];
  const artwork = result.carouselImages?.[active] ?? null;
  const privacyBlocked = Boolean(result.carouselReviews?.[active]?.issues.some((issue) => issue.category === "privacy"));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !slide || (!artwork && !photoUrl)) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    const key = active;
    // Sin setState acá: mientras carga, ready ya es false por clave distinta.
    // El await es load-bearing: exportar antes del onload sale negro.
    void loadImageElement(artwork ?? photoUrl ?? "").then(
      (image) => {
        if (cancelled) return;
        if (artwork) {
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          ctx.drawImage(image, 0, 0);
        } else {
          // Fallback local en 4:5, la misma proporción de las láminas IA.
          canvas.width = 1080;
          canvas.height = 1350;
          drawSlide(ctx, image, slide, key, result.designData?.secondaryColorHex ?? "#126644");
        }
        setReadyInfo({ key, ready: true });
      },
      () => {
        if (cancelled) return;
        setReadyInfo({ key, ready: false });
      },
    );
    return () => { cancelled = true; };
  }, [slide, active, photoUrl, result.designData, artwork]);

  if (!slide) return null;
  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || privacyBlocked) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${result.skuId}-carrusel-${active + 1}.png`;
    a.click();
  };

  return (
    <section className="space-y-4 rounded-xl border border-night-rule bg-night-panel p-4">
      <div className="flex flex-wrap gap-2" aria-label="Láminas del carrusel">
        {slides.map((item, i) => (
          <button key={item.stage} type="button" onClick={() => setActive(i)} aria-pressed={active === i} className={`rounded-md border px-3 py-2 text-xs ${active === i ? "border-mint bg-mint-soft text-mint" : "border-night-rule text-paper-dim"}`}>
            {i + 1} · {labels[result.locale][i]}
          </button>
        ))}
      </div>
      <div className="mx-auto max-w-[450px] overflow-hidden rounded-lg">
        {privacyBlocked && <p className="p-6 text-sm text-amber-300" role="alert">La lámina puede mostrar información sensible. Ocultá esos datos en la foto original y generá nuevamente.</p>}
        <canvas ref={canvasRef} role="img" aria-label={`${labels[result.locale][active]}: ${slide.headline}`} className={privacyBlocked ? "hidden" : "block h-auto w-full"} style={{ aspectRatio: "4 / 5" }} />
      </div>
      <p className="text-sm text-paper-dim">{slide.body}</p>
      {result.carouselReviews?.[active] && <ReviewNotes review={result.carouselReviews[active]} />}
      {!artwork && <p className="text-xs text-paper-muted">Lámina local con foto original{result.carouselErrors?.[active] ? `: ${result.carouselErrors[active]}` : " (modo demo)"}.</p>}
      {active === 2 && <p className="text-xs text-paper-muted">{result.locale === "es" ? "Añade reseñas o testimonios verificados cuando estén disponibles." : result.locale === "pt" ? "Adicione avaliações verificadas quando disponíveis." : "Add verified reviews when available."}</p>}
      <button type="button" onClick={download} disabled={!ready || privacyBlocked} title={privacyBlocked ? "Revisá la información sensible" : ready ? undefined : "La lámina aún se está preparando"} className="rounded border border-mint/40 bg-mint-soft px-3 py-2 text-xs text-mint disabled:cursor-wait disabled:opacity-50">{privacyBlocked ? "Descarga bloqueada" : ready ? `Descargar lámina ${active + 1} PNG` : "Preparando lámina…"}</button>
    </section>
  );
});

function drawSlide(ctx: CanvasRenderingContext2D, img: HTMLImageElement, slide: CarouselSlide, index: number, accent: string) {
  const W = 1080, H = 1350;
  const dark = index === 0 || index === 3;
  ctx.fillStyle = dark ? "#101820" : "#f5f2eb";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  if (index === 1) {
    ctx.beginPath(); ctx.moveTo(W * .46, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * .72, H); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(0, 0, 24, H);
  }
  const imageBox = index === 1 ? { x: 560, y: 200, w: 460, h: 820 } : index === 2 ? { x: 100, y: 160, w: 880, h: 650 } : { x: 500, y: 180, w: 500, h: 700 };
  const scale = Math.min(imageBox.w / img.naturalWidth, imageBox.h / img.naturalHeight);
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
  ctx.drawImage(img, imageBox.x + (imageBox.w - w) / 2, imageBox.y + (imageBox.h - h) / 2, w, h);
  ctx.fillStyle = dark ? "#ffffff" : "#142019";
  ctx.textBaseline = "top";
  ctx.font = "700 27px system-ui, sans-serif";
  ctx.fillText(`0${index + 1} / 04`, 70, 65);
  const x = 70, y = index === 2 ? 850 : 150;
  const maxWidth = index === 2 ? 900 : 440;
  drawWrapped(ctx, slide.headline, x, y, maxWidth, 66, 4, "800");
  drawWrapped(ctx, slide.body, x, index === 2 ? 1040 : 580, maxWidth, 30, 5, "500");
  if (index === 3) {
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.roundRect(70, 1110, 500, 95, 48); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.font = "800 32px system-ui, sans-serif";
    ctx.fillText(slide.cta, 105, 1140, 430);
  }
}

function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, maxLines: number, weight: string) {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((value, i) => ctx.fillText(i === maxLines - 1 && lines.length > maxLines ? `${value}…` : value, x, y + i * size * 1.2, width));
}
