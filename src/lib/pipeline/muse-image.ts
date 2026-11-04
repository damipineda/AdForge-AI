import type { BackgroundRecommendation, CarouselSlide, CreativeStrategy, Locale, PhotoDesignData, StudioScene } from "@/lib/schema/campaign";
import { DEFAULT_SCENES, requestScenes } from "./studio-scenes";
import type { ImageInput } from "./image";
import { llmImage } from "./llm";
import { MATERIAL_DISTINCTNESS_RULE, DYNAMIC_ART_DIRECTION, learnedRulesBlock } from "./material-library";
import { brandLogoClause, brandPaletteLine, stripBrandNameFromDirection, type BrandContext } from "./brand";
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
  /** Kit de marca del proyecto; ausente = diseñar libremente. */
  brand?: BrandContext | null;
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
  "GEOMETRÍA EXACTA DEL ENVASE, ESCALA FÍSICA RELATIVA Y AISLAMIENTO DE ETIQUETAS: copiá las proporciones ancho/alto de cada producto de la foto con precisión fotográfica. " +
  "PROHIBIDO estirarlo en vertical para llenar el encuadre o aplastarlo en horizontal: un envase cuadrado sigue cuadrado, uno alto sigue alto, uno ancho sigue ancho. " +
  "Si hay varios productos, respetá su relación de volumen real: una botella chica (500–750 ml o gatillo pulverizador) JAMÁS puede verse más alta ni más ancha que una botella grande de 1,5 L a su lado, ni siquiera estando medio paso adelante. " +
  "AISLAMIENTO DE ETIQUETAS: cada botella conserva únicamente su propia marca, diseño gráfico y fragancia de su recuadro de referencia; PROHIBIDO mezclar o copiar textos de una etiqueta dentro del envase de otro producto (ej. jamás imprimir la fragancia de un limpiador en la etiqueta de otro). " +
  "Para el micro-texto diminuto que no llegue a leerse, resolvelo como trazo limpio o desenfoque óptico natural sin inventar sílabas deformes.";

const THREE_PLANES =
  "FOTOGRAFÍA COMERCIAL EN TRES PLANOS: primer plano con textura real y profundidad, producto nítido en plano medio con iluminación de estudio (key light + rim light sutil que recorte siluetas y dé volumen real al plástico, vidrio o metal), fondo escénico profundo con bokeh y luz direccional dramática coherente. Elegí entorno según producto y argumento (no uses gimnasio, ciudad o interiores por defecto). Sombras de contacto oscuras (ambient occlusion) bajo la base exacta de cada producto y reflejos físicamente plausibles sobre la superficie. En la zona de copy reducí detalle con shallow depth of field f/1.8, conservando la profundidad y el contexto; NO la conviertas en pared lisa, vacío de catálogo ni franja de color. El entorno continúa a sangre en todo el encuadre.";

const REFERENCE_PRIVACY = "La foto adjunta es referencia del producto, no un fondo obligatorio: aislá visualmente el producto y creá el entorno definido por la dirección de arte, sin copiar por defecto la calle, vivienda, personas ni otros elementos de la foto. Si la imagen de referencia es una grilla con varios productos en recuadros, integrá todos los productos en UNA ÚNICA escena continua y jamás reproduzcas las divisiones ni los bordes de la grilla. Ocultá totalmente cualquier patente, chapa o matrícula con una placa lisa sin caracteres; también eliminá números de serie, documentos y direcciones visibles. No los transcribas ni sustituyas con números inventados. Conservá el diseño y proporciones del producto.";

/**
 * Variedad de CTA: un CTA NO siempre es un botón redondeado abajo. Cambia de
 * forma gráfica y posición según la pieza y su dirección: frase contundente en
 * tipografía grande y bold sin caja de botón, recuadro o bloque destacado de
 * cierre, cupón desprendible / sello promocional o callout lateral con acento.
 * PROHIBIDO resolver las piezas siempre con el mismo botón abajo: la repetición
 * del formato también es clonación.
 */
const CTA_VARIETY =
  "VARIEDAD DE CTA (EL CTA NO SIEMPRE ES UN BOTÓN ABAJO): un llamado a la acción NO tiene por qué ser una pastilla o botón redondeado al pie; cambiá la forma gráfica, alineación y contraste en cada pieza según su dirección de arte: (1) Frase contundente al final en tipografía grande y bold SIN caja de botón (con subrayado editorial, flecha o acento direccional), (2) Recuadro o bloque destacado de cierre con contraste agresivo, (3) Sello o cupón desprendible con borde punteado (ideal en promos/descuentos), o (4) Callout compacto alineado a un lado en tono dominante/oscuro del producto. PROHIBIDO resolver todas las piezas con el mismo botón abajo y PROHIBIDO usar un botón rojo semáforo genérico (#CC0000) repetido en toda la campaña salvo que la marca sea roja: si el CTA repite color, lugar y formato de otra pieza, se considera clonación.";

/**
 * Contrato texto-escena: el texto nunca pisa al producto y la escena es el
 * contexto real de uso. Va en las 3 superficies (feed, story, carrusel).
 */
const TEXT_SCENE_CONTRACT =
  "CONTRATO TEXTO-ESCENA (SIN TARJETAS OPACAS QUE TAPEN EL PRODUCTO): ningún texto (titular, apoyo, pills, CTA, sellos) ni ningún recuadro o tarjeta de fondo puede ir ENCIMA del producto, ni taparlo siquiera parcialmente, ni cortar la base de las botellas. PROHIBIDO colocar cajas blancas o banners opacos grandes sobre la mitad inferior de los productos: todo texto, pastilla y CTA vive en zonas libres del encuadre con aire a su alrededor (sobre fondo desenfocado f/1.8 o viñeta sutil), y los textos no se pisan entre sí. La escena debe ser el contexto real de uso de ESTE producto y coherente con lo que el copy promete; en productos de limpieza del hogar usá superficies arquitectónicas reales (mesada, piso cerámico/porcelanato, bacha) y PROHIBIDO usar rocas al aire libre, cascadas, pizarras de comida o decorar el piso con rodajas de limón, ramas de romero o ingredientes culinarios crudos.";

/** Paleta de marca + reserva de esquina para el logo (solo si hay kit). */
function brandClause(input: MuseImageInput): string[] {
  const palette = brandPaletteLine(input.brand ?? null);
  const logo = brandLogoClause(input.brand ?? null);
  return [palette, logo].filter((line) => line !== "");
}

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
    TEXT_SCENE_CONTRACT,
    CTA_VARIETY,
    ...brandClause(input),
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
    `DIRECCIÓN ${i + 1}: ${stripBrandNameFromDirection(piece.concept, input.brand)}. DIRECCIÓN DE ARTE ESPECÍFICA: ${stripBrandNameFromDirection(piece.artDirection, input.brand)}.`,
    `DISEÑO INTEGRADO OBLIGATORIO: generá el anuncio completo con tipografía editorial, producto y CTA compuestos por vos. No habrá capas añadidas después. Resolvé jerarquía en 3 niveles (1. Gancho/Encabezado dominante arriba o en el foco; 2. Mensaje principal breve con mucho espacio negativo alrededor; 3. Cierre y acción con contraste agresivo y direccionalidad visual). En fondos claros/beige usá carbón limpio sin sombras duras; en escenas oscuras texto claro/luminoso. Componé el texto directo sobre la zona despejada de la imagen, SIN tarjetas ni bloques blancos opacos que tapen los envases. Para el cierre CTA de esta variante ${i + 1}, respetá la forma gráfica de su dirección de arte (${i === 0 ? "ej. frase contundente en tipografía grande y bold con acento direccional o bloque destacado en el tono " + (input.designData?.dominantColorHex ?? "dominante del envase") : "formato gráfico distinto a la variante 1: frase tipográfica bold sin botón, cupón/sello o recuadro lateral en tono contrastante del producto"}) y jamás repitas el mismo botón redondeado abajo ni un rojo genérico de oferta.`,
    TEXT_SCENE_CONTRACT,
    `COPY EXACTO: titular ${JSON.stringify(piece.hook)}; apoyo ${JSON.stringify(piece.body)}; cierre CTA ${JSON.stringify(piece.cta)}. No reformules, traduzcas ni inventes otras palabras o cifras. Si falta espacio, ajustá composición y tamaño antes de sacrificar legibilidad.`,
    CTA_VARIETY,
    piece.pills.length ? `PASTILLAS DE BENEFICIOS INTEGRADAS donde la dirección las ubique (en zona libre, como chips horizontales compactos y alineados sin pisar envases ni la esquina del logo): ${JSON.stringify(piece.pills.slice(0,3))}. Incorporá iconos discretos y solo esos textos verificados, sin inventar atributos.` : "No agregues listas ni sellos sin contenido verificado.",
    DYNAMIC_ART_DIRECTION,
    ...brandClause(input),
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
    `Tenés una pieza publicitaria 3:4 ya compuesta (imagen de referencia) para ${localeNames[input.locale]}. Tu trabajo es OUTPAINTING, no rediseño: extendé la escena verticalmente hasta un lienzo 9:16 NATIVO, inventando arriba y abajo la continuación lógica del fondo, la superficie, la luz y la atmósfera en tres planos. PROHIBIDO franjas lisas, marcos, degradados de relleno y uniones horizontales visibles: la escena continúa a sangre.`,
    `PROHIBIDO redibujar, mover, reescalar o retocar el producto; solo se extiende el entorno. Conservá también el titular, el CTA y la tipografía ya integrados, con su copy exacto, sin duplicarlos ni alterarlos.`,
    `SAFE ZONES DE META (obligatorias, spec Instagram 2025): en el lienzo 1080×1920 final, los 250px superiores (~13%) y los 250px inferiores (~13%) quedan LIBRES de texto, porque ahí van la UI de Instagram y la barra de respuesta. La extensión agregada debe ser escena limpia, sin inventar titulares, sellos ni botones nuevos.`,
    `GEOMETRÍA EXACTA DEL ENVASE: conservá las proporciones ancho/alto de la referencia con precisión fotográfica. PROHIBIDO estirarlo en vertical o aplastarlo.`,
    `Estrategia compartida: ${input.creativeStrategy.campaignIdea}. Concepto: ${story.concept}. Mundo visual: ${input.creativeStrategy.visualWorld}. Sin marcas de agua ni logos inventados.`,
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
    "COMPOSICIÓN VERTICAL: adaptá escala, ubicación, luz y recursos a la dirección de arte y al producto sobre una única superficie horizontal continua (mesada o piso interior real, NUNCA escalones de roca ni productos apilados en dos pisos). Priorizá legibilidad, proporciones reales y aire; no impongas mesa, podio, plato, fondo oscuro ni posición central por defecto.",
    `ESTRATEGIA COMPARTIDA: ${strategy.campaignIdea}. Audiencia: ${strategy.audience}. MUNDO VISUAL: ${strategy.visualWorld} (mismo que las piezas de feed).`,
    `CONCEPTO: ${stripBrandNameFromDirection(story.concept, input.brand)}. DIRECCIÓN DE ARTE: ${stripBrandNameFromDirection(story.artDirection, input.brand)}.`,
    `DISEÑO INTEGRADO OBLIGATORIO: integrá titular editorial y cierre CTA en la imagen final; no se agrega texto después. Elegí la composición vertical más adecuada al producto y al argumento (lectura vertical con espacio negativo generoso o composición central/radial), con escala propia y relación texto/producto distinta al feed. Escena continua a sangre con profundidad, sin bandas lisas ni rellenos artificiales. El cierre CTA NO tiene por qué ser una barra o botón ancho abajo: puede ser una frase contundente en tipografía grande y bold con flecha/subrayado o un recuadro/sello compacto de alto contraste con el color dominante o secundario del producto (${input.designData?.dominantColorHex ?? "azul/verde profundo del envase"}), nunca un botón rojo genérico ni una barra de lado a lado.`,
    TEXT_SCENE_CONTRACT,
    `COPY EXACTO: titular ${JSON.stringify(story.hook)}; cierre CTA ${JSON.stringify(story.cta)}. No agregues párrafos ni afirmaciones nuevas. Tipografía elegante y legible, interlineado cuidado y margen respecto del producto.`,
    CTA_VARIETY + " En story, cualquier formato elegido debe terminar antes del 87% del alto (idealmente ubicado entre el 72% y el 80% de la altura).",
    "SAFE ZONES (spec Instagram 2025): en 1080×1920, mantené el titular debajo del 13% superior (250px) y todo el CTA antes del 87% de alto (1670px), ubicándolo preferentemente entre el 72% y el 80% de la altura (1380px–1535px) para dejar el tramo inferior completamente libre de botones o textos. Los extremos muestran la escena sin textos, no son franjas de relleno. Tipografía carbón sobre beige/crema y clara sobre oscuro, sin sombras duras ni colisiones. CTA armónico con la marca.",
    ...brandClause(input),
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
 * de un "collage de productos flotando en un vacío azul" o "apilados en rocas".
 */
function BUNDLE_GROUNDING(n: number): string {
  return (
    `GRUPO DE ${n} PRODUCTOS (FÍSICA, ESCALA REAL Y CLUSTER EN DOS PLANOS CERCANOS): conservá todos los ${n} productos reconocibles en un cluster compacto y coherente en V o media luna sobre UNA ÚNICA superficie horizontal plana y continua (ej. 2 envases protagonistas medio paso adelante y los otros inmediatamente detrás/al lado asomando entre ellos con solapamiento lateral del 15-25% sin tapar las marcas). ` +
    "PROHIBIDO alinear los envases en una fila plana de góndola uno al lado del otro de borde a borde como soldados. " +
    "REGLA DE BASES ALINEADAS: las bases inferiores de TODOS los envases deben verse apoyadas sobre el MISMO plano horizontal casi a la misma altura (diferencia vertical entre la base más adelantada y la más atrasada menor al 5% del alto del lienzo), con sombras de contacto oscuras bajo cada base. " +
    "PROHIBIDO elevar un producto por detrás haciendo que asome por encima de los hombros de los demás con la base suspendida a mitad de altura (efecto botella flotando atrás), y PROHIBIDO usar escalones, gradas, rocas, piedras o dos niveles de altura distintos."
  );
}

function multiClauseText(input: MuseImageInput): string {
  const n = input.productCount ?? 1;
  if (!isGrouped(input)) {
    return (
      "PIEZA INDIVIDUAL DE UN SOLO PRODUCTO (HERO SHOT DE AGENCIA): mantené su identidad, colores y envase 100% fieles. " +
      "Dale protagonismo heroico claro con iluminación de estudio (key light + rim light sutil que recorte el contorno + sombra de contacto real que lo ancle a la superficie). " +
      "Dejá una zona limpia con profundidad de campo (bokeh suave) para el titular, apoyo, pills y CTA, sin encimar ningún texto ni tarjeta sobre el producto."
    );
  }
  return (
    `FLYER CONJUNTO DE ${n} PRODUCTOS: componé los ${n} productos juntos en un único bloque visual cohesionado sobre una misma mesada o piso plano continuo, respetando estrictamente la escala física relativa real entre envases (las botellas grandes de 1,5 L deben verse más altas que los envases chicos de lavavajillas o gatillo). ` +
    "Conservá la apariencia exacta, la etiqueta propia y la geometría estricta (proporciones ancho/alto) de CADA empaque según la referencia: PROHIBIDO estirar, aplastar o mezclar textos de una etiqueta en otra. " +
    "Dejá los cuerpos y las bases de todos los envases visibles apoyados en el mismo plano, sin taparlos con recuadros de texto opacos ni rodearlos de comida cruda (limones cortados, romero) si son productos de limpieza."
  );
}
