import { z } from "zod";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const textLayer = z.object({ text: z.string().max(200), x: z.number().min(0).max(95), y: z.number().min(0).max(95), maxWidth: z.number().min(10).max(100), fontSize: z.number().min(12).max(140), fontWeight: z.union([z.enum(["normal", "bold"]), z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)])]), fontFamily: z.enum(["display", "serif", "sans"]).optional(), color, align: z.enum(["left", "center", "right"]), lineHeight: z.number().min(1).max(2) });
export const layoutLayersSchema = z.object({
  headline: textLayer,
  subheadline: textLayer.nullable(),
  cta: z.object({ text: z.string().max(80), x: z.number().min(0).max(95), y: z.number().min(0).max(95), width: z.number().min(20).max(90).optional(), bgColor: color, textColor: color, borderRadius: z.number().min(0).max(999) }),
  // Optional for compatibility with previously saved editable campaigns.
  archetype: z.enum(["editorial", "benefits", "immersive"]).optional(),
  copyPanel: z.object({ x: z.number().min(0).max(95), y: z.number().min(0).max(95), width: z.number().min(20).max(90), height: z.number().min(10).max(90), color, opacity: z.number().min(.5).max(1), borderRadius: z.number().min(0).max(100), blur: z.number().min(0).max(16).optional() }).optional(),
});
export type LayoutLayers = z.infer<typeof layoutLayersSchema>;

/** Sizes are in pixels at 1080px canvas width. Positions and widths are percentages. */
export function defaultLayers(hook: string, body: string | null, cta: string, story: boolean): LayoutLayers {
  return { headline: { text: hook, x: 8, y: story ? 17 : 9, maxWidth: 80, fontSize: 80, fontWeight: "bold", color: "#262320", align: "left", lineHeight: 1.12 },
    subheadline: body ? { text: body, x: 8, y: 30, maxWidth: 76, fontSize: 38, fontWeight: "normal", color: "#262320", align: "left", lineHeight: 1.3 } : null,
    cta: { text: cta, x: 8, y: story ? 74 : 86, bgColor: "#8D7B6A", textColor: "#ffffff", borderRadius: 14 } };
}

export function contrastInk(hex: string): string {
  const rgb = hex.slice(1).match(/../g)!.map((v) => parseInt(v, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > .179 ? "#262320" : "#FFFFFF";
}

/** Geometry differs by communication role; scenes and palette still come from the product. */
export function artDirectedLayers(hook: string, body: string | null, cta: string, placement: 0 | 1 | 2, accent: string, family: "display" | "serif" = "display", rightPanel = true): LayoutLayers {
  const story = placement === 2;
  const base = defaultLayers(hook, body, cta, story);
  base.archetype = story ? "immersive" : placement === 1 ? "benefits" : "editorial";
  base.headline.fontFamily = family;
  base.cta.bgColor = accent;
  base.cta.textColor = contrastInk(accent);
  if (story) {
    base.headline = { ...base.headline, x: 10, y: 17, maxWidth: 80, fontSize: 100, align: "center", lineHeight: 1.06 };
    base.cta = { ...base.cta, x: 10, width: 80 };
  } else if (placement === 1) {
    const x = rightPanel ? 60 : 6;
    if (family !== "serif") base.copyPanel = editorialBand(rightPanel);
    base.headline = { ...base.headline, x, y: 16, maxWidth: 34, fontSize: 64, lineHeight: 1.08 };
    if (base.subheadline) base.subheadline = { ...base.subheadline, x, y: 43, maxWidth: 34, fontSize: 30, lineHeight: 1.4 };
    base.cta = { ...base.cta, x: x - 3, width: 44 };
  } else {
    base.headline.fontSize = family === "serif" ? 104 : 96;
    if (base.subheadline) base.subheadline.fontSize = 32;
    base.cta.width = 54;
  }
  if (family === "serif") {
    base.headline = { ...base.headline, fontWeight: 500, fontSize: story ? 82 : placement === 1 ? 64 : 78, lineHeight: 1.18 };
    if (base.subheadline) base.subheadline = { ...base.subheadline, fontSize: 28, y: placement === 1 ? 35 : 29, lineHeight: 1.55, color: "#262320" };
    base.cta.width = story ? 64 : placement === 1 ? 38 : 44;
    if (story) base.cta.x = 18;
  }
  if (base.copyPanel) {
    base.headline.color = "#FFFFFF";
    if (base.subheadline) base.subheadline.color = "#FFFFFF";
  }
  return constrainLayers(base, story);
}

export function constrainLayers(layers: LayoutLayers, story: boolean): LayoutLayers {
  const limit = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const fixText = (t: LayoutLayers["headline"]) => ({ ...t, x: limit(t.x, 0, 90), y: limit(t.y, story ? 16 : 0, story ? 70 : 90), maxWidth: limit(t.maxWidth, 10, Math.min(80, 100 - limit(t.x, 0, 90))) });
  const panel = layers.copyPanel;
  return { ...layers, headline: fixText(layers.headline), subheadline: layers.subheadline ? fixText(layers.subheadline) : null,
    ...(panel ? { copyPanel: { ...panel, x: panel.x >= 50 ? 56 : 0, y: 0, width: 44, height: limit(panel.height, 10, 82), color: "#2A2421", opacity: .78, borderRadius: 0, blur: 8 } } : {}),
    cta: { ...layers.cta, x: limit(layers.cta.x, 0, 70), y: story ? 74 : 86, ...(layers.cta.width ? { width: Math.min(layers.cta.width, 96 - limit(layers.cta.x, 0, 70)) } : {}) } };
}

export function repositionLayers(layers: LayoutLayers, position: string, story: boolean): LayoutLayers {
  const center = position === "top-center";
  const y = position === "bottom-left" ? (story ? 48 : 44) : (story ? 17 : 9);
  const x = layers.copyPanel && !center ? 6 : center ? 10 : 8;
  const maxWidth = layers.copyPanel && !center ? 34 : 80;
  const { copyPanel, ...rest } = layers;
  return constrainLayers({ ...rest,
    headline: { ...layers.headline, x, y, maxWidth, align: center ? "center" : "left" },
    subheadline: layers.subheadline ? { ...layers.subheadline, x, y: y + (layers.copyPanel ? 27 : 22), maxWidth, align: center ? "center" : "left" } : null,
    ...(copyPanel && !center ? { copyPanel: { ...copyPanel, x: 0, y: 0, height: Math.min(82, y + 55) } } : {}),
  }, story);
}

/** The band always grows from the top/right or top/left edge, never as a floating card. */
export function editorialBand(right = true): NonNullable<LayoutLayers["copyPanel"]> {
  return { x: right ? 56 : 0, y: 0, width: 44, height: 68, color: "#2A2421", opacity: .78, borderRadius: 0, blur: 8 };
}

/** A white product is not a bright scene; white ink requires an explicitly dark text area. */
export function sceneTextColor(direction: string, proposed: string): string {
  const scene = "(?:fondo|pared|escena|cielo|zona|background|wall|scene|sky|area)";
  const bright = new RegExp(`${scene}[^.;\\n]{0,60}(?:blanc|clar[oa]|luminos|pastel|beige|crema|arena|white|bright|light|cream)|(?:white|bright|pastel|light|beige|cream)[^.;\\n]{0,25}${scene}`, "i").test(direction);
  const dark = new RegExp(`${scene}[^.;\\n]{0,50}(?:oscur|nocturn|negr|dark|night|black)|(?:dark|night|black)[^.;\\n]{0,25}${scene}`, "i").test(direction);
  if (bright) return "#262320";
  if (dark) return "#FFFFFF";
  const rgb = proposed.slice(1).match(/../g)!.map((v) => parseInt(v, 16));
  return Math.min(...rgb) > 170 ? "#262320" : proposed;
}
