import {
  adVariantSchema,
  productListingSchema,
  flyerTextsSchema,
  type AdVariant,
  type AudienceSegment,
  type FlyerTexts,
  type Locale,
  type PhotoDesignData,
  type ProductListing,
  type CreativeStrategy,
  type CarouselSlide,
} from "@/lib/schema/campaign";
import { archetypeForVariant, STYLE_ARCHETYPES, type StyleArchetype } from "@/lib/flyer/style-engine";
import { llmJson } from "./llm";
import { generateAudiences, type Provider } from "./provider";

export type MuseSparkInput = {
  locale: Locale;
  /** Descripción del producto desde SAM. Vacía en demo (usa fixtures). */
  productDescription: string;
  /** Paleta real + arquetipo recomendado extraídos de la foto (SAM/visión). */
  designData: PhotoDesignData | null;
};

export type MuseSparkOutput = {
  listing: ProductListing;
  adVariants: [AdVariant, AdVariant, AdVariant];
  flyerTexts: FlyerTexts;
  audiences: AudienceSegment[];
  creativeStrategy: CreativeStrategy;
  carouselSlides: CarouselSlide[];
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
    adVariants: bundle.adVariants.map((v) => adVariantSchema.parse(v)) as [
      AdVariant,
      AdVariant,
      AdVariant,
    ],
    flyerTexts: bundle.flyerTexts,
    audiences: bundle.audiences,
    creativeStrategy: {
      campaignIdea: bundle.flyerTexts.headline,
      audience: bundle.audiences[0].name,
      objective: "Presentar el producto y sus características para facilitar la decisión de compra.",
      visualWorld: "Escenas cotidianas relacionadas con el uso del producto, materiales y colores presentes en la fotografía.",
      carouselRecommended: true,
      carouselReason: "El ejemplo demuestra el uso y las características en varias láminas.",
    },
    carouselSlides: [
      { stage: "attention", headline: bundle.adVariants[0].hook, body: bundle.adVariants[0].body, cta: bundle.adVariants[0].cta },
      { stage: "interest", headline: bundle.adVariants[1].hook, body: bundle.adVariants[1].body, cta: bundle.adVariants[1].cta },
      { stage: "desire", headline: bundle.listing.standardizedTitle, body: bundle.listing.shortPitch, cta: bundle.adVariants[2].cta },
      { stage: "action", headline: bundle.adVariants[2].hook, body: bundle.adVariants[2].body, cta: bundle.adVariants[2].cta },
    ],
  };
}

const sparkResponseSchema = {
  type: "OBJECT",
  properties: {
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
    adVariants: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          platform: { type: "STRING", enum: ["instagram", "facebook"] },
          concept: { type: "STRING" },
          artDirection: { type: "STRING" },
          styleArchetype: { type: "STRING", enum: ["editorial-poster", "split-commerce", "bold-dark"] },
          hook: { type: "STRING" },
          body: { type: "STRING" },
          cta: { type: "STRING" },
          featurePills: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["platform", "concept", "artDirection", "styleArchetype", "hook", "body", "cta", "featurePills"],
      },
    },
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
    carouselSlides: {
      type: "ARRAY", items: {
        type: "OBJECT", properties: {
          headline: { type: "STRING" }, body: { type: "STRING" }, cta: { type: "STRING" },
        }, required: ["headline", "body", "cta"],
      },
    },
  },
  required: [
    "standardizedTitle",
    "shortPitch",
    "bulletFeatures",
    "categoryPath",
    "seoMetadata",
    "adVariants",
    "flyerTexts",
    "creativeStrategy",
    "carouselSlides",
  ],
} as const;

type SparkRaw = Record<string, unknown>;

async function runCopy(input: MuseSparkInput): Promise<MuseSparkOutput> {
  const design = input.designData ?? null;
  const designLines = design
    ? `- color dominante de la foto: ${design.dominantColorHex}\n` +
      `- color secundario de la foto: ${design.secondaryColorHex}\n\n`
    : "";
  const prompt =
    `Sos un director creativo senior, estratega de performance y redactor de e-commerce. Escribí TODO en ${localeNames[input.locale]}.\n` +
    `Producto: ${input.productDescription}\n\n` +
    (designLines
      ? `DATOS DE DISEÑO EXTRAÍDOS DE LA FOTO (pasada de visión):\n${designLines}`
      : "") +
    "Primero elaborá una estrategia para ESTE producto: qué se ve, qué se puede afirmar con evidencia, quién lo compraría, situación de uso, objetivo, promesa y un mundo visual coherente. Después creá tres ideas publicitarias originales que expresen distintos motivos de compra dentro de una campaña coherente. Utilizá AIDA o PAS cuando ayuden al argumento, no como plantilla visual.\n" +
    "No asignes estilos por número de variante: no repitas por defecto fondo blanco editorial, división diagonal ni fondo negro con neón. Inventá para cada pieza una escena, encuadre, posición de producto y texto, iluminación, fondo, materiales, elementos, paleta y tipografía apropiados al producto y a la audiencia. Las tres composiciones deben diferenciarse en su idea y distribución, manteniendo identidad común.\n\n" +
    "Escribí autónomamente: inferí el comprador probable y el contexto de uso, pero distingue inferencias de datos comprobados. Conservá exactamente las condiciones de la etiqueta: 'hasta 50' jamás significa '50 garantizados'. No inventes marca, precio, descuentos, certificaciones, pruebas, testimonios, garantía, envío ni métricas. No uses afirmaciones sobre atributos personales sensibles. Si un dato es ilegible, omitilo. Evitá copy vacío y promesas absolutas. Cada hook debe conectar un beneficio comprobable o un momento de uso con una motivación concreta del comprador; no conviertas los colores del envase o su reconocimiento en góndola en el principal argumento de venta. Cada CTA debe ser una acción realista como conocer, consultar o comprar, no una instrucción ajena a la compra. Evitá hacer promesas de rendimiento por semana o hogar que la etiqueta no confirme.\n\n" +
    `Devolvé JSON con:\n` +
    "- standardizedTitle (<=120 chars)\n" +
    "- shortPitch (<=180 chars)\n" +
    "- bulletFeatures: 4 viñetas concretas\n" +
    "- categoryPath (ruta tipo 'Hogar / Cocina / ...')\n" +
    "- seoMetadata: { metaTitle (<=60), metaDescription (<=155), keywords (3 a 5) }\n" +
    "- creativeStrategy: { campaignIdea, audience, objective, visualWorld (estilo, ambiente y elementos específicos relacionados con el producto), carouselRecommended (boolean: true solo cuando una secuencia ayuda a explicar o demostrar), carouselReason (por qué sí o por qué no) }.\n" +
    "- carouselSlides: escribí EXACTAMENTE 4 objetos {headline (<=120), body (<=200), cta (<=30)} como secuencia coherente del mismo concepto: atención, interés, deseo y acción. Que cada lámina avance la historia sin repetir el mismo copy. Si no hay reseñas verificadas no inventes prueba social: usá beneficios o características observables.\n" +
    "- adVariants: EXACTAMENTE 3. Cada una { platform: 'instagram'|'facebook', concept (<=60), artDirection (<=800: concepto visual específico, escena, textura, materiales, elementos, colores, luz, ubicación del producto y titular, tipografía, composición; diferentes entre piezas), styleArchetype (editorial-poster|split-commerce|bold-dark: solo para fallback local; puede repetirse, no define arte IA), hook (<=40), body (<=125), cta (<=30), featurePills (hasta 3, <=28 chars) }.\n" +
    "- flyerTexts: { headline (<=80), subheadline (<=140), bullets: 3 }\n" +
    "Cada variante debe vender con un argumento distinto, no solo cambiar palabras. Respetá estrictamente los límites de caracteres.";
  const raw = await llmJson<SparkRaw>(prompt, {
    schema: sparkResponseSchema,
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

  // El arquetipo solo selecciona un render de contingencia local; la dirección
  // creativa libre gobierna la salida de Muse Image.
  const adVariants = (strArray3(raw.adVariants)).map((v, i) => {
    const o = obj(v) ?? {};
    return adVariantSchema.parse({
      platform: o.platform === "facebook" ? "facebook" : "instagram",
      concept: clip(o.concept, 60) || fallbackConcepts[i],
      artDirection: clip(o.artDirection, 800) || fallbackDirections[i],
      styleArchetype: STYLE_ARCHETYPES.includes(o.styleArchetype as StyleArchetype) ? o.styleArchetype : archetypeForVariant(i),
      hook: clip(o.hook, 40) || `Oferta ${i + 1}`,
      body: clip(o.body, 125) || "Copy generado por IA.",
      cta: clip(o.cta, 30) || "Comprar",
      imageUrl: studioUrl(i),
      featurePills: strList(o.featurePills)
        .map((p) => clip(p, 28))
        .slice(0, 3),
    });
  });
  while (adVariants.length < 3) {
    const i = adVariants.length;
    adVariants.push(
      adVariantSchema.parse({
        platform: i === 1 ? "facebook" : "instagram",
        concept: fallbackConcepts[i],
        artDirection: fallbackDirections[i],
        styleArchetype: archetypeForVariant(i),
        hook: i === 0 ? "Hecho para destacar" : i === 1 ? "Menos vueltas. Más uso." : "Mirá la diferencia",
        body: clip(input.productDescription, 125),
        cta: "Comprar ahora",
        imageUrl: studioUrl(i),
        featurePills: [],
      }),
    );
  }

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
  const suppliedSlides = Array.isArray(raw.carouselSlides) ? raw.carouselSlides : [];
  const carouselSlides = stages.map((stage, index) => {
    const slide = obj(suppliedSlides[index]) ?? {};
    const variant = adVariants[index % adVariants.length];
    return {
      stage,
      headline: clip(slide.headline, 120) || variant.hook,
      body: clip(slide.body, 200) || variant.body,
      cta: clip(slide.cta, 30) || variant.cta,
    };
  });

  return {
    listing,
    adVariants: adVariants.slice(0, 3) as [AdVariant, AdVariant, AdVariant],
    flyerTexts,
    audiences,
    creativeStrategy,
    carouselSlides,
  };
}

const fallbackConcepts = [
  "Deseo editorial",
  "Problema resuelto",
  "Diferencia visible",
] as const;

const fallbackDirections = [
  "Escena de uso cotidiana ligada a la categoría del producto, luz natural y materiales apropiados al objeto.",
  "Primer plano del producto y detalles de su uso real en una composición dinámica que explique el beneficio visible.",
  "Una interpretación visual del momento de uso y del resultado deseado, con contraste y elementos propios del producto.",
] as const;

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

function strArray3(value: unknown): unknown[] {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, 3);
}
