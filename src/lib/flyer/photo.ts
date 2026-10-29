/**
 * Procesamiento de la foto REAL del producto en el cliente, con Canvas 2D.
 *
 * Dos trabajos que el servidor no puede hacer (no tiene los píxeles decodificados):
 *  1) `recorte`: flood-fill desde las 4 esquinas que vuelve transparente el fondo
 *     uniforme (o con degradado suave) para que el producto quede "flotando" sin
 *     el cuadrado/esquinas blancas de la foto original. Es el equivalente local y
 *     determinista del recorte que hace la pasada de visión.
 *  2) `paleta`: extracción del color dominante del sujeto (histograma cuantizado)
 *     + variantes accent y complementaria en HSL, para que cada arquetipo de flyer
 *     vista los colores REALES del producto.
 *
 * Todo se memoiza por URL: los 3 flyers comparten el mismo resultado.
 */

export type CutoutMode = "auto" | "circle" | "float";

export type Palette = {
  /** Color principal del sujeto. */
  dominant: string;
  /** Variante saturada del dominante para acentos/badges. */
  accent: string;
  /** Complementario (tono opuesto en el círculo cromático). */
  complementary: string;
};

export type ProcessedPhoto = {
  /** Imagen original cargada (para modo "float" y fallbacks). */
  image: HTMLImageElement;
  /** Foto con el fondo recortado a transparente (misma escala de trabajo). */
  cutout: HTMLCanvasElement;
  /** Caja ajustada del sujeto dentro de `cutout`, en píxeles de trabajo. */
  bbox: { x: number; y: number; w: number; h: number };
  palette: Palette;
  /** Fracción del lienzo que quedó opaca tras el recorte (para confiar o no). */
  coverage: number;
  /** true si el flood-fill se aplicó; false si se cayó al fallback de caja. */
  cutoutApplied: boolean;
};

const cache = new Map<string, Promise<ProcessedPhoto | null>>();

export type ExpectedBbox = { x: number; y: number; width: number; height: number };

/**
 * Carga y procesa la foto una sola vez por URL (+caja esperada). Si se pasa
 * la caja de la pasada de visión (`expectedBbox`, normalizada 0..1) y el
 * recorte flood-fill discrepa de ella (IoU < 0.25: el fondo se comió al
 * sujeto, ej. carrocería gris comida desde una calle de tierra), el recorte
 * se descarta y se usa la foto completa con bordes suavizados: un fallback
 * visible siempre es mejor que un fantasma.
 */
export function getProcessedPhoto(
  photoUrl: string | null,
  expectedBbox?: ExpectedBbox | null,
): Promise<ProcessedPhoto | null> {
  if (!photoUrl) return Promise.resolve(null);
  const key = expectedBbox
    ? `${photoUrl}#${[expectedBbox.x, expectedBbox.y, expectedBbox.width, expectedBbox.height].map((v) => v.toFixed(2)).join(",")}`
    : photoUrl;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = processPhoto(photoUrl, expectedBbox ?? null).catch(() => null);
  cache.set(key, p);
  return p;
}

const WORK_MAX = 1000; // lado máximo del lienzo de trabajo (rendimiento)

async function processPhoto(url: string, expectedBbox: ExpectedBbox | null): Promise<ProcessedPhoto | null> {
  const image = await loadImage(url);
  if (!image || !image.naturalWidth || !image.naturalHeight) return null;

  const scale = Math.min(1, WORK_MAX / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));

  const base = document.createElement("canvas");
  base.width = w;
  base.height = h;
  const bctx = base.getContext("2d", { willReadFrequently: true });
  if (!bctx) return null;
  bctx.drawImage(image, 0, 0, w, h);

  const cutout = document.createElement("canvas");
  cutout.width = w;
  cutout.height = h;
  const cctx = cutout.getContext("2d", { willReadFrequently: true });
  if (!cctx) return null;
  cctx.drawImage(base, 0, 0);

  const data = cctx.getImageData(0, 0, w, h);
  const { removed, coverage } = floodFillBackground(data, w, h);
  let cutoutApplied = false;
  let bbox = { x: 0, y: 0, w, h };

  // Confiamos en el recorte sólo si quitó fondo de verdad pero no se comió el sujeto.
  if (removed && coverage > 0.04 && coverage < 0.985) {
    const candidate = tightBox(data, w, h);
    if (coverage >= 0.12 && bboxAgreesWithVision(candidate, w, h, expectedBbox)) {
      cctx.putImageData(data, 0, 0);
      cutoutApplied = true;
      bbox = candidate;
    }
  }

  const palette = extractPalette(data, w, h, cutoutApplied);

  return { image, cutout, bbox, palette, coverage, cutoutApplied };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Magic-wand desde las 4 esquinas: crece por píxeles cuyo color es cercano al del
 * vecino ya marcado como fondo. Al comparar con el vecino (no con una semilla fija)
 * sigue degradados suaves de fondo sin borrar el sujeto. Marca alpha=0 en el fondo.
 */
function floodFillBackground(
  data: ImageData,
  w: number,
  h: number,
): { removed: boolean; coverage: number } {
  const px = data.data;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const visited = new Uint8Array(w * h);
  const isBg = new Uint8Array(w * h);
  const tol = 44 * 44 * 3; // distancia euclidiana al cuadrado sobre RGB

  const dist2 = (i: number, j: number) => {
    const dr = px[i] - px[j];
    const dg = px[i + 1] - px[j + 1];
    const db = px[i + 2] - px[j + 2];
    return dr * dr + dg * dg + db * db;
  };

  const corners: Array<[number, number]> = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  const stack: number[] = [];
  for (const [cx, cy] of corners) {
    const idx = cy * w + cx;
    if (!visited[idx]) {
      visited[idx] = 1;
      isBg[idx] = 1;
      stack.push(idx);
    }
  }

  while (stack.length) {
    const idx = stack.pop() as number;
    const x = idx % w;
    const y = (idx - x) / w;
    const here = at(x, y);
    const neighbors: number[] = [];
    if (x > 0) neighbors.push(idx - 1);
    if (x < w - 1) neighbors.push(idx + 1);
    if (y > 0) neighbors.push(idx - w);
    if (y < h - 1) neighbors.push(idx + w);
    for (const n of neighbors) {
      if (visited[n]) continue;
      visited[n] = 1;
      const ni = at(n % w, (n - (n % w)) / w);
      if (dist2(here, ni) <= tol) {
        isBg[n] = 1;
        stack.push(n);
      }
    }
  }

  let opaque = 0;
  for (let i = 0; i < w * h; i++) {
    if (isBg[i]) {
      px[i * 4 + 3] = 0;
    } else {
      opaque++;
    }
  }
  const anyRemoved = opaque < w * h;
  return { removed: anyRemoved, coverage: opaque / (w * h) };
}

/** Caja ajustada (en píxeles de trabajo) de todo píxel con alpha > 8. */
function tightBox(data: ImageData, w: number, h: number): { x: number; y: number; w: number; h: number } {  const px = data.data;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 8) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return { x: 0, y: 0, w, h };
  return { x: minX, y: minY, w: Math.max(1, maxX - minX + 1), h: Math.max(1, maxY - minY + 1) };
}

/**
 * El recorte flood-fill se valida contra la caja de la pasada de visión
 * (SAM): si el IoU es bajo, el fondo se filtró dentro del sujeto (ej. gris
 * del auto comido desde la calle) y el recorte se descarta. Sin caja
 * esperada no hay nada contra qué validar: se acepta.
 */
function bboxAgreesWithVision(
  candidate: { x: number; y: number; w: number; h: number },
  w: number,
  h: number,
  expected: ExpectedBbox | null,
): boolean {
  if (!expected) return true;
  const ax0 = candidate.x / w;
  const ay0 = candidate.y / h;
  const ax1 = (candidate.x + candidate.w) / w;
  const ay1 = (candidate.y + candidate.h) / h;
  const bx0 = Math.min(1, Math.max(0, expected.x));
  const by0 = Math.min(1, Math.max(0, expected.y));
  const bx1 = Math.min(1, Math.max(0, expected.x + expected.width));
  const by1 = Math.min(1, Math.max(0, expected.y + expected.height));
  const interW = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0));
  const interH = Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
  const inter = interW * interH;
  const union =
    (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter;
  if (union <= 0) return true;
  return inter / union >= 0.25;
}

/**
 * Histograma cuantizado (4 bits por canal) del sujeto. Dominante = bucket más
 * poblado ponderado por saturación (evita que un blanco/negro de fondo gane).
 * accent = dominante con +saturación; complementary = dominante rotado 180°.
 */
function extractPalette(data: ImageData, w: number, h: number, useAlpha: boolean): Palette {
  const px = data.data;
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40000))); // ~40k muestras

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (useAlpha && px[i + 3] < 24) continue;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const e = buckets.get(key);
      if (e) {
        e.count++;
        e.r += r;
        e.g += g;
        e.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
  }

  let bestR = 128;
  let bestG = 128;
  let bestB = 128;
  let bestWeight = -1;
  for (const e of buckets.values()) {
    const r = e.r / e.count;
    const g = e.g / e.count;
    const b = e.b / e.count;
    const { s } = rgbToHsl(r, g, b);
    // Pondera por población y por croma: un gris puro casi nunca es el "producto".
    const weight = e.count * (0.35 + s);
    if (weight > bestWeight) {
      bestWeight = weight;
      bestR = r;
      bestG = g;
      bestB = b;
    }
  }

  const dominant = rgbToHex(bestR, bestG, bestB);
  const { h: hh, s: ss, l: ll } = rgbToHsl(bestR, bestG, bestB);
  const accent = hslToHex(hh, clamp01(Math.max(ss, 0.55)), clamp01(Math.min(Math.max(ll, 0.4), 0.55)));
  const complementary = hslToHex((hh + 0.5) % 1, clamp01(Math.max(ss, 0.45)), clamp01(ll));
  return { dominant, accent, complementary };
}

// ---------- utilidades de color ----------

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n) || h.length !== 6) return { r: 128, g: 128, b: 128 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  return { h, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, tIn: number) => {
    let t = tIn;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  return rgbToHex(r * 255, g * 255, b * 255);
}

/** Mezcla dos hex: t=0 -> a, t=1 -> b. */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex(A.r + (B.r - A.r) * k, A.g + (B.g - A.g) * k, A.b + (B.b - A.b) * k);
}

export function lighten(hex: string, t: number): string {
  return mix(hex, "#ffffff", t);
}

export function darken(hex: string, t: number): string {
  return mix(hex, "#000000", t);
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(alpha)})`;
}

export function isLight(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145;
}

/** Texto legible sobre un fondo dado. */
export function readableOn(bg: string): string {
  return isLight(bg) ? "#12181a" : "#ffffff";
}
