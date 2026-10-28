import { z } from "zod";
import type { AdVariant, CreativeStrategy, Locale } from "@/lib/schema/campaign";
import { llmJson } from "./llm";
import type { Provider } from "./provider";

export type PlanReview = { status: "reviewed" | "unavailable"; summary: string };

const responseSchema = {
  type: "OBJECT", properties: {
    summary: { type: "STRING" },
    directions: { type: "ARRAY", items: { type: "STRING" } },
  }, required: ["summary", "directions"],
} as const;

const parsedSchema = z.strictObject({
  summary: z.string().trim().min(1).max(350),
  directions: z.array(z.string().trim().min(1).max(800)).length(3),
});

/** Contrast the three plans before image generation. A failed critic leaves the
 * original plans untouched and the result is explicitly marked unreviewed. */
export async function reviewCreativePlan(input: {
  product: string;
  locale: Locale;
  strategy: CreativeStrategy;
  variants: [AdVariant, AdVariant, AdVariant];
}, provider: Provider): Promise<{ variants: [AdVariant, AdVariant, AdVariant]; planReview: PlanReview }> {
  if (provider === "demo") return { variants: input.variants, planReview: { status: "unavailable", summary: "El plan de demostración no fue revisado por IA." } };
  try {
    const plans = input.variants.map((variant, i) => `${i + 1}. Concepto: ${variant.concept}. Titular: ${variant.hook}. Dirección: ${variant.artDirection}`).join("\n");
    const prompt = [
      `Sos director de arte crítico. Revisá estos tres planes antes de generar una campaña para este producto: ${input.product}. Idioma/mercado seleccionado: ${input.locale}. Idea y mundo visual: ${input.strategy.campaignIdea}; ${input.strategy.visualWorld}.`,
      plans,
      "Compará los tres planes como conjunto. Manteniendo la idea, el copy y los hechos del producto, mejorá SOLO lo necesario para que cada escena, distancia, ángulo, escala, posición de producto y texto, luz y espacio libre sea distinta y funcional. No fuerces una fórmula por índice ni inventes otro producto. Evitá clichés regionales, nacionalidad supuesta y decoraciones folclóricas por defecto; elegí contextos contemporáneos plausibles y relacionados con el producto.",
      "Cuando haya comida, especificá qué producto se prepara o consume, cuál es el protagonista y cómo se relacionan los acompañamientos; no prohibas acompañamientos razonables. Para cada dirección describí composición, relación de tamaños, márgenes seguros, legibilidad, interlineado y separación entre titular, imagen y CTA; si hay texto pequeño, reducí su cantidad. No inventes promesas, datos, materiales, precios o claims. No sustituyas una solución por una plantilla genérica.",
      "Devolvé JSON summary (máximo 350 caracteres; describe brevemente qué revisaste) y directions con EXACTAMENTE 3 instrucciones en el mismo orden, cada una máximo 800 caracteres. Son indicaciones visuales, no copies nuevos.",
    ].join("\n\n");
    const response = parsedSchema.safeParse(await llmJson(prompt, { schema: responseSchema, timeoutMs: 90_000 }));
    if (!response.success) throw new Error("Respuesta de plan inválida");
    const directions = response.data.directions;
    // Identical outputs are not evidence of three independently planned pieces.
    if (new Set(directions.map((direction) => direction.toLocaleLowerCase())).size !== 3) throw new Error("Direcciones duplicadas");
    return {
      variants: input.variants.map((variant, index) => ({ ...variant, artDirection: directions[index] })) as [AdVariant, AdVariant, AdVariant],
      planReview: { status: "reviewed", summary: response.data.summary },
    };
  } catch {
    return { variants: input.variants, planReview: { status: "unavailable", summary: "No se pudo revisar el plan creativo; se conservaron las propuestas iniciales." } };
  }
}
