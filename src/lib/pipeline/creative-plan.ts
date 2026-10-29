import { z } from "zod";
import type { FeedVariant, CreativeStrategy, Locale, StoryCopy } from "@/lib/schema/campaign";
import { llmJson } from "./llm";
import type { Provider } from "./provider";

export type PlanReview = { status: "reviewed" | "unavailable"; summary: string };

function responseSchema(): Record<string, unknown> {
  return {
    type: "OBJECT", properties: {
      summary: { type: "STRING" },
      directions: { type: "ARRAY", items: { type: "STRING" } },
    }, required: ["summary", "directions"],
  };
}

function parsedSchema(count: 2 | 3) {
  return z.strictObject({
    summary: z.string().trim().min(1).max(350),
    directions: z.array(z.string().trim().min(1).max(800)).length(count),
  });
}

/** Contrast the feed + story plans before image generation. A failed critic leaves the
 * original plans untouched and the result is explicitly marked unreviewed. */
export async function reviewCreativePlan(input: {
  product: string;
  locale: Locale;
  strategy: CreativeStrategy;
  feed: [FeedVariant, FeedVariant];
  story: StoryCopy | null;
}, provider: Provider): Promise<{ feed: [FeedVariant, FeedVariant]; story: StoryCopy | null; planReview: PlanReview }> {
  if (provider === "demo") return { feed: input.feed, story: input.story, planReview: { status: "unavailable", summary: "El plan de demostración no fue revisado por IA." } };
  const plans = [
    `1. Feed V1 (4:5). Concepto: ${input.feed[0].concept}. Titular: ${input.feed[0].hook}. Dirección: ${input.feed[0].artDirection}`,
    `2. Feed V2 (4:5). Concepto: ${input.feed[1].concept}. Titular: ${input.feed[1].hook}. Dirección: ${input.feed[1].artDirection}`,
    ...(input.story ? [`3. Story (9:16 vertical). Concepto: ${input.story.concept}. Titular: ${input.story.hook}. Dirección: ${input.story.artDirection}`] : []),
  ];
  const count = plans.length as 2 | 3;
  try {
    const prompt = [
      `Sos director de arte crítico. Revisá estos planes antes de generar una campaña para este producto: ${input.product}. Idioma/mercado seleccionado: ${input.locale}. Idea y mundo visual: ${input.strategy.campaignIdea}; ${input.strategy.visualWorld}.`,
      plans.join("\n"),
      "Compará los planes como conjunto. Manteniendo la idea, el copy y los hechos del producto, mejorá SOLO lo necesario para que cada escena, distancia, ángulo, escala, posición de producto y texto, luz y espacio libre sea distinta y funcional. No inventes otro producto. Evitá clichés regionales, nacionalidad supuesta y decoraciones folclóricas por defecto; elegí contextos contemporáneos plausibles y relacionados con el producto.",
      "DIRECCIÓN AUTÓNOMA: elegí para cada concepto el enfoque y entorno más pertinente al producto y al argumento. Pueden ser escenas de uso, tratamiento gráfico o fotografía; no impongas cocina, podio, superficies ni luz oscura por número de variante.",
      "Elegí profundidad, encuadre, perspectiva y soportes cuando ayuden al concepto. Si hay apoyo físico, hacé coherentes las sombras y la luz; mantené márgenes, jerarquía y respiración sin introducir decoración arbitraria.",
      "GEOMETRÍA EXACTA: cada dirección debe ordenar que el envase conserve las proporciones ancho/alto de la foto real — prohibido estirarlo en vertical o aplastarlo para llenar el encuadre; si sobra encuadre se llena con escena y aire.",
      "COHERENCIA ESCENA-COPY: verificá que cada escena pueda mostrar lo que su copy afirma. PROHIBIDO contradicciones físicas: comida cocida humeando dentro de un freezer; titular 'Abrí el freezer' con fondo de parrilla y fuego y ningún freezer visible; producto congelado con escena de frío y de cocción mezcladas en el mismo plano. Si el copy habla de frío, la escena muestra frío; si habla de parrilla, la escena es de parrilla.",
      "DIVERSIDAD REAL: distinguí los conceptos por argumento, encuadre, escala, disposición y recursos visuales, no solo por color o material. Elegí las posiciones de producto y texto según cada idea; no fijes una plantilla para feed o historia. La coherencia de campaña no obliga a repetir el mismo entorno.",
      "Si solo hay una vista frontal del producto, conservá esa vista fiel: diferenciá las piezas mediante escala, recorte, posición, entorno y tratamiento gráfico, sin inventar otra vista del objeto ni repetirlo centrado al mismo tamaño en todas.",
      "DIRECCIÓN DE COLOR: proponé para cada concepto una paleta intencional y sus funciones visuales (fondo, acento y contraste), tomando como punto de partida producto, audiencia y argumento. Los ambientes, colores y texturas pueden ser imaginados si son pertinentes; no impongas negro para una variante y blanco o beige para otra, ni reduzcas toda la campaña a un plano neutro. Un tratamiento neutro es válido cuando esté justificado; no sustituyas variedad conceptual por colores al azar.",
      "Cuando haya comida, especificá qué producto se prepara o consume, cuál es el protagonista y cómo se relacionan los acompañamientos; no prohibas acompañamientos razonables. Para cada dirección describí composición, relación de tamaños, márgenes seguros, legibilidad, interlineado y separación entre titular, imagen y CTA; si hay texto pequeño, reducí su cantidad. No inventes promesas, datos, precios o claims. No sustituyas una solución por una plantilla genérica.",
      `Devolvé JSON summary (máximo 350 caracteres; describe brevemente qué revisaste) y directions con EXACTAMENTE ${count} instrucciones en el mismo orden, cada una máximo 800 caracteres. Son indicaciones visuales, no copies nuevos.`,
    ].join("\n\n");
    const response = parsedSchema(count).safeParse(await llmJson(prompt, { schema: responseSchema(), timeoutMs: 90_000 }));
    if (!response.success) throw new Error("Respuesta de plan inválida");
    const directions = response.data.directions;
    // Identical outputs are not evidence of independently planned pieces.
    if (new Set(directions.map((direction) => direction.toLocaleLowerCase())).size !== count) throw new Error("Direcciones duplicadas");
    return {
      feed: input.feed.map((variant, index) => ({ ...variant, artDirection: directions[index] })) as [FeedVariant, FeedVariant],
      story: input.story ? { ...input.story, artDirection: directions[2] ?? input.story.artDirection } : null,
      planReview: { status: "reviewed", summary: response.data.summary },
    };
  } catch {
    return { feed: input.feed, story: input.story, planReview: { status: "unavailable", summary: "No se pudo revisar el plan creativo; se conservaron las propuestas iniciales." } };
  }
}
