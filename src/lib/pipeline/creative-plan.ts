import { z } from "zod";
import type { FeedVariant, CreativeStrategy, Locale, StoryCopy, PhotoDesignData, BriefFocus } from "@/lib/schema/campaign";
import { llmJson } from "./llm";
import type { Provider } from "./provider";
import { contrastInk } from "@/lib/flyer/layers";
import { stripBrandNameFromDirection, type BrandContext } from "./brand";

export type PlanReview = { status: "reviewed" | "unavailable"; summary: string };

/** Muse receives integrated art direction, never a coordinate template for the frontend. */
export async function reviewCreativePlan(input: {
  product: string; locale: Locale; strategy: CreativeStrategy; designData?: PhotoDesignData | null;
  feed: [FeedVariant, FeedVariant]; story: StoryCopy | null;
  userBrief?: string; focus?: BriefFocus; brand?: BrandContext | null;
}, provider: Provider): Promise<{ feed: [FeedVariant, FeedVariant]; story: StoryCopy | null; planReview: PlanReview }> {
  const feed = input.feed.map(v => { const clean = { ...v }; delete clean.layoutLayers; return clean; }) as [FeedVariant, FeedVariant];
  const story = input.story ? { ...input.story } : null;
  if (story) delete story.layoutLayers;
  const fallback = { feed, story, planReview: { status: "unavailable" as const, summary: "No se pudo revisar el plan creativo; se conservaron las direcciones originales." } };
  if (provider === "demo") return { ...fallback, planReview: { status: "unavailable", summary: "El plan de demostración no fue revisado por IA." } };
  const count = story ? 3 : 2;
  const schema = z.strictObject({ summary: z.string().trim().min(1).max(140), directions: z.array(z.string().trim().min(1).max(450)).length(count) });
  const prompt = [
    `Sos director de arte de una agencia. Revisá una campaña para ${input.product}, mercado ${input.locale}. Idea: ${input.strategy.campaignIdea}. Mundo visual: ${input.strategy.visualWorld}.`,
    input.userBrief?.trim()
      ? `BRIEF DEL USUARIO (no contradecir: ni la categoría, ni el contexto, ni el encuadre): "${input.userBrief.trim().slice(0, 280)}"${input.focus && input.focus !== "product" ? ` Enfoque: ${input.focus}.` : ""}`
      : "",
    JSON.stringify([...feed, ...(story ? [story] : [])]),
    "Muse Image compone la pieza TERMINADA: producto, escena, tipografía editorial, beneficios y CTA integrados en una única imagen. No habrá superposición ni corrección de texto en Canvas. Elegí posiciones por concepto sin coordenadas ni grillas fijas y resolvé todas las colisiones en el diseño completo.",
    "Actuá como Director Creativo: proponé y validá 3 direcciones visuales y espaciales genuinamente distintas para Feed V1, Feed V2 y Story (un argumento y un mundo propio por pieza, sin roles fijos por formato). Asigná a cada pieza un esquema compositivo distinto según el objetivo (1. Composición de Lectura en Z para catálogos/retail/combos; 2. Composición Central o Radial para eventos, quintas, fiestas o impacto; 3. Composición Minimalista con amplio espacio negativo para marcas premium, vehículos o estética limpia; 4. Composición de Bloques modulares para múltiples ítems) y garantizá la jerarquía de 3 niveles (1. Gancho/Encabezado dominante; 2. Mensaje principal breve con mucho aire; 3. Cierre y acción con contraste agresivo y direccionalidad hacia el CTA).",
    "EL CTA NO SIEMPRE ES UN BOTÓN ABAJO: prohibido diseñar las 3 piezas con el típico botón redondeado abajo al centro. Variá la forma gráfica del CTA entre las piezas: en al menos una pieza usá una frase contundente al final en tipografía grande y bold SIN caja de botón (acompañada de línea/flecha direccional o subrayado de alto contraste), y en las otras alterná entre un recuadro o bloque destacado de cierre, un sello/cupón promocional con borde punteado (si es promo/oferta) o un callout compacto lateral.",
    "Fotografía comercial en tres planos con luz, sombras y texturas coherentes; la zona de copy conserva profundidad y menor detalle, no una pared vacía obligatoria. El contexto nace del producto y su uso, sin clichés regionales ni utilería arbitraria. En productos de limpieza del hogar usá superficies arquitectónicas interiores reales (mesada de cocina, bacha, piso de porcelanato/cerámico) y PROHIBIDO usar rocas exteriores, cascadas, pizarras gastronómicas o decorar con comida cruda (rodajas de limón, ramas de romero).",
    "Multiproducto (staging comercial de agencia): agrupá los productos en un conjunto orgánico en media luna sobre UNA ÚNICA superficie horizontal plana y continua (un envase adelante en foco y los demás inmediatamente a los lados con solapamiento lateral del 15-25% sin tapar las marcas principales). TODAS las bases de las botellas deben verse apoyadas al mismo nivel horizontal, respetando la escala física real entre envases grandes (1,5 L) y chicos (lavavajillas/gatillo). PROHIBIDO apilar productos en dos pisos o sobre escalones/rocas, PROHIBIDO que una botella asome por arriba detrás de los hombros de las demás con la base suspendida en el aire, y PROHIBIDO cortar la mitad inferior de las botellas con tarjetas blancas opacas.",
    "Pieza de un solo producto: protagonismo heroico claro con iluminación de estudio (key light + rim light + sombra de contacto anclada), evitando parches o recuadros opacos que tapen el producto.",
    "Conservá exactamente el copy y los hechos. No inventes precios, testimonios, promesas, ofertas o beneficios. La escena debe respaldar el argumento: frío con frío, preparación con preparación, sin incoherencias físicas ni comida incorrecta.",
    "Tipografía y paleta emergentes: elegí libremente el carácter tipográfico (geométrico, editorial, impactante, cálido, moderno) y los colores que mejor dialoguen con la identidad visual de la foto y el brief; nada de fuentes ni paletas asignadas por rubro. Siempre primero legibilidad y jerarquía publicitaria: contraste real texto/fondo directo sobre la zona despejada de la escena (PROHIBIDO tarjetas blancas grandes que tapen las botellas), CTA con color armónico del producto (PROHIBIDO repetir un botón rojo genérico en las 3 piezas) y esquina inferior derecha libre para el logo de marca. PROHIBIDO pedir en las direcciones de arte que se escriba el nombre de la tienda/negocio o un logo con letras en las esquinas o cabeceras, porque el logo gráfico original del kit ya se estampa automáticamente en Canvas y si lo escribís con letras queda duplicado.",
    "Story 9:16 nativa: dejá el quinto superior (0–18%) completamente vacío de letras y ubicá el titular recién entre el 18% y el 30% del alto; ubicá el botón CTA flotando entre el 70% y el 80% del alto dejando el quinto inferior (80–100%) completamente libre de botones o textos. PROHIBIDO escribir 'titular bajo borde superior' o 'CTA abajo al pie'; fondo continuo a sangre, sin rellenos. No recortes ni deformes el producto para llenar el formato.",
    `Devolvé JSON summary (máximo 140 caracteres, una sola frase directa sin justificaciones) y directions con exactamente ${count} direcciones en orden feed V1, feed V2 y Story si corresponde. Cada dirección (máximo 450 caracteres) describe el diseño de forma concisa y directa: composición, relación texto/producto, luz y materiales. Sin diagnósticos, sin justificaciones, sin rodeos.`,
  ].filter(Boolean).join("\n\n");
  try {
    const parsed = schema.parse(await llmJson(prompt, { timeoutMs: 150_000, schema: { type: "OBJECT", properties: { summary: { type: "STRING" }, directions: { type: "ARRAY", items: { type: "STRING" } } }, required: ["summary", "directions"] } }));
    if (new Set(parsed.directions.map(d=>d.toLocaleLowerCase())).size !== count) return fallback;
    const cleanStoryDir = story && parsed.directions[2]
      ? stripBrandNameFromDirection(
          parsed.directions[2]
            .replace(/bajo\s+(?:el\s+)?borde\s+superior/gi, "en el cuarto medio-alto dejando el 18% superior libre")
            .replace(/pegado\s+al\s+borde\s+superior/gi, "en el cuarto medio-alto con 18% superior libre"),
          input.brand,
        )
      : "";
    return { feed: feed.map((v,i)=>({ ...v, artDirection: stripBrandNameFromDirection(parsed.directions[i], input.brand) })) as [FeedVariant, FeedVariant], story: story ? { ...story, artDirection: cleanStoryDir } : null, planReview: { status: "reviewed", summary: parsed.summary } };
  } catch { return fallback; }
}

/** Prefer a chromatic brand color; monochrome products keep their own dark accent. */
export function brandAccent(data?: PhotoDesignData | null, editorial = false): string {
  const colors = [data?.dominantColorHex, data?.secondaryColorHex].filter((v): v is string => Boolean(v && /^#[0-9a-f]{6}$/i.test(v)));
  if (editorial) {
    const warm = colors.find(hex => { const [r,g,b] = hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)); return r > b * 1.08 && r >= g * .95; });
    const source = warm ?? colors[0] ?? "#8D7B6A";
    const rgb = source.slice(1).match(/../g)!.map(v=>parseInt(v,16));
    // Muted warm tint derived from the observed color, rather than a fixed navy UI accent.
    const earth = [157, 133, 109];
    return "#" + rgb.map((v,i)=>Math.round(v * .4 + earth[i] * .6).toString(16).padStart(2,"0")).join("");
  }
  return colors.find((hex) => { const rgb = hex.slice(1).match(/../g)!.map((v) => parseInt(v, 16)); return Math.max(...rgb) - Math.min(...rgb) > 35; })
    ?? colors.find((hex) => contrastInk(hex) === "#FFFFFF") ?? "#8D7B6A";
}
