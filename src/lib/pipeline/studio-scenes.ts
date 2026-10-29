import { studioSceneSchema, type StudioScene } from "@/lib/schema/campaign";
import { llmJson } from "./llm";

/**
 * Los 3 estudios base que el cliente compone sobre la foto real con Canvas.
 * Son la red de seguridad: si el modelo devuelve un color inválido o falta un
 * campo, `normalizeScenes` cae a estos valores y el flyer siempre se dibuja.
 */
export const DEFAULT_SCENES: StudioScene[] = [
  {
    name: "Estudio Minimalista",
    background: ["#f5f5f2", "#dcdcd6"],
    accent: "#0f6b4f",
    textColor: "#0e1c17",
    lighting: "soft-window",
    shadow: "soft",
    badge: "DESTACADO",
    vibe: "Limpio, editorial, producto al frente",
  },
  {
    name: "Lifestyle Cálida",
    background: ["#f7d9a8", "#e79a6a"],
    accent: "#b5541f",
    textColor: "#3a1f0e",
    lighting: "radial-top",
    shadow: "colored",
    badge: "DESTACADO",
    vibe: "Cálida, hogareña, luz de atardecer",
  },
  {
    name: "Dark / Neón Comercial",
    background: ["#141422", "#2c1a44"],
    accent: "#a855f7",
    textColor: "#ffffff",
    lighting: "neon-rim",
    shadow: "colored",
    badge: "DESTACADO",
    vibe: "Premium nocturno, rim light de neón",
  },
];

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LIGHTING = new Set<StudioScene["lighting"]>([
  "radial-top",
  "vignette",
  "neon-rim",
  "soft-window",
  "spotlight",
]);
const SHADOW = new Set<StudioScene["shadow"]>(["soft", "hard", "colored", "none"]);

function pickHex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim() : fallback;
}

/** Fusiona la salida del modelo sobre las plantillas por índice y valida cada
 * campo. Nunca lanza: devuelve siempre 3 escenas renderizables. */
export function normalizeScenes(raw: unknown): StudioScene[] {
  const list = Array.isArray(raw) ? raw : [];
  return DEFAULT_SCENES.map((base, i) => {
    const item = (typeof list[i] === "object" && list[i] !== null ? list[i] : {}) as Record<string, unknown>;
    const bg = Array.isArray(item.background)
      ? item.background.map((c) => pickHex(c, "")).filter(Boolean).slice(0, 4)
      : [];
    const lighting = LIGHTING.has(item.lighting as StudioScene["lighting"])
      ? (item.lighting as StudioScene["lighting"])
      : base.lighting;
    const shadow = SHADOW.has(item.shadow as StudioScene["shadow"])
      ? (item.shadow as StudioScene["shadow"])
      : base.shadow;
    const scene = {
      name: str(item.name, base.name, 40),
      background: bg.length >= 2 ? bg : base.background,
      accent: pickHex(item.accent, base.accent),
      textColor: pickHex(item.textColor, base.textColor),
      lighting,
      shadow,
      badge: base.badge,
      vibe: str(item.vibe, base.vibe, 60),
    };
    const parsed = studioSceneSchema.safeParse(scene);
    return parsed.success ? parsed.data : base;
  });
}

function str(value: unknown, fallback: string, max: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return fallback;
  return s.length <= max ? s : s.slice(0, max);
}

const sceneResponseSchema = {
  type: "OBJECT",
  properties: {
    studio_scenes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          background: { type: "ARRAY", items: { type: "STRING" } },
          accent: { type: "STRING" },
          textColor: { type: "STRING" },
          lighting: { type: "STRING", enum: ["radial-top", "vignette", "neon-rim", "soft-window", "spotlight"] },
          shadow: { type: "STRING", enum: ["soft", "hard", "colored", "none"] },
          badge: { type: "STRING" },
          vibe: { type: "STRING" },
        },
        required: ["name", "background", "accent", "textColor", "lighting", "shadow", "badge", "vibe"],
      },
    },
  },
  required: ["studio_scenes"],
} as const;

/**
 * Pide al modelo de texto (`muse-spark-1.3`) configuraciones de estudio
 * adaptadas al producto real de la foto. Devuelve SIEMPRE 3 escenas válidas
 * (normalizadas sobre plantillas).
 */
export async function requestScenes(productDescription: string, signal?: AbortSignal): Promise<StudioScene[]> {
  const prompt =
    `Sos director de arte de e-commerce. Para este producto: "${productDescription}"\n\n` +
    "Diseñá 3 direcciones visuales distintas y relacionadas con el producto, sin asignar estilos fijos por número. " +
    "Pueden usar tratamiento fotográfico, gráfico o un fondo simple según el concepto.\n" +
    "Distinguí las ideas y composiciones; los materiales y superficies son opcionales y deben tener relación con el producto.\n" +
    "Para cada escena devolvé:\n" +
    "- name (<=40 chars, en español)\n" +
    "- background: 2 o 3 colores HEX (#rrggbb) del degradé de fondo, coherentes con el producto\n" +
    "- accent: HEX para badge y botón CTA\n" +
    "- textColor: HEX legible sobre el fondo (claro si el fondo es oscuro, viceversa)\n" +
    "- lighting: una de radial-top|vignette|neon-rim|soft-window|spotlight (distinta en cada escena)\n" +
    "- shadow: una de soft|hard|colored|none\n" +
    "- badge: texto neutral DESTACADO, sin ofertas ni condiciones inventadas\n" +
    "- vibe: frase corta describiendo estilo, superficie y luz (ej. 'Cuarzo blanco, luz de ventana suave')\n" +
    "Los colores deben dar contraste alto para que el texto se lea.";
  const raw = await llmJson<{ studio_scenes?: unknown }>(prompt, {
    schema: sceneResponseSchema,
    signal,
  });
  return normalizeScenes(raw.studio_scenes);
}
