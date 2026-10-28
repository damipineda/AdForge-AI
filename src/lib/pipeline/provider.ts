import {
  audienceSegmentSchema,
  type AudienceSegment,
  type Locale,
  type Segmentation,
} from "@/lib/schema/campaign";
import { llmJson } from "./llm";
import { metaAvailable, metaTextModel } from "./meta";

export type Provider = "demo" | "meta";

/**
 * Resuelve qué motor usa cada etapa. `AI_PROVIDER` manda; si no está, se cae al
 * comportamiento histórico de `DEMO_MODE`. Solo hay dos respuestas posibles:
 * `meta` (Meta Model API) o `demo` (fixtures locales, sin red). Cualquier otro
 * valor de `AI_PROVIDER` —o `meta` sin llave— baja a demo en vez de reventar a
 * mitad de la corrida.
 */
export function getProvider(): Provider {
  const explicit = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (explicit === "meta") return metaAvailable() ? "meta" : "demo";
  if (explicit === "demo") return "demo";
  const demo = (process.env.DEMO_MODE ?? "true").trim().toLowerCase();
  const demoOff = demo === "false" || demo === "0" || demo === "off";
  return demoOff && metaAvailable() ? "meta" : "demo";
}

export const MODEL_LABELS: Record<Provider, string> = {
  demo: "fixtures locales",
  meta: metaTextModel(),
};

/**
 * Serializa `AudienceSegment[]` al subconjunto que entiende la API de Meta
 * (Campaign -> Ad Set -> targeting). El pipeline solo lo guarda como borrador;
 * quien publica revisa antes, igual que para el resto del resultado.
 */
export function toMetaTargeting(audiences: AudienceSegment[]) {
  return {
    specs: audiences.map((a) => ({
      name: a.name,
      target_age_min: a.ageMin,
      target_age_max: a.ageMax,
      interests: a.interests.map((i) => ({ name: i })),
      geo_locations: { countries: a.geo },
    })),
  };
}

const localeNames: Record<Locale, string> = {
  es: "español rioplatense (Paraguay)",
  pt: "portugués brasilero",
  en: "inglés neutral",
};

export function audienceResponseSchema(): Record<string, unknown> {
  return {
    type: "OBJECT",
    properties: {
      audiences: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            interests: { type: "ARRAY", items: { type: "STRING" } },
            ageMin: { type: "INTEGER" },
            ageMax: { type: "INTEGER" },
            geo: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["name", "interests", "ageMin", "ageMax", "geo"],
        },
      },
    },
    required: ["audiences"],
  };
}

export async function generateAudiences(
  description: string,
  locale: Locale,
  signal?: AbortSignal,
): Promise<AudienceSegment[]> {
  const raw = await llmJson<{ audiences?: unknown }>(
    `Producto: ${description}\n\nGenera 3 segmentos de audiencia para Meta Ads en ${localeNames[locale]}. ` +
      `Sugiere intereses posibles (1 a 8), edad entre 18 y 65 y regiones plausibles para el idioma. Son hipótesis para revisar, no afirmes que están disponibles en Meta ni que los segmentos han sido validados.`,
    { schema: audienceResponseSchema(), signal },
  );
  const list = Array.isArray(raw.audiences) ? raw.audiences : [];
  return list
    .map((item) => sanitizeAudience(item, description))
    .filter((a): a is AudienceSegment => a !== null)
    .slice(0, 6);
}

function sanitizeAudience(value: unknown, description: string): AudienceSegment | null {
  const base = typeof value === "object" && value !== null ? value : {};
  const obj = base as Record<string, unknown>;
  const interests = toStringArray(obj.interests).slice(0, 10);
  if (interests.length === 0) return null;
  const ageMin = toInt(obj.ageMin, 18, 13, 65);
  const ageMax = toInt(obj.ageMax, 45, 13, 65);
  const candidate = {
    name: truncate(firstStr(obj.name, `Audiencia ${description.slice(0, 24)}`), 80),
    interests: interests.map((i) => truncate(i, 60)),
    ageMin,
    ageMax: Math.max(ageMin, Math.min(ageMax, 65)),
    geo: toStringArray(obj.geo).slice(0, 10).map((g) => truncate(g, 60)),
  };
  const parsed = audienceSegmentSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function toSegmentation(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Segmentation {
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const x = clamp(box.x, 0, 0.95);
  const y = clamp(box.y, 0, 0.95);
  return {
    x,
    y,
    width: clamp(box.width, 0.05, 1 - x),
    height: clamp(box.height, 0.05, 1 - y),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
}

function firstStr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? Math.round(value) : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}
