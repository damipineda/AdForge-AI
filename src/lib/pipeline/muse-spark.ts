import {
  feedVariantSchema,
  productListingSchema,
  flyerTextsSchema,
  storyCopySchema,
  type BackgroundRecommendation,
  type FeedVariant,
  type AudienceSegment,
  type FlyerTexts,
  type Locale,
  type PhotoDesignData,
  type Placement,
  type ProductListing,
  type CreativeStrategy,
  type CarouselSlide,
  type StoryCopy,
} from "@/lib/schema/campaign";
import { archetypeForVariant, STYLE_ARCHETYPES, type StyleArchetype } from "@/lib/flyer/style-engine";
import { autoFix, findViolations } from "./copy-validate";
import { llmJson } from "./llm";
import { MATERIAL_LIBRARY, learnedRulesBlock } from "./material-library";
import { generateAudiences, type Provider } from "./provider";

export type MuseSparkInput = {
  locale: Locale;
  /** Descripción del producto desde SAM. Vacía en demo (usa fixtures). */
  productDescription: string;
  /** Paleta real + arquetipo recomendado extraídos de la foto (SAM/visión). */
  designData: PhotoDesignData | null;
  /** Placements pedidos: el copy de story y carrusel solo se escribe si se piden. */
  placements: Placement[];
  /** Link de compra del merchant (null = CTAs consultivos, sin "Comprá"). */
  merchantLink: string | null;
  /** Multi-producto: cuántas fotos y si van agrupadas en un flyer conjunto. */
  productCount?: number;
  groupMode?: boolean;
  /** Decisión de fondo de la visión (sólido / degradado / escena). */
  background?: BackgroundRecommendation | null;
  /** Reglas del skill aprendido que aplican a esta categoría (puede variar). */
  learnedRules?: string[];
};

export type MuseSparkOutput = {
  listing: ProductListing;
  feedVariants: [FeedVariant, FeedVariant];
  story: StoryCopy | null;
  flyerTexts: FlyerTexts;
  audiences: AudienceSegment[];
  creativeStrategy: CreativeStrategy;
  carouselSlides: CarouselSlide[];
  /** Micro-línea legal cuando el producto/escena la exigen; `null` si no aplica. */
  legalDisclaimer: string | null;
  /** Afirmaciones permitidas extraídas del empaque; el copy usa solo estas. */
  allowedClaims: string[];
};

const localeNames: Record<Locale, string> = {
  es: "español rioplatense (Paraguay)",
  pt: "portugués brasilero",
  en: "inglés neutral",
};

/**
 * Paso de copy. Lo escribe `muse-spark-1.3` vía `llmJson`; el prompt y la
 * normalización son los mismos que en demo, solo cambian los fixtures.
 */
export async function runMuseSpark(
  input: MuseSparkInput,
  provider: Provider,
): Promise<MuseSparkOutput> {
  return provider === "demo" ? runDemo(input) : runCopy(input);
}

async function runDemo(input: MuseSparkInput): Promise<MuseSparkOutput> {
  const { demoBundles } = await import("./demo-fixtures");
  const bundle = demoBundles[input.locale];
  const [v1, v2] = bundle.feedVariants;
  const wantStory = input.placements.includes("story");
  const wantCarousel = input.placements.includes("carousel");
  return {
    listing: {
      sku: bundle.listing.sku,
      standardizedTitle: bundle.listing.standardizedTitle,
      shortPitch: bundle.listing.shortPitch,
      bulletFeatures: bundle.listing.bulletFeatures,
      categoryPath: bundle.listing.categoryPath,
      seoMetadata: bundle.listing.seoMetadata,
      missingInformation: bundle.listing.missingInformation,
    },
    feedVariants: bundle.feedVariants.map((v) => feedVariantSchema.parse(v)) as [
      FeedVariant,
      FeedVariant,
    ],
    story: wantStory ? storyCopySchema.parse(bundle.story) : null,
    flyerTexts: bundle.flyerTexts,
    legalDisclaimer: null,
    allowedClaims: demoClaims[input.locale],
    audiences: bundle.audiences,
    creativeStrategy: {
      campaignIdea: bundle.flyerTexts.headline,
      audience: bundle.audiences[0].name,
      objective: "Presentar el producto y sus características para facilitar la decisión de compra.",
      visualWorld: "Escenas cotidianas relacionadas con el uso del producto, materiales y colores presentes en la fotografía.",
      carouselRecommended: true,
      carouselReason: "El ejemplo demuestra el uso y las características en varias láminas.",
    },
    carouselSlides: wantCarousel
      ? [
          { stage: "attention", headline: v1.hook, body: v1.body, cta: v1.cta },
          { stage: "interest", headline: v2.hook, body: v2.body, cta: v2.cta },
          { stage: "desire", headline: bundle.listing.standardizedTitle, body: bundle.listing.shortPitch, cta: bundle.story.cta },
          { stage: "action", headline: bundle.story.hook, body: v1.body, cta: bundle.story.cta },
        ]
      : [],
  };
}

/** El schema estricto solo exige story/carrusel cuando el placement se pidió:
 * `strict: true` rechaza propiedades opcionales, así que se construye. */
function sparkResponseSchema(wantStory: boolean, wantCarousel: boolean): Record<string, unknown> {
  const feedVariant = {
    type: "OBJECT",
    properties: {
      concept: { type: "STRING" },
      artDirection: { type: "STRING" },
      styleArchetype: { type: "STRING", enum: ["editorial-poster", "split-commerce", "bold-dark"] },
      hook: { type: "STRING" },
      body: { type: "STRING" },
      cta: { type: "STRING" },
      featurePills: { type: "ARRAY", items: { type: "STRING" } },
      captionInstagram: { type: "STRING" },
      captionFacebook: { type: "STRING" },
    },
    required: ["concept", "artDirection", "styleArchetype", "hook", "body", "cta", "featurePills", "captionInstagram", "captionFacebook"],
  };
  const properties: Record<string, unknown> = {
    standardizedTitle: { type: "STRING" },
    shortPitch: { type: "STRING" },
    bulletFeatures: { type: "ARRAY", items: { type: "STRING" } },
    categoryPath: { type: "STRING" },
    seoMetadata: {
      type: "OBJECT",
      properties: {
        metaTitle: { type: "STRING" },
        metaDescription: { type: "STRING" },
        keywords: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["metaTitle", "metaDescription", "keywords"],
    },
    feedVariants: { type: "ARRAY", items: feedVariant },
    flyerTexts: {
      type: "OBJECT",
      properties: {
        headline: { type: "STRING" },
        subheadline: { type: "STRING" },
        bullets: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["headline", "subheadline", "bullets"],
    },
    creativeStrategy: {
      type: "OBJECT",
      properties: {
        campaignIdea: { type: "STRING" }, audience: { type: "STRING" }, objective: { type: "STRING" },
        visualWorld: { type: "STRING" }, carouselRecommended: { type: "BOOLEAN" }, carouselReason: { type: "STRING" },
      },
      required: ["campaignIdea", "audience", "objective", "visualWorld", "carouselRecommended", "carouselReason"],
    },
    // "" cuando no aplica (ej. producto no alimenticio); el servidor lo pasa a null.
    legalDisclaimer: { type: "STRING" },
    allowedClaims: { type: "ARRAY", items: { type: "STRING" } },
  };
  const required = [
    "standardizedTitle",
    "shortPitch",
    "bulletFeatures",
    "categoryPath",
    "seoMetadata",
    "feedVariants",
    "flyerTexts",
    "creativeStrategy",
    "legalDisclaimer",
    "allowedClaims",
  ];
  if (wantStory) {
    properties.story = {
      type: "OBJECT",
      properties: {
        concept: { type: "STRING" },
        artDirection: { type: "STRING" },
        hook: { type: "STRING" },
        cta: { type: "STRING" },
      },
      required: ["concept", "artDirection", "hook", "cta"],
    };
    required.push("story");
  }
  if (wantCarousel) {
    properties.carouselSlides = {
      type: "ARRAY", items: {
        type: "OBJECT", properties: {
          headline: { type: "STRING" }, body: { type: "STRING" }, cta: { type: "STRING" },
        }, required: ["headline", "body", "cta"],
      },
    };
    required.push("carouselSlides");
  }
  return { type: "OBJECT", properties, required };
}

type SparkRaw = Record<string, unknown>;

async function runCopy(input: MuseSparkInput): Promise<MuseSparkOutput> {
  const design = input.designData ?? null;
  const wantStory = input.placements.includes("story");
  const wantCarousel = input.placements.includes("carousel");
  const productCount = input.productCount ?? 1;
  const grouped = (input.groupMode ?? productCount > 1) && productCount > 1;
  const bg = input.background ?? null;
  const bgLine = bg
    ? `- fondo recomendado por visión: ${bg.mode}${bg.mode === "solid" && bg.colorHex ? ` (${bg.colorHex})` : ""} — ${bg.reason}\n`
    : "";
  const designLines = design
    ? `- color dominante de la foto: ${design.dominantColorHex}\n` +
      `- color secundario de la foto: ${design.secondaryColorHex}\n${bgLine}\n`
    : bg ? `${bgLine}\n` : "";
  const multiLine = grouped
    ? `SON ${productCount} PRODUCTOS EN UN FLYER CONJUNTO: mostralos reconocibles, con jerarquía y proporciones coherentes. No mezcles atributos ni inventes datos. Si hay apoyo físico, que la luz y las sombras sean coherentes; elegí contexto y disposición según el concepto.\n`
    : "";
  const learnedBlock = learnedRulesBlock(input.learnedRules ?? []);
  const prompt =
    `Sos un director creativo senior, estratega de performance y redactor de e-commerce. Escribí TODO en ${localeNames[input.locale]}.\n` +
    `Producto: ${input.productDescription}\n\n` +
    (designLines
      ? `DATOS DE DISEÑO EXTRAÍDOS DE LA FOTO (pasada de visión):\n${designLines}`
      : "") +
    "Primero elaborá una estrategia para ESTE producto: qué se ve, qué se puede afirmar con evidencia, quién lo compraría, situación de uso, objetivo, promesa y un mundo visual coherente. Después creá dos ideas publicitarias originales para feed (cada una vende con un argumento distinto, no solo cambia palabras) que expresen distintos motivos de compra dentro de una campaña coherente. Utilizá AIDA o PAS cuando ayuden al argumento, no como plantilla visual.\n" +
    (multiLine ? `${multiLine}\n` : "") +
    "FONDO CON CRITERIO: tomá la observación de visión como orientación, no como una escena obligatoria. Elegí para cada idea el entorno, color o tratamiento gráfico que tenga sentido para el producto y su audiencia; no impongas cocina, mesa, podio, texturas ni estudio de tres planos.\n" +
    `${MATERIAL_LIBRARY}\n` +
    "Para cada dirección definí un concepto propio, composición, encuadre, escala, espacio, tipografía y contexto relacionados con el producto. Superficies y materiales son opcionales: usalos solamente si aportan.\n" +
    "No asignes estilos por número de variante: no repitas por defecto fondo blanco editorial, división diagonal ni fondo negro con neón. Inventá para cada pieza una escena, encuadre, posición de producto y texto, iluminación, fondo, materiales, elementos, paleta y tipografía apropiados al producto y a la audiencia. Las composiciones deben diferenciarse en su idea y distribución, manteniendo identidad común.\n\n" +
    "PALETA CON INTENCIÓN: justificá fondo y colores de acento según cada concepto, producto y audiencia. Explorá colores y entornos pertinentes en vez de asignar claro a una variante y oscuro a otra o cubrir la campaña de beige/gris por defecto; el neutro puede servir si tiene una razón. No agregues color o decoraciones sin relación con la idea.\n\n" +
    "Escribí autónomamente: inferí el comprador probable y el contexto de uso, pero distingue inferencias de datos comprobados. Conservá exactamente las condiciones de la etiqueta: 'hasta 50' jamás significa '50 garantizados'. No inventes marca, precio, descuentos, certificaciones, pruebas, testimonios, garantía, envío ni métricas. No uses afirmaciones sobre atributos personales sensibles. Si un dato es ilegible, omitilo. Evitá copy vacío y promesas absolutas. Cada hook debe conectar un beneficio comprobable o un momento de uso con una motivación concreta del comprador; no conviertas los colores del envase o su reconocimiento en góndola en el principal argumento de venta. Cada CTA debe ser una acción realista como conocer, consultar o comprar, no una instrucción ajena a la compra. Evitá hacer promesas de rendimiento por semana o hogar que la etiqueta no confirme.\n\n" +
    "LOCALIZACIÓN PARAGUAY: español comercial natural (voseo sí). PROHIBIDO modismos porteños y lunfardo: nada de 'finde' (decí 'fin de semana'), 're ' como intensificador ('re va' → 'ideal para'), 'cuando pinten' (decí 'cuando quieras'), 'copado', 'zarpado', 'laburo', 'morfar', 'bajón'. Preferí giros como 'cuando quieras', 'este fin de semana', 'para resolver la cena', 'para compartir en casa'.\n\n" +
    "COHERENCIA ESCENA-COPY: la dirección de arte de cada pieza debe poder mostrar lo que su copy afirma. PROHIBIDO contradicciones físicas: si la escena muestra un freezer o frío, no pongas comida cocida humeando adentro; si el titular dice 'Abrí el freezer', la escena incluye un freezer visible (no una parrilla con fuego de fondo sin freezer); si el producto es congelado, la escena es de frío o de preparación, nunca ambas mezcladas en el mismo plano.\n\n" +
    "PERSPECTIVAS DIFERENTES: explorá diferentes motivaciones o momentos relevantes al producto sin asignar escenarios fijos a los formatos. Mantené coherencia de marca y variedad real en la composición.\n\n" +
    "SIN REDUNDANCIA LITERAL: no repitas la misma frase exacta en subtítulo, pills y captions. Cada superficie (subheadline, featurePills, captionInstagram, captionFacebook) reformula el beneficio con otras palabras; si una frase ya apareció, la siguiente la parafrasea.\n\n" +
    "COPY CON INTENCIÓN: el titular y el apoyo de la imagen cuentan una idea persuasiva conectada con el producto y una necesidad o momento relevante; no llenes el arte con un inventario de beneficios. La descripción de cada post acompaña y amplía SU idea, plantea una situación o motivación y propone una acción; no se limita a describir la imagen, citar el texto del arte ni enumerar especificaciones. Nada de promesas ni resultados no verificados.\n\n" +
    "TITULAR Y APOYO CON OFICIO (obligatorio): el hook (<=40) es promesa, tensión o momento de uso en segunda persona — PROHIBIDO abrir con la fórmula de catálogo '[Sustantivo] [marca] en [color/atributo]' (ej. 'Automóvil compacto Kia en gris…'). El body (<=125) trae UNA prueba observable de la foto + UN momento de uso concreto, hablándole al comprador (voseo); jamás repite el hook con otras palabras ni enumera especificaciones. Cada pieza vende un argumento DISTINTO con palabras DISTINTAS: si V1 habla de ciudad, V2 habla de otra motivación (primer auto, día a día, presencia) sin reciclar frases.\n\n" +
    "CTA ÚNICO DE CAMPAÑA: elegí UNA sola acción consultiva y repetila IDÉNTICA, palabra por palabra, en feed V1, feed V2, story y cierre de carrusel (ej. siempre 'Consultá por este modelo', nunca tres variantes distintas).\n\n" +
    "ANTI-INVENCIÓN (vehículos y todo producto): nunca inventes modelo, versión, año, kilometraje, consumo, precio, cuotas, premios ni equipamiento que no se vea o lea en la foto. Nombrá solo marca visible + tipo observable ('este Kia', 'este compacto').\n\n" +
    "PRIVACIDAD: nunca transcribas, expliques ni promociones una matrícula, patente, chapa, número de serie, documento o dirección visible. No uses la patente ni su existencia como beneficio, titular, concepto, CTA, copy o atributo del producto.\n\n" +
    "AFIRMACIONES PERMITIDAS (paso 1, obligatorio): primero listá en `allowedClaims` hasta 8 hechos extraídos del empaque (sustantivo del producto, cantidades, peso, origen, atributos como 'sin gluten'). Paso 2: escribí el copy con voz paraguaya casual y libre en el tono, pero OBLIGADO a usar solo esas afirmaciones: nada de 'a la plancha', 'lista para cocinar' ni métodos que el empaque no declare.\n\n" +
    "CANDADO DE TERMINOLOGÍA: usá SIEMPRE el sustantivo del empaque para el producto en superficies fácticas (apoyo, pills, captions). Si el empaque dice 'hamburguesa', prohibido 'medallones' ahí; 'burgers' solo vale en titulares casuales. Unificá unidades ('4 unidades' en todos lados, nunca 'piezas' en un lado y 'unidades' en otro).\n\n" +
    "CANDADO DE REGISTRO: voseo en TODAS las conjugaciones, no solo en los imperativos obvios. 'Trae cuatro unidades' está mal (es tú/tercera persona): es 'Traé'. Revisá cada verbo: 'prepara'→'prepará', 'arma'→'armá', 'compra'→'comprá', 'mira'→'mirá', 'suma'→'sumá'. Un solo verbo en tú arruina la pieza.\n\n" +
    (input.merchantLink
      ? "El merchant indicó link de compra: podés usar CTA de compra directa ('Comprá', 'Pedí').\n\n"
      : "SIN link de compra: no prometas compra directa, canal de contacto, cita, disponibilidad ni promoción no confirmada. Proponé una acción consultiva concreta relacionada con el producto y la pieza; evitá repetir CTA genéricos.\n\n") +
    "TONO: claro, natural y adecuado al idioma y mercado seleccionado. El argumento y el CTA deben pertenecer al producto real; no uses ejemplos de otra categoría como plantilla.\n\n" +
    `Devolvé JSON con:\n` +
    "- standardizedTitle (<=120 chars)\n" +
    "- shortPitch (<=180 chars)\n" +
    "- bulletFeatures: 4 viñetas concretas\n" +
    "- categoryPath (ruta tipo 'Hogar / Cocina / ...')\n" +
    "- seoMetadata: { metaTitle (<=60), metaDescription (<=155), keywords (3 a 5) }\n" +
    "- creativeStrategy: { campaignIdea, audience, objective, visualWorld (estilo, ambiente y elementos específicos relacionados con el producto), carouselRecommended (boolean: true solo cuando una secuencia ayuda a explicar o demostrar), carouselReason (por qué sí o por qué no) }.\n" +
    "- feedVariants: EXACTAMENTE 2 para feed 4:5 (el MISMO asset sirve Instagram y Facebook). Cada una { concept (<=60), artDirection (<=800: idea visual específica vinculada al producto, escena o tratamiento gráfico, encuadre, posición y escala de producto y texto, luz, tipografía y aire; diferente a la otra pieza), styleArchetype (editorial-poster|split-commerce|bold-dark: solo para fallback local; puede repetirse, no define arte IA), hook (<=40), body (<=125), cta (<=30, IDÉNTICO en ambas variantes: CTA único de campaña), featurePills (hasta 3, <=28 chars), captionInstagram (<=280: fórmula SITUACIÓN + CTA — 1 o 2 frases que plantean el momento de uso, CTA único, 2 a 4 hashtags en minúsculas; PROHIBIDO describir la imagen o copiar el texto del arte), captionFacebook (<=280: tono conversacional, una pregunta o invitación + CTA único, sin hashtags; PROHIBIDO copiar el texto del arte) }.\n" +
    (wantStory
      ? "- story: copy CORTO para una story vertical 9:16 { concept (<=60), artDirection (<=800: composición y contexto específicos al producto y al concepto, aire libre en extremos para controles de la app), hook (<=40), cta (<=30) }. Sin apoyo largo: en vertical solo entra titular + CTA.\n"
      : "") +
    (wantCarousel
      ? "- carouselSlides: escribí EXACTAMENTE 4 objetos {headline (<=120), body (<=200), cta (<=30)} como secuencia coherente del mismo concepto: atención, interés, deseo y acción. Cada lámina desarrolla una idea persuasiva ligada al producto y su contexto, sin convertirse en una lista de especificaciones ni repetir el mismo copy. Si no hay reseñas verificadas no inventes prueba social: usá solo hechos observables.\n"
      : "") +
    "- flyerTexts: { headline (<=80), subheadline (<=140), bullets: 3 }\n" +
    "- allowedClaims: hasta 8 hechos (<=120 chars c/u): del empaque (sustantivo, cantidades, peso, origen, atributos) o, en productos sin empaque como vehículos, SOLO hechos observables de la foto (marca visible, tipo, color) — nunca modelo, año ni specs. Todo el copy debe salir de acá.\n" +
    "- legalDisclaimer: micro-línea legal (<=80) SOLO si el producto es un alimento congelado, crudo o que requiere preparación Y alguna escena muestra el plato preparado (ej. medallones en caja + hamburguesa armada con pan y lechuga): devolvé 'Imagen ilustrativa · Sugerencia de preparación' (o el equivalente en el idioma pedido). En cualquier otro caso devolvé \"\" (vacío).\n" +
    (learnedBlock === "" ? "" : `${learnedBlock}\n`) +
    "Respetá estrictamente los límites de caracteres.";
  const raw = await llmJson<SparkRaw>(prompt, {
    schema: sparkResponseSchema(wantStory, wantCarousel),
  });

  // Sin URLs externas: el flyer se compone en el cliente (Canvas) sobre la foto
  // real. `imageUrl` queda como centinela para mantener el contrato del schema.
  const studioUrl = (i: number) => `canvas://studio-${i + 1}`;
  const sku = `AFG-${slug(input.productDescription)}`;

  const bullets = strList(raw.bulletFeatures)
    .slice(0, 6)
    .map((b) => clip(b, 200));
  if (bullets.length === 0) bullets.push(clip(input.productDescription, 200) || "Producto destacado");

  const seo = obj(raw.seoMetadata) ?? {};
  const keywords = strList(seo.keywords).slice(0, 5).map((k) => clip(k, 60));
  if (keywords.length === 0) keywords.push("producto", "calidad");

  const listing = productListingSchema.parse({
    sku,
    standardizedTitle: clip(raw.standardizedTitle, 120) || "Producto sin título",
    shortPitch: clip(raw.shortPitch, 180) || "Descripción corta pendiente.",
    bulletFeatures: bullets,
    categoryPath: clip(raw.categoryPath, 160) || "Sin categoría",
    seoMetadata: {
      metaTitle: clip(seo.metaTitle, 60) || "Producto",
      metaDescription: clip(seo.metaDescription, 155) || "Descripción SEO.",
      keywords,
    },
    missingInformation: [
      "Confirmar precio final y stock antes de publicar (generado con IA).",
    ],
  });

  // El disclaimer legal viaja en el copy (captions + UI), NO horneado en la
  // imagen: el texto diminuto generado por IA sale garbled y es peor que nada.
  const legalRaw = clip(raw.legalDisclaimer, 80);
  const legalDisclaimer = legalRaw ? legalRaw : null;
  const withLegal = (caption: string): string =>
    legalDisclaimer && !caption.includes(legalDisclaimer)
      ? clip(`${caption} · ${legalDisclaimer}`, 280)
      : caption;

  // El arquetipo solo selecciona un render de contingencia local; la dirección
  // creativa libre gobierna la salida de Muse Image.
  const feedVariants = (strArray2(raw.feedVariants)).map((v, i) => {
    const o = obj(v) ?? {};
    const hook = clip(o.hook, 40) || `Oferta ${i + 1}`;
    const body = clip(o.body, 125) || "Copy generado por IA.";
    return feedVariantSchema.parse({
      concept: clip(o.concept, 60) || fallbackConcepts[i],
      artDirection: clip(o.artDirection, 800) || fallbackDirections[i],
      styleArchetype: STYLE_ARCHETYPES.includes(o.styleArchetype as StyleArchetype) ? o.styleArchetype : archetypeForVariant(i),
      hook,
      body,
      cta: clip(o.cta, 30) || "Comprar",
      imageUrl: studioUrl(i),
      featurePills: strList(o.featurePills)
        .map((p) => clip(p, 28))
        .slice(0, 3),
      captionInstagram: withLegal(clip(o.captionInstagram, 280) || clip(`${hook} ${body}`, 280)),
      captionFacebook: withLegal(clip(o.captionFacebook, 280) || clip(`${hook} ${body}`, 280)),
    });
  });
  while (feedVariants.length < 2) {
    const i = feedVariants.length;
    feedVariants.push(
      feedVariantSchema.parse({
        concept: fallbackConcepts[i],
        artDirection: fallbackDirections[i],
        styleArchetype: archetypeForVariant(i),
        hook: i === 0 ? "Hecho para destacar" : "Menos vueltas. Más uso.",
        body: clip(input.productDescription, 125),
        cta: "Comprar ahora",
        imageUrl: studioUrl(i),
        featurePills: [],
        captionInstagram: withLegal(clip(input.productDescription, 280)),
        captionFacebook: withLegal(clip(input.productDescription, 280)),
      }),
    );
  }

  const storyRaw = obj(raw.story);
  const story = wantStory && storyRaw
    ? storyCopySchema.parse({
        concept: clip(storyRaw.concept, 60) || "Momento de uso",
        artDirection: clip(storyRaw.artDirection, 800) || fallbackStoryDirection,
        hook: clip(storyRaw.hook, 40) || feedVariants[0].hook,
        cta: clip(storyRaw.cta, 30) || feedVariants[0].cta,
      })
    : null;

  const flyerRaw = obj(raw.flyerTexts) ?? {};
  const flyerBullets = strList(flyerRaw.bullets).slice(0, 3);
  const filler = [
    clip(listing.bulletFeatures[0], 200),
    clip(listing.bulletFeatures[1] ?? listing.shortPitch, 200),
    clip(listing.shortPitch, 200),
  ];
  while (flyerBullets.length < 3) {
    flyerBullets.push(filler[flyerBullets.length] ?? listing.shortPitch);
  }
  const flyerTexts = flyerTextsSchema.parse({
    headline: clip(flyerRaw.headline, 80) || listing.standardizedTitle,
    subheadline: clip(flyerRaw.subheadline, 140) || listing.shortPitch,
    bullets: flyerBullets.map((b) => clip(b, 200)),
  });

  const audiences = await generateAudiences(input.productDescription, input.locale);

  const strategy = obj(raw.creativeStrategy) ?? {};
  const creativeStrategy: CreativeStrategy = {
    campaignIdea: clip(strategy.campaignIdea, 160) || listing.standardizedTitle,
    audience: clip(strategy.audience, 160) || audiences[0]?.name || "Compradores interesados en el producto",
    objective: clip(strategy.objective, 120) || "Presentar el producto y facilitar su elección",
    visualWorld: clip(strategy.visualWorld, 600) || input.productDescription || listing.standardizedTitle,
    carouselRecommended: strategy.carouselRecommended === true,
    carouselReason: clip(strategy.carouselReason, 300) || "La campaña prioriza piezas individuales para presentar el producto.",
  };

  const stages = ["attention", "interest", "desire", "action"] as const;
  const suppliedSlides = wantCarousel && Array.isArray(raw.carouselSlides) ? raw.carouselSlides : [];
  const carouselSlides = wantCarousel
    ? stages.map((stage, index) => {
        const slide = obj(suppliedSlides[index]) ?? {};
        const variant = feedVariants[index % feedVariants.length];
        return {
          stage,
          headline: clip(slide.headline, 120) || variant.hook,
          body: clip(slide.body, 200) || variant.body,
          cta: clip(slide.cta, 30) || variant.cta,
        };
      })
    : [];

  const allowedClaims = [...new Set(strList(raw.allowedClaims).map((c) => clip(c, 120)).filter(Boolean))].slice(0, 8);

  // Paso 3: validación determinística del copy. El autoFix corrige léxico y
  // registro sin red; lo que queda (duplicación literal) va a un intento de
  // reparación con modelo; si persiste, se advierte en log (el humano revisa,
  // `reviewRequired` es true).
  const surfaces: Array<{ id: string; get: () => string; set: (v: string) => void; max: number }> = [
    { id: "subheadline", get: () => flyerTexts.subheadline, set: (v) => { flyerTexts.subheadline = v; }, max: 140 },
    ...feedVariants.flatMap((v, i) => [
      { id: `V${i + 1} hook`, get: () => v.hook, set: (x: string) => { v.hook = x; }, max: 40 },
      { id: `V${i + 1} body`, get: () => v.body, set: (x: string) => { v.body = x; }, max: 125 },
      { id: `V${i + 1} cta`, get: () => v.cta, set: (x: string) => { v.cta = x; }, max: 30 },
      ...v.featurePills.map((p, j) => ({ id: `V${i + 1} pill${j + 1}`, get: () => v.featurePills[j], set: (x: string) => { v.featurePills[j] = x; }, max: 28 })),
      { id: `V${i + 1} captionIG`, get: () => v.captionInstagram, set: (x: string) => { v.captionInstagram = x; }, max: 280 },
      { id: `V${i + 1} captionFB`, get: () => v.captionFacebook, set: (x: string) => { v.captionFacebook = x; }, max: 280 },
    ]),
    ...(story
      ? [
          { id: "story hook", get: () => story.hook, set: (x: string) => { story.hook = x; }, max: 40 },
          { id: `story cta`, get: () => story.cta, set: (x: string) => { story.cta = x; }, max: 30 },
        ]
      : []),
  ];
  const snap = () => surfaces.map((s) => ({ id: s.id, text: s.get() }));
  const apply = (fixed: Array<{ id: string; text: string }>) => {
    for (const f of fixed) {
      const target = surfaces.find((s) => s.id === f.id);
      if (target) target.set(clip(f.text, target.max));
    }
  };
  apply(autoFix(snap(), input.locale).surfaces);
  let remaining = findViolations(snap(), input.locale);
  if (remaining.length > 0) {
    try {
      const repair = await llmJson<{ rewrites: Array<{ id: string; text: string }> }>(
        `Reescribí estas superficies de copy publicitario en ${localeNames[input.locale]} para eliminar: ${remaining.map((r) => `${r.kind} "${r.match}" (${r.surface})`).join("; ")}. ` +
          `Motivos: "catalog" = apertura de catálogo ("Esta/Este + sustantivo…"): reabrí con momento de uso o segunda persona y una prueba observable; "color-concept" = el color como idea central: cambiá el ángulo a uso o beneficio concreto. ` +
          `Mantené el significado, el tono paraguayo casual y los límites de largo. Superficies: ${JSON.stringify(snap())}. ` +
          `Devolvé JSON {rewrites: [{id, text}]} solo con las que cambies.`,
        {
          schema: {
            type: "OBJECT",
            properties: { rewrites: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, text: { type: "STRING" } }, required: ["id", "text"] } } },
            required: ["rewrites"],
          },
          timeoutMs: 60_000,
        },
      );
      if (Array.isArray(repair.rewrites)) apply(repair.rewrites.filter((r) => typeof r?.id === "string" && typeof r?.text === "string"));
      remaining = findViolations(snap(), input.locale);
    } catch {
      /* sin reparación: se entrega lo validado determinísticamente */
    }
  }
  if (remaining.length > 0) {
    console.warn("[muse-spark] Copy con observaciones sin reparar:", remaining.map((r) => `${r.kind} "${r.match}" (${r.surface})`).join("; ").slice(0, 300));
  }

  // CTA ÚNICO DE CAMPAÑA (determinístico): el de V1 manda; V2, story y cierre
  // de carrusel lo repiten idéntico para no mostrar tres acciones distintas.
  const campaignCta = feedVariants[0].cta;
  feedVariants[1].cta = campaignCta;
  if (story) story.cta = campaignCta;
  if (carouselSlides.length === 4) carouselSlides[3] = { ...carouselSlides[3], cta: campaignCta };

  return {
    listing,
    feedVariants: feedVariants.slice(0, 2) as [FeedVariant, FeedVariant],
    story,
    flyerTexts,
    audiences,
    creativeStrategy,
    carouselSlides,
    legalDisclaimer,
    allowedClaims,
  };
}

const demoClaims: Record<Locale, string[]> = {
  es: ["Termo de acero 750 ml", "12 h caliente / 24 h frío", "Pared doble inox 304", "Tapa antiderrame", "Industria paraguaya"],
  pt: ["Garrafa térmica 750 ml", "12 h quente / 24 h gelada", "Parede dupla inox 304", "Tampa antivazamento"],
  en: ["750 ml steel bottle", "12 h hot / 24 h cold", "Double-wall 304 steel", "Leak-proof cap"],
};

const fallbackConcepts = [
  "Deseo editorial",
  "Problema resuelto",
] as const;

const fallbackDirections = [
  "Escena de uso cotidiana ligada a la categoría del producto, luz natural y materiales apropiados al objeto.",
  "Primer plano del producto y detalles de su uso real en una composición dinámica que explique el beneficio visible.",
] as const;

const fallbackStoryDirection =
  "Composición vertical 9:16: titular arriba, producto en el tercio medio, botón CTA abajo y aire libre en ambos extremos.";

function slug(s: string): string {
  const ascii = s
    .toLowerCase()
    .normalize("NFKD")
    .split("")
    .filter((c) => c.charCodeAt(0) < 128)
    .join("");
  return ascii.replace(/[^a-z0-9]+/g, "").slice(0, 8).toUpperCase() || "SKU";
}

function obj(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function clip(value: unknown, max: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > max * 0.55 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
}

function strArray2(value: unknown): unknown[] {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, 2);
}
