import type { CampaignFormat, CarouselSlide, CreativeStrategy, Locale, PhotoDesignData, StudioScene } from "@/lib/schema/campaign";
import { DEFAULT_SCENES, requestScenes } from "./studio-scenes";
import type { ImageInput } from "./image";
import { llmImage } from "./llm";
import type { Provider } from "./provider";

export type MuseImageInput = {
  locale: Locale;
  format: CampaignFormat;
  productDescription: string;
  designData: PhotoDesignData | null;
  photo: ImageInput;
  hooks: [string, string, string];
  bodies: [string, string, string];
  ctas: [string, string, string];
  concepts: [string, string, string];
  artDirections: [string, string, string];
  pills: [string[], string[], string[]];
  creativeStrategy: CreativeStrategy;
  carouselSlides: CarouselSlide[] | null;
};

export type MuseImageOutput = {
  scenes: [StudioScene, StudioScene, StudioScene];
  posters: [string | null, string | null, string | null];
  errors: [string | null, string | null, string | null];
  carouselImages: [string | null, string | null, string | null, string | null] | null;
  carouselErrors: [string | null, string | null, string | null, string | null] | null;
};

const localeNames: Record<Locale, string> = { es: "español", pt: "portugués de Brasil", en: "inglés" };
const POSTER_TIMEOUT_MS = Number(process.env.MUSE_IMAGE_TIMEOUT_MS ?? 90_000) || 90_000;

export async function runMuseImage(input: MuseImageInput, provider: Provider): Promise<MuseImageOutput> {
  if (provider === "demo") {
    return { scenes: DEFAULT_SCENES as [StudioScene, StudioScene, StudioScene], posters: [null, null, null], errors: [null, null, null], carouselImages: input.carouselSlides ? [null, null, null, null] : null, carouselErrors: input.carouselSlides ? [null, null, null, null] : null };
  }
  const scenesPromise = requestScenes(input.productDescription, AbortSignal.timeout(30_000)).catch(() => DEFAULT_SCENES);
  const artworksPromise = Promise.allSettled(posterPrompts(input).map((prompt) =>
    llmImage(prompt, input.photo, { timeoutMs: POSTER_TIMEOUT_MS }),
  ));
  const carouselPromise = input.carouselSlides ? Promise.allSettled(carouselPrompts(input).map((prompt) =>
    llmImage(prompt, input.photo, { timeoutMs: POSTER_TIMEOUT_MS }),
  )) : Promise.resolve(null);
  const [rawScenes, settled, carousel] = await Promise.all([scenesPromise, artworksPromise, carouselPromise]);
  const posters = settled.map((item) => item.status === "fulfilled" ? `data:${item.value.mimeType};base64,${item.value.base64}` : null) as MuseImageOutput["posters"];
  const errors = settled.map((item) => {
    if (item.status === "fulfilled") return null;
    const message = item.reason instanceof Error ? item.reason.message : String(item.reason);
    return message.slice(0, 240);
  }) as MuseImageOutput["errors"];
  const carouselImages = carousel?.map((item) => item.status === "fulfilled" ? `data:${item.value.mimeType};base64,${item.value.base64}` : null) as MuseImageOutput["carouselImages"] ?? null;
  const carouselErrors = carousel?.map((item) => item.status === "fulfilled" ? null : (item.reason instanceof Error ? item.reason.message : String(item.reason)).slice(0, 240)) as MuseImageOutput["carouselErrors"] ?? null;
  return { scenes: (rawScenes.length === 3 ? rawScenes : DEFAULT_SCENES) as MuseImageOutput["scenes"], posters, errors, carouselImages, carouselErrors };
}

export function carouselPrompts(input: MuseImageInput): string[] {
  return (input.carouselSlides ?? []).map((slide, index) => [
    `Diseñá la lámina ${index + 1} de una secuencia publicitaria de cuatro imágenes verticales 3:4 en ${localeNames[input.locale]}.`,
    `Producto de referencia: ${input.productDescription}. Conservá forma, marca, envase, etiquetas y colores de la foto adjunta sin inventar otro producto.`,
    `Campaña: ${input.creativeStrategy.campaignIdea}. Audiencia: ${input.creativeStrategy.audience}. Mundo visual común para todas las láminas y los posts: ${input.creativeStrategy.visualWorld}.`,
    `Etapa narrativa ${slide.stage}: desarrollá una escena distinta y apropiada para el producto dentro del mismo mundo visual. Mantené identidad, luz y paleta coherentes sin repetir una plantilla o posición fija. Diseñá una composición legible en móvil.`,
    `Texto exacto: titular "${slide.headline}"; apoyo "${slide.body}"${index === 3 ? `; llamado a la acción "${slide.cta}"` : ""}. No inventes testimonios, ofertas, prestaciones, resultados ni cifras; respetá cualquier condición como 'hasta'. Si el apoyo no entra, omitilo.`,
  ].join("\n\n"));
}

/** Cada pieza recibe el mismo mundo creativo y una dirección propia; no hay
 * recetas visuales fijas por índice. La foto se usa como referencia img2img. */
export function posterPrompts(input: MuseImageInput): [string, string, string] {
  const { creativeStrategy: strategy } = input;
  return input.artDirections.map((direction, i) => [
    `Creá una pieza publicitaria vertical 3:4 para ${localeNames[input.locale]}, pensada para una campaña en Instagram y Facebook.`,
    `PRODUCTO OBSERVADO: ${input.productDescription}. Conservá la apariencia, forma, colores, envase y etiquetas de la foto adjunta. No reemplaces ni inventes versiones o marcas.`,
    `ESTRATEGIA COMPARTIDA: ${strategy.campaignIdea}. Audiencia: ${strategy.audience}. Objetivo: ${strategy.objective}.`,
    `MUNDO VISUAL DE LA CAMPAÑA: ${strategy.visualWorld}. Los colores observados del producto son ${input.designData?.dominantColorHex ?? "desconocido"} y ${input.designData?.secondaryColorHex ?? "desconocido"}; usalos como referencia, no como una paleta obligatoria ni los conviertas en una plantilla.`,
    `PIEZA ${i + 1}: ${input.concepts[i]}. DIRECCIÓN DE ARTE ESPECÍFICA: ${direction}.`,
    `Interpretá libremente la escena, composición, encuadre, elementos, fondo, materiales, luz y tipografía para el producto y el concepto. La imagen debe narrar una situación o beneficio relevante; no agregues elementos arbitrarios. No hay recetas por número de pieza: no recurras de forma predeterminada a fondo blanco editorial, división central o fondo oscuro con neón. Mantené coherencia visual de campaña pero diferenciá el ángulo, el encuadre y la distribución de las tres piezas.`,
    `Jerarquizá con claridad titular, producto y CTA; integrá solo el apoyo que resulte legible. Copy exacto: titular "${input.hooks[i]}"; apoyo "${input.bodies[i]}"; beneficios ${input.pills[i].map((p) => `"${p}"`).join(", ") || "ninguno"}; CTA "${input.ctas[i]}". Respetá idioma, tildes, condiciones y cifras; no inventes promesas, descuentos, testimonios o información. Si un texto secundario no cabe, omitilo.`,
    `La imagen se adaptará a Story 9:16 en la app manteniendo el mismo arte y concepto. Reservá espacio limpio alrededor de textos y producto. Sin marcas de agua ni logos inventados.`,
  ].join("\n\n")) as [string, string, string];
}
