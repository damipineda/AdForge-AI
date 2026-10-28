/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOTOR DE ESTILOS GRÁFICOS (Graphic Style Engine)
 * ═══════════════════════════════════════════════════════════════════════════
 * Fuente ÚNICA de los 3 arquetipos de layout del producto:
 *
 *   V1 · editorial-poster  → Editorial Poster / Minimal Luxury (portada de
 *                            revista, tipografía protagonista, producto chico
 *                            abajo a la derecha sobre papel marfil).
 *   V2 · split-commerce    → Split E-Commerce / High Conversion (split 50/50,
 *                            foto protagonista con marco 3D a la derecha,
 *                            beneficios + CTA grande a la izquierda sobre el
 *                            degradado dominante→secundario de la foto).
 *   V3 · bold-dark         → Bold Promo / Dark Mode (fondo noche, producto
 *                            centrado con halo del acento, titular centrado,
 *                            sello flotante con la oferta y banner CTA ancho).
 *
 * El ARQUETIPO de cada variante es FIJO por posición (V1, V2, V3): nunca se
 * elige al azar ni por el modelo de copy. El modelo de visión (Muse Spark) sí
 * elige un arquetipo RECOMENDADO para el anuncio junto con la paleta real
 * (dominantColorHex / secondaryColorHex); esos datos alimentan la derivación
 * de color y el acento de los 3 flyers vía `buildStyleTheme`.
 *
 * Consumidores: schema/campaign.ts (enum de validación), FlyerCanvas y
 * GeneratedFlyerCanvas (render). Módulo DOM-safe a nivel import (los helpers
 * de color de photo.ts solo usan document dentro de funciones).
 */

import { hexToRgb, mix, readableOn, rgbToHsl, hslToHex } from "./photo";
import type { Palette } from "./photo";

// ---------------------------------------------------------------------------
// Arquetipos
// ---------------------------------------------------------------------------

export const STYLE_ARCHETYPES = [
  "editorial-poster",
  "split-commerce",
  "bold-dark",
] as const;

export type StyleArchetype = (typeof STYLE_ARCHETYPES)[number];

export type StyleArchetypeMeta = {
  /** Nombre corto para la UI. */
  label: string;
  /** Promesa de composición (una línea, para tarjetas y tooltips). */
  tagline: string;
  /** Kicker tipográfico impreso dentro del flyer. */
  kicker: string;
};

export const ARCHETYPE_META: Record<StyleArchetype, StyleArchetypeMeta> = {
  "editorial-poster": {
    label: "Editorial Poster",
    tagline: "Minimal Luxury · portada de revista",
    kicker: "ADFORGE · SELECT",
  },
  "split-commerce": {
    label: "Split E-Commerce",
    tagline: "High Conversion · split 50/50",
    kicker: "ALTO CONSUMO",
  },
  "bold-dark": {
    label: "Bold Promo",
    tagline: "Dark Mode · alto impacto",
    kicker: "DROP DESTACADO",
  },
};

/** Arquetipo FIJO por índice de variante: V1, V2 y V3 no cambian nunca. */
export function archetypeForVariant(index: number): StyleArchetype {
  return STYLE_ARCHETYPES[index % STYLE_ARCHETYPES.length];
}

// ---------------------------------------------------------------------------
// Datos de diseño extraídos de la foto (pasada de visión)
// ---------------------------------------------------------------------------

export type DesignDataLike = {
  dominantColorHex: string;
  secondaryColorHex: string;
  styleArchetype: StyleArchetype;
};

// Valores sólo para cuando ni la visión ni la foto entregaron colores válidos
// (corridas demo, fotos corruptas). Acero neutro + cobre: funciona con casi
// cualquier producto sin teñir las variantes de un color "peligroso".
const FALLBACK_DOMINANT = "#5d6470";
const FALLBACK_SECONDARY = "#b07a45";

const HEX6 = /^#([0-9a-fA-F]{6})$/;

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  let s = value.trim();
  if (HEX6.test(s)) return s.toLowerCase();
  // Tolerar #rgb expandiéndolo.
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s.slice(1).split("").map((c) => `${c}${c}`).join("")}`;
    return s.toLowerCase();
  }
  return fallback;
}

/**
 * Deriva el TEMA completo del Motor de Estilos a partir de los datos de
 * diseño (visión) con fallback al histograma local de la foto (Canvas) y, en
 * último caso, a neutrales fijos. Se usa en AMBOS compositores para que el
 * fallback local y la capa sobre arte IA hablen el mismo idioma visual.
 */
export type StyleTheme = {
  /** V1: papel marfil constante (nunca gradiente ni violeta). */
  paper: string;
  ink: string;
  /** Tono tenue para paneles suaves sobre el dominante. */
  tone: string;
  /** V3: azul-noche tintado apenas con el dominante. */
  night: string;
  /** V2: degradado dominante→secundario extraído de la foto. */
  gradientStops: [string, string];
  dominant: string;
  secondary: string;
  /** Acento saturado (badge / CTA / halo) derivado de la paleta real. */
  accent: string;
  accentText: string;
  /** Texto legible sobre el degradado del split. */
  splitText: string;
  /** Texto legible sobre el acento. */
};

export function buildStyleTheme(input: {
  designData?: DesignDataLike | null;
  palette?: Palette | null;
}): StyleTheme {
  const dominant = normalizeHex(
    input.designData?.dominantColorHex,
    normalizeHex(input.palette?.dominant, FALLBACK_DOMINANT),
  );
  const secondary = normalizeHex(
    input.designData?.secondaryColorHex,
    normalizeHex(input.palette?.complementary, FALLBACK_SECONDARY),
  );

  const accent = pickAccent(dominant, secondary);

  return {
    paper: "#f7f4ee",
    ink: "#16181d",
    tone: mix(dominant, "#ffffff", 0.8),
    night: mix("#0a0e1c", dominant, 0.05),
    gradientStops: [dominant, secondary],
    dominant,
    secondary,
    accent,
    accentText: readableOn(accent),
    splitText: readableOn(mix(dominant, secondary, 0.5)),
  };
}

/**
 * El acento es el color MÁS cromático de la paleta real, saturado a un rango
 * que brille sobre papel y sobre noche. Si la foto es gris, se usa el
 * complementario del dominante para que el acento no muera.
 */
function pickAccent(dominant: string, secondary: string): string {
  const boost = (hex: string): { hex: string; chroma: number } => {
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r * 255, g * 255, b * 255);
    const chroma = Math.abs(Math.max(Math.max(r, g), b) - Math.min(Math.min(r, g), b)) / 255;
    const vivid = hslToHex(
      h,
      clamp(Math.max(s, 0.66), 0, 1),
      clamp(Math.max(0.42, Math.min(l, 0.6)), 0, 1),
    );
    return { hex: vivid, chroma };
  };
  const a = boost(dominant);
  const b = boost(secondary);
  if (a.chroma < 0.1 && b.chroma < 0.1) {
    // Foto casi neutra: complementario del dominante con fuerza moderada.
    const { r, g, b } = hexToRgb(dominant);
    const { h } = rgbToHsl(r, g, b);
    return hslToHex((h + 0.5) % 1, 0.5, 0.46);
  }
  return b.chroma >= a.chroma ? b.hex : a.hex;
}

function clamp(v: number, min: number, maxV: number): number {
  return Math.min(maxV, Math.max(min, v));
}
