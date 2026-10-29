import type { BackgroundRecommendation, CarouselSlide, CreativeStrategy, Locale, PhotoDesignData, StudioScene } from "@/lib/schema/campaign";
import { DEFAULT_SCENES, requestScenes } from "./studio-scenes";
import type { ImageInput } from "./image";
import { llmImage } from "./llm";
import { MATERIAL_DISTINCTNESS_RULE, learnedRulesBlock } from "./material-library";
import type { Provider } from "./provider";
import { feedImageSize as feedSize, storyImageSize as storySize } from "./meta";

export type FeedArtwork = {
  hook: string;
  body: string;
  cta: string;
  concept: string;
  artDirection: string;
  pills: string[];
  captionInstagram?: string;
  captionFacebook?: string;
};

export type StoryArtwork = {
  hook: string;
  cta: string;
  concept: string;
  artDirection: string;
};

export type MuseImageInput = {
  locale: Locale;
  productDescription: string;
  designData: PhotoDesignData | null;
  photo: ImageInput;
  feed: [FeedArtwork, FeedArtwork];
  story: StoryArtwork | null;
  creativeStrategy: CreativeStrategy;
  carouselSlides: CarouselSlide[] | null;
  productCount?: number;
  groupMode?: boolean;
  background?: BackgroundRecommendation | null;
  /** Reglas del skill aprendido que aplican a esta categoría (puede variar). */
  learnedRules?: string[];
};

export type MuseImageOutput = {
  scenes: [StudioScene, StudioScene, StudioScene];
  feed: [string | null, string | null];
  feedErrors: [string | null, string | null];
  storyImage: string | null;
  storyError: string | null;
  carouselImages: [string | null, string | null, string | null, string | null] | null;
  carouselErrors: [string | null, string | null, string | null, string | null] | null;
};

const localeNames: Record<Locale, string> = { es: "español", pt: "portugués de Brasil", en: "inglés" };
const POSTER_TIMEOUT_MS = Number(process.env.MUSE_IMAGE_TIMEOUT_MS ?? 90_000) || 90_000;

export async function runMuseImage(input: MuseImageInput, provider: Provider): Promise<MuseImageOutput> {
  if (provider === "demo") {
    return {
      scenes: DEFAULT_SCENES as [StudioScene, StudioScene, StudioScene],
      feed: [null, null],
      feedErrors: [null, null],
      storyImage: null,
      storyError: null,
      carouselImages: input.carouselSlides ? [null, null, null, null] : null,
      carouselErrors: input.carouselSlides ? [null, null, null, null] : null,
    };
  }
  const scenesPromise = requestScenes(input.productDescription, AbortSignal.timeout(30_000)).catch(() => DEFAULT_SCENES);
  const feedPromise = Promise.allSettled(feedPrompts(input).map((prompt) =>
    llmImage(prompt, input.photo, { timeoutMs: POSTER_TIMEOUT_MS, size: feedSize() }),
  ));
  const storyPromise = input.story
    ? llmImage(storyPrompt(input, input.story), input.photo, { timeoutMs: POSTER_TIMEOUT_MS, size: storySize() })
        .then((value) => ({ ok: true as const, value }))
        .catch((reason: unknown) => ({ ok: false as const, reason }))
    : Promise.resolve(null);
  const carouselPromise = input.carouselSlides ? Promise.allSettled(carouselPrompts(input).map((prompt) =>
    llmImage(prompt, input.photo, { timeoutMs: POSTER_TIMEOUT_MS, size: feedSize() }),
  )) : Promise.resolve(null);
  const [rawScenes, settled, storySettled, carousel] = await Promise.all([scenesPromise, feedPromise, storyPromise, carouselPromise]);
  const feed = settled.map((item) => item.status === "fulfilled" ? `data:${item.value.mimeType};base64,${item.value.base64}` : null) as MuseImageOutput["feed"];
  const feedErrors = settled.map((item) => {
    if (item.status === "fulfilled") return null;
    const message = item.reason instanceof Error ? item.reason.message : String(item.reason);
    return message.slice(0, 240);
  }) as MuseImageOutput["feedErrors"];
  const storyImage = storySettled?.ok ? `data:${storySettled.value.mimeType};base64,${storySettled.value.base64}` : null;
  const storyError = storySettled && !storySettled.ok
    ? (storySettled.reason instanceof Error ? storySettled.reason.message : String(storySettled.reason)).slice(0, 240)
    : null;
  const carouselImages = carousel?.map((item) => item.status === "fulfilled" ? `data:${item.value.mimeType};base64,${item.value.base64}` : null) as MuseImageOutput["carouselImages"] ?? null;
  const carouselErrors = carousel?.map((item) => item.status === "fulfilled" ? null : (item.reason instanceof Error ? item.reason.message : String(item.reason)).slice(0, 240)) as MuseImageOutput["carouselErrors"] ?? null;
  return { scenes: (rawScenes.length === 3 ? rawScenes : DEFAULT_SCENES) as MuseImageOutput["scenes"], feed, feedErrors, storyImage, storyError, carouselImages, carouselErrors };
}

/**
 * GEOMETRÍA EXACTA: img2img NO preserva proporciones por sí solo — el modelo
 * tiende a estirar el envase para llenar encuadres verticales. Esta cláusula
 * va en TODOS los prompts de pieza; el revisor visual la verifica y un
 * incumplimiento genera una regeneración.
 */
const GEOMETRY_RULE =
  "GEOMETRÍA EXACTA DEL ENVASE: copiá las proporciones ancho/alto del producto de la foto con precisión fotográfica. " +
  "PROHIBIDO estirarlo en vertical para llenar el encuadre o aplastarlo en horizontal: un envase cuadrado sigue cuadrado, uno alto sigue alto, uno ancho sigue ancho. " +
  "Si el encuadre sobra, se llena con escena y aire, NUNCA deformando el producto.";

const THREE_PLANES =
  "COMPOSICIÓN ADAPTADA: seguí la dirección de arte de esta pieza. Podés usar profundidad fotográfica, ilustración, tratamiento gráfico o fondo simple cuando sea pertinente; no agregues una cocina, mesa, podio, arquitectura, desenfoque ni objetos por defecto. Si la escena muestra un apoyo físico, iluminá el producto y su sombra de contacto de manera coherente. Si componés una escena fotográfica completa, el producto se apoya en un suelo o superficie visible con sombra coherente: prohibido flotar en un degradado sin suelo ni horizonte. Conservá espacio y contraste para texto y producto.";

const REFERENCE_PRIVACY = "La foto adjunta es referencia del producto, no un fondo obligatorio: aislá visualmente el producto y creá el entorno definido por la dirección de arte, sin copiar por defecto la calle, vivienda, personas ni otros elementos de la foto. Ocultá totalmente cualquier patente, chapa o matrícula con una placa lisa sin caracteres; también eliminá números de serie, documentos y direcciones visibles. No los transcribas ni sustituyas con números inventados. Conservá el diseño y proporciones del producto.";

export function carouselPrompts(input: MuseImageInput): string[] {
  const learned = learnedRulesBlock(input.learnedRules ?? []);
  return (input.carouselSlides ?? []).map((slide, index) => [
    `Diseñá la lámina ${index + 1} de una secuencia publicitaria de cuatro imágenes verticales 4:5 en ${localeNames[input.locale]}.`,
    `Producto de referencia: ${input.productDescription}. Conservá forma, marca, envase, etiquetas y colores de la foto adjunta sin inventar otro producto.`,
    GEOMETRY_RULE,
    REFERENCE_PRIVACY,
    THREE_PLANES,
    MATERIAL_DISTINCTNESS_RULE,
    ...(learned ? [learned] : []),
    `Campaña: ${input.creativeStrategy.campaignIdea}. Audiencia: ${input.creativeStrategy.audience}. Mundo visual común para todas las láminas y las piezas de feed: ${input.creativeStrategy.visualWorld}.`,
    `Etapa narrativa ${slide.stage}: desarrollá una escena distinta y apropiada para el producto dentro del mismo mundo visual. Mantené identidad, luz y paleta coherentes sin repetir una plantilla o posición fija. Diseñá una composición legible en móvil, con elementos clave dentro del 90% central del encuadre.`,
    `Texto exacto: titular "${slide.headline}"; apoyo "${slide.body}"${index === 3 ? `; llamado a la acción "${slide.cta}"` : ""}. No inventes testimonios, ofertas, prestaciones, resultados ni cifras; respetá cualquier condición como 'hasta'. Si el apoyo no entra, omitilo.`,
  ].join("\n\n"));
}

/** Cada dirección de feed recibe el mismo mundo creativo y una dirección
 * propia; no hay recetas visuales fijas por índice. La foto se usa como
 * referencia img2img. El asset 4:5 sirve para Instagram y Facebook. */
export function feedPrompts(input: MuseImageInput): [string, string] {
  const { creativeStrategy: strategy } = input;
  const bgClause = backgroundClause(input);
  const multiClause = multiClauseText(input);
  const learned = learnedRulesBlock(input.learnedRules ?? []);
  return input.feed.map((piece, i) => [
    `Creá una pieza publicitaria vertical 4:5 para ${localeNames[input.locale]}, pensada para el feed de Instagram y Facebook (un solo asset para ambas redes).`,
    `PRODUCTO OBSERVADO: ${input.productDescription}. Conservá la apariencia, forma, colores, envase y etiquetas de la foto adjunta. No reemplaces ni inventes versiones o marcas.`,
    GEOMETRY_RULE,
    REFERENCE_PRIVACY,
    multiClause,
    bgClause,
    MATERIAL_DISTINCTNESS_RULE,
    ...(learned ? [learned] : []),
    "EJECUCIÓN: la dirección específica decide el entorno y la distribución. Evitá una receta visual por índice; no agregues utilería ajena al concepto ni cambies solo el color para distinguir las piezas.",
    `ESTRATEGIA COMPARTIDA: ${strategy.campaignIdea}. Audiencia: ${strategy.audience}. Objetivo: ${strategy.objective}.`,
    `MUNDO VISUAL DE LA CAMPAÑA: ${strategy.visualWorld}. Los colores observados del producto son ${input.designData?.dominantColorHex ?? "desconocido"} y ${input.designData?.secondaryColorHex ?? "desconocido"}; usalos como referencia, no como una paleta obligatoria ni los conviertas en una plantilla.`,
    `DIRECCIÓN ${i + 1}: ${piece.concept}. DIRECCIÓN DE ARTE ESPECÍFICA: ${piece.artDirection}.`,
    `Mantené coherencia visual de campaña pero diferenciá el ángulo, el encuadre y la distribución de las dos direcciones. La imagen debe narrar una situación o beneficio relevante; no agregues elementos arbitrarios. Ubicá producto, titular y CTA dentro del 90% central del encuadre: los bordes pueden recortarse hasta un 7% al normalizar el formato.`,
    `Jerarquizá con claridad titular, producto y CTA; integrá solo el apoyo que resulte legible. PROHIBIDO apoyo en cuerpo diminuto o ilegible: tamaño mínimo legible a distancia de móvil, y si no entra así, se omite. Copy exacto: titular "${piece.hook}"; apoyo "${piece.body}"; CTA "${piece.cta}". Datos secundarios opcionales ${piece.pills.map((p) => `"${p}"`).join(", ") || "ninguno"}: omitilos si enumeran rasgos evidentes o no refuerzan la idea; no impongas chips ni filas de iconos por defecto. Respetá idioma, tildes, condiciones y cifras; no inventes promesas, descuentos, testimonios o información. Si un texto secundario no cabe, omitilo. Si usás iconos, mantené un estilo coherente.`,
    `Sin marcas de agua ni logos inventados.`,
  ].join("\n\n")) as [string, string];
}

/**
 * Outpainting de story: cuando el proveedor devolvió 3:4 en vez de 9:16, este
 * prompt se usa en el reintento con el arte fallido como referencia. Extiende
 * la escena arriba y abajo sin tocar producto ni texto: lo más parecido a
 * nativo cuando no hay 9:16 directo.
 */
export function storyOutpaintPrompt(input: MuseImageInput, story: StoryArtwork): string {
  return [
    `Tenés una pieza publicitaria 3:4 ya compuesta (imagen de referencia) para ${localeNames[input.locale]}. Tu trabajo es OUTPAINTING, no rediseño: extendé la escena verticalmente hasta un lienzo 9:16 NATIVO, inventando arriba y abajo la continuación lógica del fondo, la superficie, la luz y la atmósfera.`,
    `PROHIBIDO redibujar, mover, reescalar o retocar el producto, el titular "${story.hook}", el CTA "${story.cta}" o cualquier texto existente: van idénticos en el centro del nuevo lienzo. Solo se extiende el entorno.`,
    `SAFE ZONES DE META (obligatorias): en el lienzo 1080×1920 final, el 14% superior (268px) y el 20% inferior (384px) quedan LIBRES de texto, porque ahí van la UI de Instagram y la barra de respuesta. La extensión agregada debe ser escena limpia, sin inventar titulares, sellos ni botones nuevos.`,
    `GEOMETRÍA EXACTA DEL ENVASE: conservá las proporciones ancho/alto de la referencia con precisión fotográfica. PROHIBIDO estirarlo en vertical o aplastarlo.`,
    `Estrategia compartida: ${input.creativeStrategy.campaignIdea}. Mundo visual: ${input.creativeStrategy.visualWorld}. Sin marcas de agua ni logos inventados.`,
  ].join("\n\n");
}

/** Story vertical 9:16 NATIVA: se compone para el formato, no se recorta del
 * feed. Solo entran titular + CTA; los extremos quedan libres para la
 * interfaz de la app. */
export function storyPrompt(input: MuseImageInput, story: StoryArtwork): string {
  const { creativeStrategy: strategy } = input;
  const learned = learnedRulesBlock(input.learnedRules ?? []);
  return [
    `Creá una story publicitaria vertical 9:16 NATIVA para ${localeNames[input.locale]} (Instagram/Facebook Stories). Componé directamente en vertical: NO es un recorte de otra pieza.`,
    `PRODUCTO OBSERVADO: ${input.productDescription}. Conservá la apariencia, forma, colores, envase y etiquetas de la foto adjunta. No reemplaces ni inventes versiones o marcas.`,
    GEOMETRY_RULE,
    REFERENCE_PRIVACY,
    multiClauseText(input),
    backgroundClause(input),
    MATERIAL_DISTINCTNESS_RULE,
    ...(learned ? [learned] : []),
    "COMPOSICIÓN VERTICAL: adaptá escala, ubicación, luz y recursos a la dirección de arte y al producto. Priorizá legibilidad, proporciones reales y aire; no impongas mesa, podio, plato, fondo oscuro ni posición central por defecto.",
    `ESTRATEGIA COMPARTIDA: ${strategy.campaignIdea}. Audiencia: ${strategy.audience}. MUNDO VISUAL: ${strategy.visualWorld} (mismo que las piezas de feed).`,
    `CONCEPTO: ${story.concept}. DIRECCIÓN DE ARTE: ${story.artDirection}.`,
    `SAFE ZONES DE META (obligatorias): en el lienzo 1080×1920, el 14% superior (268px) y el 20% inferior (384px) quedan LIBRES de titulares y botones CTA, porque ahí van la UI de Instagram y la barra de respuesta. Bandas exactas: titular entre el 16% y el 30% de la altura (debajo del 15% superior, arriba del producto); botón CTA entre el 64% y el 74% (por encima del 22% inferior, bien despegado del borde; si toca el cuarto inferior la pieza se rechaza). Anclá el CTA al producto: inmediatamente debajo de su base, sin hueco muerto entre ambos. Todo el texto debe ser grande y legible a distancia de móvil.`,
    `Copy exacto: titular "${story.hook}"; CTA "${story.cta}". Respetá idioma, tildes, condiciones y cifras; no inventes promesas, descuentos, testimonios o información.`,
    `Sin marcas de agua ni logos inventados.`,
  ].join("\n\n");
}

function backgroundClause(input: MuseImageInput): string {
  const bg = input.background;
  const grouped = isGrouped(input);
  if (!bg) return grouped ? `${THREE_PLANES} ${BUNDLE_GROUNDING(input.productCount ?? 2)}` : THREE_PLANES;
  return `${THREE_PLANES}${grouped ? ` ${BUNDLE_GROUNDING(input.productCount ?? 2)}` : ""} La observación inicial de fondo (${bg.mode}: ${bg.reason}) es orientativa, no una plantilla obligatoria para todas las piezas; priorizá la dirección de cada concepto.`;
}

function isGrouped(input: MuseImageInput): boolean {
  const n = input.productCount ?? 1;
  return (input.groupMode ?? n > 1) && n > 1;
}

/**
 * Apoyo físico obligatorio del bundle: lo que separa un combo profesional
 * de un "collage de productos flotando en un vacío azul".
 */
function BUNDLE_GROUNDING(n: number): string {
  return (
    `GRUPO DE ${n} PRODUCTOS: conservá todos los productos reconocibles y sus proporciones, con jerarquía y escala coherentes. ` +
    "Si están apoyados, que compartan un entorno plausible y sombras de contacto coherentes; si se usa un recurso gráfico o flotación intencional, que sea visualmente claro y pertinente al concepto."
  );
}

function multiClauseText(input: MuseImageInput): string {
  const n = input.productCount ?? 1;
  if (!isGrouped(input)) return "Pieza de un producto: mantené su identidad y envase reconocibles. La jerarquía entre envase, producto en uso y otros elementos depende del argumento de esta pieza; no impongas siempre la caja grande en primer plano.";
  return (
    `FLYER CONJUNTO DE ${n} PRODUCTOS: componé los ${n} productos juntos en el mismo lienzo, jerarquizados (héroe al frente, secundarios al costado con escala ligeramente menor o profundidad de campo coherente) sin recortarse entre sí ni deformarse. ` +
    "Conservá la apariencia exacta y la geometría estricta (proporciones ancho/alto) de CADA empaque según la referencia: PROHIBIDO estirar o aplastar. " +
    "La composición respira: aire alrededor del grupo y jerarquía clara."
  );
}
