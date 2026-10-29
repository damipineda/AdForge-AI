import type { BackgroundRecommendation, ImageAsset, PhotoDesignData, Segmentation, StyleArchetype } from "@/lib/schema/campaign";
import { bufferToBase64 } from "./image";
import { llmJson } from "./llm";
import { toSegmentation, type Provider } from "./provider";

export type SamInput = {
  bytes: ArrayBuffer;
  mimeType: string;
  filename: string;
};

export type SamOutput = {
  /** Asset de recorte. Solo en demo; en `meta` el frontend recorta la foto
   * cruda con `segmentation` y compone el estudio sobre ella. */
  cutout: ImageAsset | null;
  segmentation: Segmentation;
  /** Descripción del producto real que ve el modelo. Vacía en demo. */
  productDescription: string;
  /** Paleta real + arquetipo recomendado, extraídos por el modelo de visión
   * (Motor de Estilos). En demo, valores neutrales fijos. */
  designData: PhotoDesignData;
  /** Decisión de fondo: sólido / degradado / escena según el producto. */
  background: BackgroundRecommendation;
};

/**
 * Paso 1: la pasada de visión sobre la foto cruda. En `meta` la hace
 * `muse-spark-1.3` (acepta `input_image` y devuelve el bounding box
 * normalizado); `sam-3.1` no sirve acá: responde 200 con texto vacío y no hay
 * endpoint de máscaras en la API (ver el encabezado de `meta.ts`).
 */
export async function runSam(input: SamInput, provider: Provider): Promise<SamOutput> {
  return provider === "demo" ? runDemo(input) : runVision(input);
}

async function runDemo(_input: SamInput): Promise<SamOutput> {
  return {
    cutout: { slot: "cutout", url: "/demo/cutout.svg", sourceModel: "fixtures demo" },
    segmentation: { x: 0.15, y: 0.1, width: 0.7, height: 0.8 },
    productDescription: "",
    designData: {
      dominantColorHex: "#5d6470",
      secondaryColorHex: "#b07a45",
      styleArchetype: "editorial-poster",
    },
    background: {
      mode: "scene",
      colorHex: null,
      reason: "Demo: escena completa para mostrar el producto en contexto.",
    },
  };
}

const samResponseSchema = {
  type: "OBJECT",
  properties: {
    productDescription: { type: "STRING" },
    boundingBox: {
      type: "OBJECT",
      properties: {
        x: { type: "NUMBER" },
        y: { type: "NUMBER" },
        width: { type: "NUMBER" },
        height: { type: "NUMBER" },
      },
      required: ["x", "y", "width", "height"],
    },
    dominantColorHex: { type: "STRING" },
    secondaryColorHex: { type: "STRING" },
    styleArchetype: {
      type: "STRING",
      enum: ["editorial-poster", "split-commerce", "bold-dark"],
    },
    backgroundMode: { type: "STRING", enum: ["solid", "gradient", "scene"] },
    backgroundColorHex: { type: "STRING" },
    backgroundReason: { type: "STRING" },
  },
  required: ["productDescription", "boundingBox", "dominantColorHex", "secondaryColorHex", "styleArchetype", "backgroundMode", "backgroundReason"],
} as const;

type SamVisionRaw = {
  productDescription?: string;
  boundingBox?: { x?: number; y?: number; width?: number; height?: number };
  dominantColorHex?: string;
  secondaryColorHex?: string;
  styleArchetype?: string;
  backgroundMode?: string;
  backgroundColorHex?: string;
  backgroundReason?: string;
};

const ARCHETYPE_EXPLANATION =
  "editorial-poster, split-commerce o bold-dark son identificadores técnicos para una composición local de respaldo; no dictan colores, fondos, geometría ni estilo de las imágenes generadas por IA.";

async function runVision(input: SamInput): Promise<SamOutput> {
  const prompt =
    "Analizá la foto de producto adjunta. Devolvé JSON con:\n" +
    "1) productDescription: describí en español el producto REAL visible, nombre o marca si se leen, tipo, material, color, atributos y texto legible del envase. Jamás transcribas ni describas matrículas, patentes, números de serie, documentos, direcciones o datos personales visibles; no son atributos comerciales. Transcribí cantidades y sus condiciones exactamente, por ejemplo 'hasta 50 lavados' no son 50 garantizados. Marcá como ilegibles datos dudosos; no inventes composición, prestaciones, precio, stock ni certificaciones.\n" +
    "2) boundingBox: el recuadro normalizado (valores 0..1) que encuadra el producto dentro de la imagen, como {x, y, width, height} donde x,y es la esquina superior izquierda. Ajustado al objeto, no a toda la foto.\n" +
    "3) dominantColorHex: el color HEX (#rrggbb) DOMINANTE del producto (no del fondo).\n" +
    "4) secondaryColorHex: el color HEX (#rrggbb) SECUNDARIO del producto (detalles, etiqueta, material alternativo).\n" +
    `5) styleArchetype: elegí uno de estos identificadores de respaldo sin inferir precio ni imponer estilo: ${ARCHETYPE_EXPLANATION}\n` +
    "6) backgroundMode: elegí scene, solid o gradient según el producto y su legibilidad. La decisión es orientativa, no fija todas las variantes; explicá brevemente en backgroundReason por qué puede servir, sin asumir materiales, entornos o precio.\n" +
    "7) backgroundColorHex: si backgroundMode es 'solid', el HEX del plano (derivado del producto o neutro que contraste); si no, \"\".\n" +
    "8) backgroundReason: una frase (<=200 chars) que justifique la decisión de fondo; si es 'solid', cita el choque concreto.";

  const raw = await llmJson<SamVisionRaw>(prompt, {
    image: { base64: bufferToBase64(input.bytes), mimeType: input.mimeType },
    schema: samResponseSchema,
  });

  const box = {
    x: number01(raw.boundingBox?.x, 0.12),
    y: number01(raw.boundingBox?.y, 0.1),
    width: number01(raw.boundingBox?.width, 0.76),
    height: number01(raw.boundingBox?.height, 0.8),
  };

  return {
    cutout: null,
    segmentation: toSegmentation(box),
    productDescription: raw.productDescription?.trim() || "Producto fotografiado sin categoría específica.",
    designData: normalizeDesignData(raw),
    background: normalizeBackground(raw),
  };
}

/** Normaliza colores/arquetipo; cae a neutrales si el modelo inventa HEX. */
function normalizeDesignData(raw: SamVisionRaw): PhotoDesignData {
  const archetype = ARCHES.includes(raw.styleArchetype as StyleArchetype)
    ? (raw.styleArchetype as StyleArchetype)
    : "editorial-poster";
  return {
    dominantColorHex: coerceHex(raw.dominantColorHex, "#5d6470"),
    secondaryColorHex: coerceHex(raw.secondaryColorHex, "#b07a45"),
    styleArchetype: archetype,
  };
}

const ARCHES: readonly StyleArchetype[] = [
  "editorial-poster",
  "split-commerce",
  "bold-dark",
];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeBackground(raw: SamVisionRaw): BackgroundRecommendation {
  const mode = raw.backgroundMode === "solid" || raw.backgroundMode === "gradient" || raw.backgroundMode === "scene"
    ? raw.backgroundMode
    : "scene";
  const colorRaw = (raw.backgroundColorHex ?? "").trim();
  return {
    mode,
    colorHex: mode === "solid" && HEX_RE.test(colorRaw) ? normalizeHexOut(colorRaw) : null,
    reason: (raw.backgroundReason ?? "").trim().slice(0, 200) || "Escena completa por defecto: el contexto ayuda a vender el producto.",
  };
}

function normalizeHexOut(value: string): string {
  const s = value.trim();
  if (s.length === 4) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return s.toLowerCase();
}

function coerceHex(value: string | undefined, fallback: string): string {
  const s = value?.trim() ?? "";
  if (!HEX_RE.test(s)) return fallback;
  if (s.length === 4) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return s.toLowerCase();
}

function number01(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}
