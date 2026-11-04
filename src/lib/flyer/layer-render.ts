import type { LayoutLayers } from "./layers";

/** Both preview and PNG use this exact canvas renderer at export resolution. */
export type LayerFonts = Record<"display" | "serif" | "sans", string>;
export function inkForBrightness(brightness: number | null, proposed: string): string {
  if (brightness !== null) return brightness < .35 ? "#FFFFFF" : "#262320";
  return proposed.toLowerCase() === "#ffffff" ? "#262320" : proposed;
}

// ═══════════════════════════════════════════════════════════════════════════
// Encaje anti-sujeto: antes de dibujar, la caja del titular (+apoyo) se mueve
// a la zona libre real de la foto. El planificador LLM posiciona a ciegas y
// el revisor inspecciona el arte crudo, así que sin esto el texto cae sobre
// caras o prendas. Núcleo puro (testeable en node) + muestreo DOM mínimo.
// ═══════════════════════════════════════════════════════════════════════════

export type BusyGrid = { cols: number; rows: number; cells: number[]; luma?: number[] };

const BUSY_COLS = 27;
const BUSY_THRESHOLD = 0.08;

/** Media del gradiente de brillo y luminancia por celda (0 = plano como cielo pared; alto = cara, ropa, follaje, texto o botón). */
export function sampleBusyGrid(getLuma: (x: number, y: number) => number, W: number, H: number, cols = BUSY_COLS): BusyGrid {
  const rows = Math.max(8, Math.round((cols * H) / W));
  const cells = new Array<number>(cols * rows).fill(0);
  const luma = new Array<number>(cols * rows).fill(0);
  const counts = new Array<number>(cols * rows).fill(0);
  const cw = W / cols;
  const ch = H / rows;
  for (let y = 1; y < H - 1; y += 2) {
    for (let x = 1; x < W - 1; x += 2) {
      const l = getLuma(x, y);
      const g = Math.abs(getLuma(x + 1, y) - getLuma(x - 1, y)) + Math.abs(getLuma(x, y + 1) - getLuma(x, y - 1));
      const idx = Math.min(rows - 1, Math.floor(y / ch)) * cols + Math.min(cols - 1, Math.floor(x / cw));
      cells[idx] += g;
      luma[idx] += l;
      counts[idx] += 1;
    }
  }
  for (let i = 0; i < cells.length; i++) {
    cells[i] = counts[i] ? cells[i] / counts[i] : 0;
    luma[i] = counts[i] ? luma[i] / counts[i] : 0;
  }
  return { cols, rows, cells, luma };
}

/** Ocupación media del rectángulo en porcentajes (0-100). */
export function zoneBusy(grid: BusyGrid, x0: number, x1: number, y0: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let r = 0; r < grid.rows; r++) {
    const cy = ((r + 0.5) / grid.rows) * 100;
    if (cy < y0 || cy > y1) continue;
    for (let c = 0; c < grid.cols; c++) {
      const cx = ((c + 0.5) / grid.cols) * 100;
      if (cx < x0 || cx > x1) continue;
      sum += grid.cells[r * grid.cols + c];
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Mejor Y (en %) para una caja de texto: recorre la ventana vertical y elige
 * la franja más libre; a igualdad, la más cercana a la preferida.
 */
export function findClearY(
  grid: BusyGrid,
  x0: number,
  x1: number,
  boxHPct: number,
  yMin: number,
  yMaxTop: number,
  preferredY: number,
): { y: number; busy: number } {
  let best = { y: preferredY, busy: Number.POSITIVE_INFINITY };
  const top = Math.min(yMaxTop, 100 - boxHPct);
  for (let y = yMin; y <= top + 1e-9; y += 2) {
    const busy = zoneBusy(grid, x0, x1, y, y + boxHPct);
    const better = busy < best.busy - 1e-9 || (Math.abs(busy - best.busy) <= 1e-9 && Math.abs(y - preferredY) < Math.abs(best.y - preferredY));
    if (better) best = { y, busy };
  }
  return best;
}

/**
 * Esquina más libre para el logo de marca: compara las 4 esquinas (`right`,
 * `left`, `top-right`, `top-left`) con una ventana de seguridad extendida hacia
 * el interior del arte (para detectar botones CTA, pastillas de beneficios o
 * titulares cercanos aunque su borde sea liso) y elige siempre la más limpia.
 * Solo ante empate práctico (<0.012) prefiere la esquina inferior derecha por
 * convención publicitaria. Puro y testeable en node.
 */
export type LogoCorner = "left" | "right" | "top-left" | "top-right";
export type LogoForcedSide = "left" | "right";
export function pickLogoCorner(
  grid: BusyGrid,
  boxWPct: number,
  boxHPct: number,
  marginXPct = 3,
  /** Borde inferior máximo permitido (87 en story por safe zones, 97.5 en feed). */
  maxBottomPct = 100 - 2.5,
  /** Margen superior mínimo cuando se evalúan esquinas altas (15 en story por safe zones, 3 en feed). */
  minTopPct = 3,
  /** Esquina inferior fijada por el usuario: ignora el auto-pick y usa ese lado. */
  forcedSide?: LogoForcedSide | null,
): { corner: LogoCorner; x: number; y: number; busy: number } {
  const yBottom0 = maxBottomPct - boxHPct;
  const padX = 4.5;
  const padY = 2.5;

  const scoreZone = (x: number, y: number): number => {
    const sx0 = Math.max(0, x - padX);
    const sx1 = Math.min(100, x + boxWPct + padX);
    const sy0 = Math.max(0, y - padY);
    const sy1 = Math.min(100, y + boxHPct + padY);
    const avg = zoneBusy(grid, sx0, sx1, sy0, sy1);
    let peak = 0;
    let lSum = 0;
    let lSq = 0;
    let count = 0;
    for (let r = 0; r < grid.rows; r++) {
      const cy = ((r + 0.5) / grid.rows) * 100;
      if (cy < sy0 || cy > sy1) continue;
      for (let c = 0; c < grid.cols; c++) {
        const cx = ((c + 0.5) / grid.cols) * 100;
        if (cx < sx0 || cx > sx1) continue;
        const idx = r * grid.cols + c;
        const v = grid.cells[idx];
        if (v > peak) peak = v;
        if (grid.luma) {
          const l = grid.luma[idx];
          lSum += l;
          lSq += l * l;
        }
        count++;
      }
    }
    const lStd = count && grid.luma ? Math.sqrt(Math.max(0, lSq / count - (lSum / count) ** 2)) : 0;
    return avg * 0.55 + peak * 0.45 + lStd * 0.25;
  };

  // Evaluamos SIEMPRE las 4 esquinas en igualdad de condiciones, con un leve
  // sesgo de desempate (bias) a favor de las esquinas inferiores solo cuando
  // están igual de limpias que las superiores. Si abajo hay un botón CTA,
  // pastillas o producto, la esquina superior libre gana automáticamente.
  // Con esquina fijada por el usuario se respeta ese lado aunque esté más
  // ocupado: el prompt ya reservó esa esquina y el CTA no la invade.
  const candidates: Array<{ corner: LogoCorner; x: number; y: number; bias: number }> = [
    { corner: "right", x: 100 - marginXPct - boxWPct, y: yBottom0, bias: 0 },
    { corner: "left", x: marginXPct, y: yBottom0, bias: 0.001 },
    { corner: "top-right", x: 100 - marginXPct - boxWPct, y: minTopPct, bias: 0.045 },
    { corner: "top-left", x: marginXPct, y: minTopPct, bias: 0.046 },
  ];
  if (forcedSide === "left" || forcedSide === "right") {
    const pinned = candidates.find((c) => c.corner === forcedSide)!;
    return { corner: pinned.corner, x: pinned.x, y: pinned.y, busy: scoreZone(pinned.x, pinned.y) };
  }

  let best = {
    corner: candidates[0].corner,
    x: candidates[0].x,
    y: candidates[0].y,
    busy: Number.POSITIVE_INFINITY,
    rankScore: Number.POSITIVE_INFINITY,
  };

  for (const c of candidates) {
    const busy = scoreZone(c.x, c.y);
    const rankScore = busy + c.bias;
    if (rankScore < best.rankScore - 1e-9) {
      best = { corner: c.corner, x: c.x, y: c.y, busy, rankScore };
    }
  }
  return { corner: best.corner, x: best.x, y: best.y, busy: best.busy };
}

/** Read the photographic pixels before scrims/text. Median rejects isolated highlights. */
function readingBrightness(ctx: CanvasRenderingContext2D, item: LayoutLayers["headline"], layers: LayoutLayers, width: number, height: number): number | null {
  try {
    const x = Math.round(width * item.x / 100), y = Math.round(height * item.y / 100);
    const w = Math.max(1, Math.min(width - x, Math.round(width * item.maxWidth / 100)));
    const h = Math.max(1, Math.min(height - y, Math.round(item.fontSize * width / 1080 * item.lineHeight * 3)));
    const { data } = ctx.getImageData(x, y, w, h);
    const samples: number[] = [];
    const panel = layers.copyPanel;
    for (let sy = 0; sy < h; sy += Math.max(1, Math.floor(h / 12))) {
      for (let sx = 0; sx < w; sx += Math.max(1, Math.floor(w / 12))) {
        const i = (sy * w + sx) * 4;
        let r = data[i], g = data[i + 1], b = data[i + 2];
        if (panel && (x + sx) / width * 100 >= panel.x && (x + sx) / width * 100 <= panel.x + panel.width && (y + sy) / height * 100 <= panel.height) {
          const rgb = panel.color.slice(1).match(/../g)!.map(v => parseInt(v, 16));
          r = r * (1 - panel.opacity) + rgb[0] * panel.opacity;
          g = g * (1 - panel.opacity) + rgb[1] * panel.opacity;
          b = b * (1 - panel.opacity) + rgb[2] * panel.opacity;
        }
        samples.push((r * .2126 + g * .7152 + b * .0722) / 255);
      }
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] ?? null;
  } catch { return null; }
}

/**
 * Reubica titular (+apoyo, que lo sigue) a la franja libre de la foto real.
 * Respeta el lado elegido (x/align) salvo que el sujeto ocupe todo el alto,
 * en cuyo caso prueba el lado espejado. Con copyPanel el texto vive sobre la
 * banda: solo se ajusta Y dentro de ella. Nunca muta la entrada.
 */
export function fitLayersToPhoto(
  ctx: CanvasRenderingContext2D,
  layers: LayoutLayers,
  width: number,
  height: number,
  story: boolean,
  fonts: LayerFonts,
): LayoutLayers {
  let grid: BusyGrid;
  try {
    const W = Math.round(width);
    const H = Math.round(height);
    const { data } = ctx.getImageData(0, 0, W, H);
    const luma = (x: number, y: number) => {
      const o = (y * W + x) * 4;
      return (data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722) / 255;
    };
    grid = sampleBusyGrid(luma, W, H);
  } catch {
    return layers;
  }

  const scale = width / 1080;
  const measure = (text: string, fontSize: number, family: string, weight: number, maxPx: number): number => {
    ctx.font = `${weight} ${fontSize * scale}px ${family}`;
    let lines = 0;
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxPx) {
        lines++;
        line = word;
      } else {
        line = next;
      }
    }
    return lines + (line ? 1 : 0);
  };

  const head = layers.headline;
  const headFam = fonts[head.fontFamily ?? "display"];
  const headWeight = typeof head.fontWeight === "number" ? head.fontWeight : head.fontWeight === "bold" ? 800 : 400;
  const headMaxPx = (width * head.maxWidth) / 100;
  const headLines = Math.max(1, measure(head.text, head.fontSize, headFam, headWeight, headMaxPx));
  let blockHPx = headLines * head.fontSize * scale * head.lineHeight;
  const sub = layers.subheadline;
  if (sub) {
    const subFam = fonts[sub.fontFamily ?? "sans"];
    const subWeight = typeof sub.fontWeight === "number" ? sub.fontWeight : sub.fontWeight === "bold" ? 800 : 400;
    const subLines = Math.max(1, measure(sub.text, sub.fontSize, subFam, subWeight, (width * sub.maxWidth) / 100));
    blockHPx += subLines * sub.fontSize * scale * sub.lineHeight + 12 * scale;
  }
  const blockH = (blockHPx / height) * 100;

  const panel = layers.copyPanel;
  const yFloor = story ? 16 : 4;
  const yCeil = (panel ? panel.height : layers.cta.y) - 3 - blockH;
  if (yCeil <= yFloor) return layers;

  const gap = sub ? sub.y - head.y : 0;
  const place = (x: number, maxWidth: number, align: LayoutLayers["headline"]["align"]) => {
    const x0 = x;
    const x1 = Math.min(100, x + maxWidth);
    const current = zoneBusy(grid, x0, x1, head.y, head.y + blockH);
    const best = findClearY(grid, x0, x1, blockH, yFloor, yCeil, head.y);
    const keep = current <= BUSY_THRESHOLD || best.busy >= current - 0.01;
    const y = keep ? head.y : best.y;
    const nextHead = { ...head, x, maxWidth, align, y };
    const nextSub = sub ? { ...sub, x, maxWidth, align, y: y + gap } : null;
    return { layers: { ...layers, headline: nextHead, subheadline: nextSub }, busy: keep ? current : best.busy };
  };

  const planned = place(head.x, head.maxWidth, head.align);
  if (planned.busy <= BUSY_THRESHOLD || panel || head.maxWidth > 60) return planned.layers;

  // Sujeto de alto completo: probar el lado espejado antes de rendirse.
  const mirrorX = Math.max(0, 100 - head.maxWidth - head.x);
  const mirrorAlign = head.align === "left" ? "right" : head.align === "right" ? "left" : head.align;
  const mirrored = place(mirrorX, head.maxWidth, mirrorAlign);
  return mirrored.busy < planned.busy - 0.015 ? mirrored.layers : planned.layers;
}

export function drawLayers(ctx: CanvasRenderingContext2D, layers: LayoutLayers, width: number, height: number, story: boolean, fonts: LayerFonts = { display: "Arial, sans-serif", serif: "Georgia, serif", sans: "Arial, sans-serif" }, opts: { autoFit?: boolean } = {}) {
  if (opts.autoFit !== false) layers = fitLayersToPhoto(ctx, layers, width, height, story, fonts);
  const scale = width / 1080;
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  const inks = new Map([layers.headline, layers.subheadline].filter((item) => item !== null).map(item => [item, inkForBrightness(readingBrightness(ctx, item, layers, width, height), item.color)]));
  const drawText = (item: LayoutLayers["headline"]) => {
    let size = item.fontSize * scale;
    const max = width * item.maxWidth / 100;
    const left = width * item.x / 100;
    const top = height * item.y / 100;
    const family = fonts[item.fontFamily ?? (item === layers.headline ? "display" : "sans")];
    const weight = typeof item.fontWeight === "number" ? item.fontWeight : item.fontWeight === "bold" ? 800 : 400;
    const spacing = item.fontFamily === "serif" ? -.005 : weight >= 700 ? -.02 : 0;
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.letterSpacing = `${spacing * size}px`;
    ctx.fillStyle = inks.get(item) ?? item.color;
    ctx.textBaseline = "top";
    ctx.textAlign = item.align;
    const x = left + (item.align === "center" ? max / 2 : item.align === "right" ? max : 0);
    const wrap = () => {
    const lines: string[] = [];
    for (const paragraph of item.text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > max) { lines.push(line); line = word; }
        else line = next;
      }
      lines.push(line);
    }
    return lines;
    };
    const nextY = item === layers.headline && layers.subheadline && layers.subheadline.y > item.y ? layers.subheadline.y - 3 : layers.copyPanel ? layers.copyPanel.y + layers.copyPanel.height - 3 : story ? Math.max(42, item.y + 22) : layers.cta.y - 4;
    const maxBottom = height * Math.min(story ? .74 : .82, nextY / 100);
    let lines = wrap();
    while (lines.length * size * item.lineHeight > maxBottom - top && size > 18 * scale) {
      size *= .95;
      ctx.font = `${weight} ${size}px ${family}`;
      ctx.letterSpacing = `${spacing * size}px`;
      lines = wrap();
    }
    ctx.save();
    lines.forEach((line, i) => { const y = top + i * size * item.lineHeight; if (y + size <= maxBottom) ctx.fillText(line, x, y, max); });
    ctx.restore();
  };
  const lightItems = [layers.headline, layers.subheadline].filter((item) => {
    if (!item) return false;
    return inks.get(item) === "#FFFFFF";
  });
  if (lightItems.length && !layers.copyPanel) {
    const top = 0;
    const bottom = Math.min(height, Math.max(...lightItems.map((item) => item!.y / 100 * height + item!.fontSize * scale * item!.lineHeight * 3)) + 50 * scale);
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, "rgba(0,0,0,.28)");
    gradient.addColorStop(.65, "rgba(0,0,0,.10)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save(); ctx.fillStyle = gradient; ctx.fillRect(0, top, width, bottom - top); ctx.restore();
  }
  if (layers.copyPanel) {
    const p = layers.copyPanel;
    if (p.blur && ctx.canvas) {
      ctx.save(); ctx.beginPath(); ctx.rect(width * p.x / 100, 0, width * p.width / 100, height * p.height / 100); ctx.clip();
      ctx.filter = `blur(${p.blur * scale}px)`; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = p.opacity; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.roundRect(width * p.x / 100, height * p.y / 100, width * p.width / 100, height * p.height / 100, p.borderRadius * scale); ctx.fill(); ctx.restore();
  }
  drawText(layers.headline);
  if (layers.subheadline) drawText(layers.subheadline);
  const { cta } = layers;
  const x = width * cta.x / 100, y = height * cta.y / 100;
  const buttonHeight = height * (story ? .035 : .04);
  const fontSize = Math.min((story ? 34 : 30) * scale, buttonHeight * .52);
  ctx.letterSpacing = "0px";
  ctx.font = `500 ${fontSize}px ${fonts.sans}`;
  const buttonWidth = Math.min(width - x - width * .04, cta.width ? width * cta.width / 100 : ctx.measureText(cta.text).width + 56 * scale);
  ctx.fillStyle = cta.bgColor;
  ctx.beginPath(); ctx.roundRect(x, y, buttonWidth, buttonHeight, Math.min(cta.borderRadius * scale, buttonHeight / 2)); ctx.fill();
  ctx.fillStyle = cta.textColor; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.fillText(cta.text, x + buttonWidth / 2, y + buttonHeight / 2, buttonWidth - 24 * scale);
}
