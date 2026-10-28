"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PhotoDesignData, Segmentation, StudioScene, StyleArchetype } from "@/lib/schema/campaign";
import {
  getProcessedPhoto,
  mix,
  readableOn,
  withAlpha,
  type CutoutMode,
  type ProcessedPhoto,
} from "@/lib/flyer/photo";
import { ARCHETYPE_META, buildStyleTheme, type StyleTheme } from "@/lib/flyer/style-engine";

export type FlyerCanvasHandle = {
  download: (filename: string) => void;
  toPng: () => string | null;
};

export type FlyerCanvasProps = {
  photoUrl: string | null;
  segmentation: Segmentation;
  scene: StudioScene;
  /** Arquetipo FIJO del Motor de Estilos (V1 editorial-poster, V2 split-commerce, V3 bold-dark). */
  styleArchetype: StyleArchetype;
  /** Paleta + arquetipo extraídos de la foto por la pasada de visión. */
  designData: PhotoDesignData | null;
  /** Escenario IA (camino COHERENCIA: data URL del set vacío). `null` → fondo
   * local determinista de siempre. El producto/copy se compondrán encima. */
  stageUrl?: string | null;
  badge: string;
  hook: string;
  cta: string;
  benefit: string;
  featurePills: string[];
  cutoutMode: CutoutMode;
  width?: number;
  height?: number;
  className?: string;
  story?: boolean;
};

const FONT = "'Bricolage Grotesque', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

type Rect = { x: number; y: number; w: number; h: number };
type Copy = { badge: string; hook: string; cta: string; benefit: string; pills: string[] };

type RenderArgs = {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  pp: ProcessedPhoto | null;
  /** Escenario IA pintado de fondo (cover). `null` → fondo local de siempre. */
  stage: HTMLImageElement | null;
  /** PRNG determinista por campaña (mulberry32): misma pieza en pantalla y en
   * "Descargar PNG", pero cada CAMPAÑA compone distinto (anti-plantilla). */
  rand: () => number;
  theme: StyleTheme;
  copy: Copy;
  mode: CutoutMode;
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPOSITOR DEL MOTOR DE ESTILOS GRÁFICOS
 * ═══════════════════════════════════════════════════════════════════════════
 * Dibuja un flyer publicitario sobre un <canvas> según el ARQUETIPO de
 * variante. Cada arquetipo tiene estructura geométrica, tipográfica y de
 * composición PROPIA (no hay color de fondo compartido ni "misma foto con otro
 * tinte"). El mismo render alimenta preview y "Descargar Flyer PNG".
 *
 * Regla dura de composición: cada render reserva ZONAS disjuntas para texto e
 * imagen. Ninguna pieza de texto invade la caja del producto y el producto
 * nunca se dibuja sobre la zona tipográfica.
 */
export const FlyerCanvas = forwardRef<FlyerCanvasHandle, FlyerCanvasProps>(
  function FlyerCanvas(props, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useImperativeHandle(ref, () => ({
      toPng: () => canvasRef.current?.toDataURL("image/png") ?? null,
      download: (filename: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      },
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const W = props.width ?? 768;
      const H = props.height ?? 1024;
      canvas.width = props.story ? 1080 : W;
      canvas.height = props.story ? 1920 : H;

      let cancelled = false;
      const copy: Copy = {
        badge: props.badge,
        hook: props.hook,
        cta: props.cta,
        benefit: props.benefit,
        pills: props.featurePills.filter(Boolean).slice(0, 3),
      };

      // Foto procesada + escenario IA cargan en paralelo; si el escenario
      // falla o no existe, los renderers pintan su fondo local de siempre.
      void Promise.all([
        getProcessedPhoto(props.photoUrl),
        loadImageEl(props.stageUrl ?? null),
      ]).then(([pp, stage]) => {
        if (cancelled || !ctx) return;
        // Tema derivado de los datos de diseño (visión) con fallback al
        // histograma local de la foto y, en último caso, a neutrales.
        const theme = buildStyleTheme({ designData: props.designData, palette: pp?.palette ?? null });
        // Semilla por campaña: de los textos reales (distintos en cada
        // generación) → la GEOMETRÍA también varía entre campañas; dentro de
        // la misma campaña, preview y descarga son idénticos.
        const rand = makeRand([props.styleArchetype, props.hook, props.cta, props.benefit].join("\u0001"));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        if (props.story) {
          ctx.fillStyle = theme.night;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.translate(0, 240);
          ctx.scale(1080 / W, 1440 / H);
        }
        const args: RenderArgs = {
          ctx,
          W,
          H,
          pp,
          stage,
          rand,
          theme,
          copy,
          mode: props.cutoutMode,
        };
        const renderers: Record<StyleArchetype, (args: RenderArgs) => void> = {
          "editorial-poster": renderEditorialPoster,
          "split-commerce": renderSplitCommerce,
          "bold-dark": renderBoldPromo,
        };
        renderers[props.styleArchetype](args);
        ctx.restore();
      });

      return () => {
        cancelled = true;
      };
    }, [
      props.photoUrl,
      props.stageUrl,
      props.scene,
      props.segmentation,
      props.styleArchetype,
      props.designData,
      props.badge,
      props.hook,
      props.cta,
      props.benefit,
      props.featurePills,
      props.cutoutMode,
      props.width,
      props.height,
      props.story,
    ]);

    return (
      <canvas
        ref={canvasRef}
        className={props.className}
        style={{ width: "100%", height: "auto", display: "block", aspectRatio: props.story ? "9 / 16" : "3 / 4" }}
      />
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// PRNG determinista por campaña (anti-plantilla)
// ═══════════════════════════════════════════════════════════════════════════

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 con semilla derivada de los textos reales de la campaña. Cada
 * campaña compone distinto (posición/escala/tilt/decoración dentro de reglas
 * duras), pero la pieza es estable entre re-renders y descargas. */
function makeRand(source: string): () => number {
  let a = hashSeed(source) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// V1 · EDITORIAL POSTER / MINIMAL LUXURY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Portada de revista moderna: papel marfil CONTANTE (nunca violeta ni
 * gradiente), tipografía grande arriba con contraste de pesos (sans 800 +
 * serif italic en la palabra acento), producto pequeño e integrado al sector
 * inferior derecho con sombra de apoyao — sin fondo de color, sin marco — y un
 * botón RECTANGULAR fino y pequeño anclado a la base.
 */
function renderEditorialPoster({ ctx, W, H, pp, stage, rand, theme, copy, mode }: RenderArgs) {
  const inset = W * 0.034;
  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, W, H);

  // Escenario IA (COHERENCIA) bajo el velo marfil: arriba queda papel casi
  // pleno para la zona tipográfica; abajo se trasluce el set alrededor del
  // producto. El producto REAL se dibuja encima después, inmutable.
  if (stage) {
    drawStageCover(ctx, stage, 0, 0, W, H);
    const veil = ctx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, withAlpha(theme.paper, 0.97));
    veil.addColorStop(0.35, withAlpha(theme.paper, 0.9));
    veil.addColorStop(0.7, withAlpha(theme.paper, 0.45));
    veil.addColorStop(1, withAlpha(theme.paper, 0.25));
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.strokeStyle = withAlpha(theme.ink, 0.16);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);

  const pad = W * 0.088;

  // Fila kicker: motor + badge, tracking abierto, aire editorial.
  ctx.textBaseline = "top";
  spacedText(ctx, ARCHETYPE_META["editorial-poster"].kicker, pad, H * 0.062, W * 0.021, theme.ink, W * 0.008);
  ctx.textAlign = "left";
  spacedText(ctx, copy.badge, W - pad, H * 0.063, W * 0.019, withAlpha(theme.ink, 0.5), W * 0.007, "right");

  // Titular: el protagonista. Contraste de pesos: sans extra-bold + una
  // palabra en serif italic con el acento de la foto.
  const headX = pad;
  const headY = H * 0.115;
  const headMaxW = W - pad * 2;
  const headSize = fitLuxuryHeadline(ctx, copy.hook, headMaxW, W * 0.125, H * 0.225, 3);
  drawLuxuryHeadline(ctx, copy.hook, headX, headY, headMaxW, headSize, theme.ink, theme.accent);

  // Regla fina bajo el bloque tipográfico. Variación: doble filete a veces,
  // y ancho de la marca de acento.
  const headBottom = headY + measuredLuxuryLines(ctx, copy.hook, headMaxW, headSize).length * headSize * 1.14;
  ctx.strokeStyle = withAlpha(theme.accent, 0.85);
  ctx.lineWidth = rand() < 0.4 ? 1 : 2;
  const ruleSpan = W * (0.13 + rand() * 0.09);
  line(ctx, pad, headBottom + H * 0.035, pad + ruleSpan, headBottom + H * 0.035);
  if (rand() < 0.35) {
    ctx.lineWidth = 0.5;
    line(ctx, pad, headBottom + H * 0.035 + 3.5, pad + ruleSpan * 1.35, headBottom + H * 0.035 + 3.5);
  }

  // Producto: pequeño, integrado abajo (lado según el PRNG de la campaña).
  // Sombra de apoyo suave, SIN halo, SIN marco. Escala y tilt variados por
  // campaña para que ninguna pieza repita la composición exacta.
  const productScale = 0.9 + rand() * 0.18; // 0.9–1.08
  const tilt = (rand() - 0.5) * 0.085; // ±2.4°
  const productBox: Rect = {
    x: W * (0.33 + rand() * 0.04),
    y: H * (0.45 + rand() * 0.05),
    w: W * 0.56 * productScale,
    h: H * 0.35 * productScale,
  };
  drawProduct(ctx, pp, mode, productBox, { shadow: "floor", rotation: tilt });

  // Banda base: regla + botón rectangular fino + beneficio.
  const ruleY = H * 0.872;
  ctx.strokeStyle = withAlpha(theme.ink, 0.3);
  ctx.lineWidth = 1;
  line(ctx, pad, ruleY, W - pad, ruleY);

  const btn: Rect = { x: pad, y: H * 0.902, w: W * 0.29, h: H * 0.045 };
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 0);
  ctx.stroke();
  ctx.fillStyle = theme.ink;
  ctx.font = `700 ${Math.round(W * 0.022)}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const ctaLabel = `${copy.cta}  →`;
  ctx.fillText(truncate(ctx, ctaLabel, btn.w * 0.84), btn.x + btn.w / 2, btn.y + btn.h / 2);
  ctx.textAlign = "right";
  ctx.font = `600 ${Math.round(W * 0.02)}px ${FONT}`;
  ctx.fillStyle = withAlpha(theme.ink, 0.62);
  const benefitLimit = btn.x + btn.w + W * 0.04;
  const benefitMaxW = (W - pad) - benefitLimit;
  if (benefitMaxW > W * 0.1) {
    ctx.fillText(truncate(ctx, copy.benefit.toUpperCase(), benefitMaxW), W - pad, btn.y + btn.h / 2);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

/** Medición + render del titular "lujo": sans 800 para el normal, serif
 * italic acento en la palabra destacada. Devuelve el y siguiente (base-top). */
type RichWord = { t: string; em: boolean; w: number };

function luxuryFonts(size: number) {
  return {
    main: `800 ${Math.round(size)}px ${FONT}`,
    em: `italic 400 ${Math.round(size)}px ${SERIF}`,
  };
}

function pickLuxuryWords(text: string): RichWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  let emIdx = -1;
  let best = 0;
  words.forEach((w, i) => {
    const clean = w.replace(/[^\p{L}]/gu, "");
    if (clean.length >= 4 && clean.length > best) {
      best = clean.length;
      emIdx = i;
    }
  });
  return words.map((w, i) => ({ t: w, em: i === emIdx, w: 0 }));
}

function measuredLuxuryLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number): RichWord[][] {
  const { main, em } = luxuryFonts(size);
  ctx.font = main;
  const space = ctx.measureText(" ").width;
  const lines: RichWord[][] = [];
  let cur: RichWord[] = [];
  let curW = 0;
  for (const word of pickLuxuryWords(text)) {
    ctx.font = word.em ? em : main;
    const ww = ctx.measureText(word.t).width;
    word.w = ww;
    const add = cur.length ? space + ww : ww;
    if (curW + add > maxW && cur.length) {
      lines.push(cur);
      cur = [{ ...word }];
      curW = ww;
    } else {
      cur.push(word);
      curW += add;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function fitLuxuryHeadline(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxSize: number, maxH: number, maxLines: number): number {
  let size = maxSize;
  while (size > maxSize * 0.55) {
    const lines = measuredLuxuryLines(ctx, text, maxW, size).slice(0, maxLines + 1);
    if (lines.length <= maxLines && lines.length * size * 1.14 <= maxH) return size;
    size -= Math.max(2, maxSize * 0.045);
  }
  return size;
}

function drawLuxuryHeadline(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  color: string,
  accent: string,
) {
  const { main, em } = luxuryFonts(size);
  ctx.font = main;
  const space = ctx.measureText(" ").width;
  let cy = y;
  for (const lineWords of measuredLuxuryLines(ctx, text, maxW, size)) {
    // baseline-top: la primera línea alinea su parte superior en y; el em occupies same box.
    ctx.textBaseline = "top";
    let px = x;
    for (const word of lineWords) {
      ctx.font = word.em ? em : main;
      ctx.fillStyle = word.em ? accent : color;
      // La serif italic "cuelga" un poco menos: corrección óptica mínima.
      ctx.fillText(word.t, px, cy + (word.em ? size * 0.06 : 0));
      px += word.w + space;
    }
    cy += size * 1.14;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 · SPLIT E-COMMERCE / HIGH CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Split asimétrico 50/50: el FONDO completo usa el degradado dominante→
 * secundario extraído de la foto; la DERECHA es la franja de la foto con la
 * tarjeta del producto (sombra 3D + marco fino flotante); la IZQUIERDA es la
 * plataforma de conversión: kicker, titular, 3 beneficios con check y un CTA
 * grande y visible. Tipografía toda-sans, blanca/contraste según el degradé.
 */
function renderSplitCommerce({ ctx, W, H, pp, stage, rand, theme, copy, mode }: RenderArgs) {
  // 1. Fondo: degradé real de la foto (dominante → secundario).
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, theme.gradientStops[0]);
  bg.addColorStop(1, theme.gradientStops[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 2. Composición espejada por campaña: la tarjeta del producto puede ir a
  // la DERECHA (clásico) IZQUIERDA. Variación de escala y tilt también.
  const mirror = rand() < 0.5;
  const cardScale = 0.97 + rand() * 0.06; // 0.97–1.03
  const cardY = H * (0.07 + (rand() - 0.5) * 0.02);
  const cardH = H * 0.86 * cardScale;
  const panel: Rect = mirror
    ? { x: W * 0.06, y: cardY, w: W * 0.415, h: cardH }
    : { x: W * 0.525, y: cardY, w: W * 0.415, h: cardH };
  const radius = W * 0.032;
  const depthShift = mirror ? -W * 0.02 : W * 0.02;

  // Bloque de profundidad (x-offset) → look 3D de plataforma.
  ctx.fillStyle = withAlpha(mix(theme.dominant, "#000000", 0.5), 0.85);
  roundRectPath(ctx, panel.x + depthShift, panel.y + H * 0.022, panel.w, panel.h, radius);
  ctx.fill();

  // Tarjeta principal. Con escenario IA (COHERENCIA) la base es el set vacío
  // tapizado con un velo; sin él, el degradé de siempre. En ambos casos con
  // sombra proyectada nativa.
  if (stage) {
    // Sombra: fill sólido del path (cubierto luego por el set).
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = -14;
    ctx.shadowOffsetY = 20;
    roundRectPath(ctx, panel.x, panel.y, panel.w, panel.h, radius);
    ctx.fillStyle = mix(theme.dominant, "#000000", 0.5);
    ctx.fill();
    ctx.restore();

    // Set IA de base + velo suave, recortados al radio de la tarjeta.
    ctx.save();
    roundRectPath(ctx, panel.x, panel.y, panel.w, panel.h, radius);
    ctx.clip();
    drawStageCover(ctx, stage, panel.x, panel.y, panel.w, panel.h);
    ctx.fillStyle = withAlpha(mix(theme.dominant, "#ffffff", 0.55), 0.32);
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.restore();
  } else {
    const pg = ctx.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.h);
    pg.addColorStop(0, mix(theme.dominant, "#ffffff", 0.66));
    pg.addColorStop(1, mix(theme.secondary, "#ffffff", 0.76));
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = -14;
    ctx.shadowOffsetY = 20;
    roundRectPath(ctx, panel.x, panel.y, panel.w, panel.h, radius);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.restore();
  }

  // Marco fino sofisticado (doble filete interior).
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  roundRectPath(
    ctx,
    panel.x + W * 0.009,
    panel.y + W * 0.009,
    panel.w - W * 0.018,
    panel.h - W * 0.018,
    radius * 0.75,
  );
  ctx.stroke();

  // Producto protagonista dentro de la tarjeta (escala y tilt por campaña).
  const inner: Rect = {
    x: panel.x + panel.w * 0.09,
    y: panel.y + H * 0.065,
    w: panel.w * 0.82,
    h: panel.h - H * 0.18,
  };
  drawProduct(ctx, pp, mode, inner, { shadow: "floor", rotation: (rand() - 0.5) * 0.055 });

  // Chip de la oferta flotando sobre la esquina inferior izquierda de la foto.
  drawChip(
    ctx,
    panel.x - W * 0.02,
    panel.y + panel.h - H * 0.062,
    copy.badge,
    theme.accent,
    theme.ink,
    W * 0.023,
  );

  // 3. Columna de conversión (lado espejado o derecho según la campaña).
  const pad = mirror ? W * 0.535 : W * 0.06;
  const colRight = mirror ? W * 0.94 : W * 0.47;
  const colW = colRight - pad;
  const st = theme.splitText;

  ctx.textBaseline = "top";
  spacedText(
    ctx,
    ARCHETYPE_META["split-commerce"].kicker,
    pad,
    H * 0.062,
    W * 0.02,
    withAlpha(st, 0.85),
    W * 0.008,
  );

  // Titular flexible entre kicker y bloque de beneficios.
  const headY = H * 0.12;
  const headMaxH = H * 0.3;
  const headSize = fitHeadline(ctx, copy.hook, colW, W * 0.088, headMaxH, 3);
  drawHeadline(ctx, copy.hook, pad, headY, colW, headSize, st);

  // Beneficios anclados por ARRIBA del CTA — nunca invaden ni la foto ni el botón.
  const buttonH = H * 0.082;
  const buttonY = H - H * 0.14 - buttonH / 2 + H * 0.01;
  const rows = (copy.pills.length ? copy.pills : [copy.benefit]).slice(0, 3);
  const rowSize = W * 0.024;
  const rowH = rowSize * 2.35;
  const rowGap = H * 0.026;
  const rowsBlock = rows.length * rowH + (rows.length - 1) * rowGap;
  const rowsTop = buttonY - H * 0.045 - rowsBlock;

  let ry = Math.min(Math.max(rowsTop, H * 0.52), buttonY - rowsBlock - H * 0.02);
  for (const row of rows) {
    ry = drawBenefitRow(ctx, pad, ry, truncate(ctx, row, colW - rowSize * 3), rowSize, theme.accent, st) + rowGap;
  }

  // Separador fino entre beneficios y CTA.
  ctx.strokeStyle = withAlpha(st, 0.28);
  ctx.lineWidth = 1;
  line(ctx, pad, ry + H * 0.012, pad + colW * 0.55, ry + H * 0.012);

  // CTA grande y visible, anclado al fondo del panel de conversión.
  const btn: Rect = { x: pad, y: H - H * 0.152, w: colW, h: buttonH };
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, btn.h * 0.14);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = theme.accentText;
  ctx.font = `800 ${Math.round(W * 0.042)}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(truncate(ctx, `${copy.cta}  →`, btn.w * 0.86), btn.x + btn.w / 2, btn.y + btn.h / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// ═══════════════════════════════════════════════════════════════════════════
// V3 · BOLD PROMO / DARK MODE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Alto impacto comercial: fondo negro/azul noche; titular centrado grande
 * arriba; producto CENTRADO con halo de luz y borde brillante del acento de la
 * foto + anillo punteado; sello flotante (badge/oferta) en esquina; línea de
 * beneficio centrada; y CTA tipo BANNER ancho en la base.
 */
function renderBoldPromo({ ctx, W, H, pp, stage, rand, theme, copy, mode }: RenderArgs) {
  // Fondo noche + baños de color diagonales muy tenues.
  ctx.fillStyle = theme.night;
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createLinearGradient(0, 0, W, H);
  wash.addColorStop(0, withAlpha(theme.dominant, 0.16));
  wash.addColorStop(0.5, "rgba(0,0,0,0)");
  wash.addColorStop(1, withAlpha(theme.secondary, 0.14));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // Escenario IA (COHERENCIA) bajo velo noche: el set nocturno trasluce
  // alrededor del producto REAL que se compondrá encima. Scrims top/bottom
  // garantizan el contraste del texto blanco.
  if (stage) {
    drawStageCover(ctx, stage, 0, 0, W, H);
    ctx.fillStyle = withAlpha(theme.night, 0.5);
    ctx.fillRect(0, 0, W, H);
    const topScrim = ctx.createLinearGradient(0, 0, 0, H * 0.32);
    topScrim.addColorStop(0, withAlpha(theme.night, 0.92));
    topScrim.addColorStop(1, withAlpha(theme.night, 0));
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, 0, W, H * 0.32);
    const bottomScrim = ctx.createLinearGradient(0, H * 0.72, 0, H);
    bottomScrim.addColorStop(0, withAlpha(theme.night, 0));
    bottomScrim.addColorStop(1, withAlpha(theme.night, 0.95));
    ctx.fillStyle = bottomScrim;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
  }

  // Titular centrado grande arriba (zona reservada 0.05–0.28).
  ctx.textBaseline = "top";
  spacedText(
    ctx,
    ARCHETYPE_META["bold-dark"].kicker,
    W / 2,
    H * 0.052,
    W * 0.021,
    theme.accent,
    W * 0.01,
    "center",
  );

  ctx.textAlign = "center";
  const headMaxW = W * (0.56 + rand() * 0.12);
  const headSize = fitHeadline(ctx, copy.hook, headMaxW, W * 0.102, H * 0.15, 2);
  let ty = H * 0.102;
  for (const lw of layoutWords(ctx, toWords(copy.hook), headMaxW, headSize)) {
    drawRichLineCentered(ctx, lw, W / 2, ty, headSize, "#ffffff", theme.accent);
    ty += headSize * 1.08;
  }
  ctx.textAlign = "left";

  // Producto centrado con halo + borde brillante. Escala, posición vertical y
  // tilt variados por campaña (PRNG), halo alterna acento/secundario.
  const pScale = 0.44 + rand() * 0.16;
  const pTilt = (rand() - 0.5) * 0.12; // ±3.4°
  const pbCentered: Rect = {
    x: W / 2 - (W * pScale) / 2,
    y: H * (0.3 + rand() * 0.045),
    w: W * pScale,
    h: H * 0.42,
  };
  const pb = pbCentered;
  const ccx = pb.x + pb.w / 2;
  const ccy = pb.y + pb.h / 2;
  const glow = rand() < 0.5 ? theme.accent : mix(theme.accent, theme.secondary, 0.55);

  radial(ctx, ccx, ccy, W * 0.5, withAlpha(glow, 0.3));
  radial(ctx, ccx, pb.y + pb.h, W * 0.3, withAlpha(glow, 0.22));
  drawProduct(ctx, pp, mode, pb, { shadow: "none", rotation: pTilt });

  // Borde brillante (halo) alrededor del producto.
  ctx.save();
  roundRectPath(ctx, pb.x - W * 0.026, pb.y - W * 0.026, pb.w + W * 0.052, pb.h + W * 0.052, W * 0.045);
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 30;
  ctx.stroke();
  ctx.stroke();
  ctx.restore();

  // Anillo punteado exterior (a veces fuera; variación por campaña).
  if (rand() < 0.65) {
    ctx.save();
    ctx.setLineDash([2, 12]);
    ctx.strokeStyle = withAlpha(glow, 0.5);
    ctx.lineWidth = 1.5;
    circle(ctx, ccx, ccy, W * 0.36);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
  }

  // Sello flotante (oferta): esquina según el PRNG (3 posiciones).
  const sealPos = Math.floor(rand() * 3);
  const sealCfg: Array<{ x: number; y: number; rot: number }> = [
    { x: W * 0.83, y: H * 0.315, rot: -0.16 },
    { x: W * 0.17, y: H * 0.315, rot: 0.16 },
    { x: W * 0.82, y: H * 0.66, rot: -0.13 },
  ];
  ctx.save();
  const se = sealCfg[sealPos];
  ctx.translate(se.x, se.y);
  ctx.rotate(se.rot);
  drawSeal(ctx, 0, 0, W * 0.078, copy.badge, theme.accent, theme.accentText);
  ctx.restore();

  // Beneficio centrado sobre el banner.
  ctx.fillStyle = withAlpha("#ffffff", 0.72);
  ctx.font = `600 ${Math.round(W * 0.023)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(truncate(ctx, copy.benefit, W * 0.72), W / 2, H * 0.845);
  ctx.textAlign = "left";

  // CTA tipo banner: ancho, casi todo el ancho, con glow.
  const btn: Rect = { x: W * 0.055, y: H * 0.9, w: W * 0.89, h: H * 0.06 };
  ctx.save();
  ctx.shadowColor = withAlpha(theme.accent, 0.8);
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, btn.h * 0.14);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = theme.accentText;
  ctx.font = `850 ${Math.round(W * 0.04)}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(truncate(ctx, `${copy.cta}  →`, btn.w * 0.9), W / 2, btn.y + btn.h / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// ═══════════════════════════════════════════════════════════════════════════
// Composición del producto (recorte + rotación + sombra/glow)
// ═══════════════════════════════════════════════════════════════════════════

/** Carga de imagen tolerante: `null` si no hay URL o si falla (fallback
 * limpio al fondo local del renderer sin romper la promesa del efecto). */
function loadImageEl(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Pinta una imagen cubriendo TODO el rect (crop centrado, sin deformar). */
function drawStageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

type ProductOpts = { shadow?: "floor" | "drop" | "glow" | "none"; rotation?: number; glowColor?: string };

function drawProduct(ctx: CanvasRenderingContext2D, pp: ProcessedPhoto | null, mode: CutoutMode, box: Rect, opts: ProductOpts) {
  if (!pp) return;
  const full = { x: 0, y: 0, w: pp.cutout.width, h: pp.cutout.height };
  const region = pp.cutoutApplied ? pp.bbox : full;

  let feather = false;
  let circle = false;
  let srcRegion = region;
  if (mode === "circle") circle = true;
  else if (mode === "float") {
    feather = true;
    srcRegion = full;
  } else if (!pp.cutoutApplied) {
    feather = true;
    srcRegion = full;
  }

  const scale = Math.min(box.w / srcRegion.w, box.h / srcRegion.h);
  const dw = srcRegion.w * scale;
  const dh = srcRegion.h * scale;
  const dx = box.x + (box.w - dw) / 2;
  const dy = box.y + (box.h - dh) / 2;
  const cx = dx + dw / 2;
  const cy = dy + dh / 2;

  const layer = buildProductLayer(pp, srcRegion, dw, dh, feather, circle);
  if (!layer) return;

  if (opts.shadow === "floor") {
    ctx.save();
    ctx.filter = "blur(7px)";
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.beginPath();
    ctx.ellipse(cx, dy + dh + 4, dw * 0.4, dh * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  if (opts.rotation) {
    ctx.translate(cx, cy);
    ctx.rotate(opts.rotation);
    ctx.translate(-cx, -cy);
  }
  if (opts.shadow === "glow" && opts.glowColor) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = opts.glowColor;
    ctx.shadowBlur = 50;
    ctx.drawImage(layer, dx, dy);
    ctx.restore();
  }
  if (opts.shadow === "drop") {
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetX = 14;
    ctx.shadowOffsetY = 18;
  }
  ctx.drawImage(layer, dx, dy);
  ctx.restore();
}

function buildProductLayer(
  pp: ProcessedPhoto,
  region: { x: number; y: number; w: number; h: number },
  dw: number,
  dh: number,
  feather: boolean,
  circle: boolean,
): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(dw));
  c.height = Math.max(1, Math.round(dh));
  const x = c.getContext("2d");
  if (!x) return null;
  if (circle) {
    x.save();
    x.beginPath();
    x.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) / 2, 0, Math.PI * 2);
    x.clip();
  }
  x.drawImage(pp.cutout, region.x, region.y, region.w, region.h, 0, 0, c.width, c.height);
  if (circle) x.restore();
  if (feather) {
    x.globalCompositeOperation = "destination-in";
    featherEdges(x, c.width, c.height, Math.min(c.width, c.height) * 0.16);
    x.globalCompositeOperation = "source-over";
  }
  return c;
}

function featherEdges(ctx: CanvasRenderingContext2D, w: number, h: number, f: number) {
  const band = (x0: number, y0: number, x1: number, y1: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  band(0, 0, 0, f);
  band(0, h, 0, h - f);
  band(0, 0, f, 0);
  band(w, 0, w - f, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Primitivas de dibujo
// ═══════════════════════════════════════════════════════════════════════════

/** Texto MAYÚSCULAS con tracking manual (kickers/editoriales). */
function spacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  tracking: number,
  align: "left" | "right" | "center" = "left",
) {
  const chars = [...text.toUpperCase()];
  ctx.font = `800 ${Math.round(size)}px ${FONT}`;
  ctx.textBaseline = "top";
  ctx.fillStyle = color;
  let total = 0;
  const widths = chars.map((c) => {
    const w = ctx.measureText(c).width;
    total += w + (c === " " ? tracking * 3 : tracking);
    return w;
  });
  let px = align === "center" ? x - total / 2 + tracking : align === "right" ? x - total + tracking : x;
  chars.forEach((c, i) => {
    ctx.fillText(c, px, y);
    px += widths[i] + (c === " " ? tracking * 3 : tracking);
  });
}

function toWords(text: string): { t: string; em: boolean }[] {
  const words = text.split(/\s+/).filter(Boolean);
  let emIdx = -1;
  let best = 0;
  words.forEach((w, i) => {
    const clean = w.replace(/[^\p{L}]/gu, "");
    if (clean.length >= 4 && clean.length > best) {
      best = clean.length;
      emIdx = i;
    }
  });
  return words.map((w, i) => ({ t: w, em: i === emIdx }));
}

/** Layout de palabras: miden cada palabra con su propia fuente para que el
 * italic-serif (em) no desalinee el corte de línea. */
function layoutWords(
  ctx: CanvasRenderingContext2D,
  words: { t: string; em: boolean }[],
  maxW: number,
  size: number,
): { t: string; em: boolean; w: number }[][] {
  const nf = `800 ${size}px ${FONT}`;
  const ef = `italic 800 ${size}px ${FONT}`;
  ctx.font = nf;
  const space = ctx.measureText(" ").width;
  const lines: { t: string; em: boolean; w: number }[][] = [];
  let cur: { t: string; em: boolean; w: number }[] = [];
  let curW = 0;
  for (const word of words) {
    ctx.font = word.em ? ef : nf;
    const ww = ctx.measureText(word.t).width;
    const add = cur.length ? space + ww : ww;
    if (curW + add > maxW && cur.length) {
      lines.push(cur);
      cur = [{ ...word, w: ww }];
      curW = ww;
    } else {
      cur.push({ ...word, w: ww });
      curW += add;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function drawRichLine(
  ctx: CanvasRenderingContext2D,
  line: { t: string; em: boolean; w: number }[],
  x: number,
  y: number,
  size: number,
  color: string,
  accent: string,
) {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `800 ${size}px ${FONT}`;
  const space = ctx.measureText(" ").width;
  let px = x;
  for (const word of line) {
    ctx.font = word.em ? `italic 800 ${size}px ${FONT}` : `800 ${size}px ${FONT}`;
    ctx.fillStyle = word.em ? accent : color;
    ctx.fillText(word.t, px, y);
    px += word.w + space;
  }
}

function drawRichLineCentered(
  ctx: CanvasRenderingContext2D,
  line: { t: string; em: boolean; w: number }[],
  centerX: number,
  y: number,
  size: number,
  color: string,
  accent: string,
) {
  ctx.font = `800 ${size}px ${FONT}`;
  const space = ctx.measureText(" ").width;
  const total = line.reduce((s, w) => s + w.w, 0) + space * Math.max(0, line.length - 1);
  drawRichLine(ctx, line, centerX - total / 2, y, size, color, accent);
}

/** Devuelve el siguiente y (base-top) tras dibujar el titular multilinea. */
function drawHeadline(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, color: string): number {
  ctx.fillStyle = color;
  ctx.font = `850 ${size}px ${FONT}`;
  ctx.textBaseline = "top";
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      cy += size * 1.08;
      line = w;
    } else line = test;
  }
  if (line) {
    ctx.fillText(line, x, cy);
    cy += size * 1.08;
  }
  return cy;
}

/** Elige el mayor tamaño (de una escala) donde el titular entra en el área dada. */
function fitHeadline(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxSize: number, maxH: number, maxLines: number): number {
  let size = maxSize;
  while (size > maxSize * 0.55) {
    const lines = layoutWords(ctx, toWords(text), maxW, size).slice(0, maxLines + 1);
    if (lines.length <= maxLines && lines.length * size * 1.08 <= maxH) return size;
    size -= Math.max(2, maxSize * 0.04);
  }
  return size;
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  dotColor: string,
  fg: string,
  size: number,
): number {
  const label = text.toUpperCase();
  ctx.font = `800 ${Math.round(size)}px ${FONT}`;
  const dotR = size * 0.52;
  const gap = size * 0.55;
  const tw = ctx.measureText(label).width;
  const w = dotR * 2 + gap + tw + size * 0.8;
  const h = size * 2.2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x + dotR + size * 0.35, y + h / 2, dotR, 0, Math.PI * 2);
  ctx.fillStyle = dotColor;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(label, x + dotR * 2 + gap + size * 0.35, y + h / 2 + 1);
  ctx.textBaseline = "top";
  return y + h;
}

/** Fila de beneficio con check circular del acento. Devuelve el y siguiente. */
function drawBenefitRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  size: number,
  accent: string,
  fg: string,
): number {
  const checkR = size * 0.95;
  const gap = size * 0.7;
  const h = checkR * 2;
  ctx.beginPath();
  ctx.arc(x + checkR, y + h / 2, checkR, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.strokeStyle = readableOn(accent);
  ctx.lineWidth = Math.max(2, size * 0.24);
  const bx = x + checkR;
  const by = y + h / 2;
  ctx.beginPath();
  ctx.moveTo(bx - checkR * 0.4, by);
  ctx.lineTo(bx - checkR * 0.04, by + checkR * 0.38);
  ctx.lineTo(bx + checkR * 0.45, by - checkR * 0.42);
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = `700 ${Math.round(size)}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + checkR * 2 + gap, by + 1);
  ctx.textBaseline = "top";
  return y + h;
}

function drawSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, text: string, bg: string, fg: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.shadowColor = withAlpha(bg, 0.9);
  ctx.shadowBlur = 22;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(fg, 0.55);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = r * 0.3;
  ctx.font = `800 ${Math.round(size)}px ${FONT}`;
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > r * 1.3 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  const lh = size * 1.1;
  let y = cy - ((lines.length - 1) * lh) / 2;
  for (const ln of lines) {
    ctx.fillText(ln, cx, y);
    y += lh;
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.restore();
}

function radial(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
