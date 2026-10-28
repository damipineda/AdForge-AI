import type { Locale, StyleArchetype } from "@/lib/schema/campaign";

/**
 * Demo fixtures are the "canned" campaign every upload resolves to while
 * DEMO_MODE=true. Three locales, one product each, deterministic so the video
 * demo and the smoke test agree byte-for-byte.
 */

type DemoBundle = {
  skuId: string;
  listing: {
    sku: string;
    standardizedTitle: string;
    shortPitch: string;
    bulletFeatures: string[];
    categoryPath: string;
    seoMetadata: {
      metaTitle: string;
      metaDescription: string;
      keywords: string[];
    };
    missingInformation: string[];
  };
  adVariants: Array<{
    platform: "instagram" | "facebook";
    concept: string;
    artDirection: string;
    styleArchetype: StyleArchetype;
    hook: string;
    body: string;
    cta: string;
    imageUrl: string;
    featurePills?: string[];
  }>;
  audiences: Array<{
    name: string;
    interests: string[];
    ageMin: number;
    ageMax: number;
    geo: string[];
  }>;
  flyerTexts: {
    headline: string;
    subheadline: string;
    bullets: [string, string, string];
  };
};

export const demoBundles: Record<Locale, DemoBundle> = {
  es: {
    skuId: "AFG-DEMO-TERMO750",
    listing: {
      sku: "TERMO-ACERO-750",
      standardizedTitle: "Termo de acero 750 ml · Edición Andes",
      shortPitch:
        "Mantiene 12 h caliente / 24 h frío. Pared doble, tapa antiderrame y base antideslizante.",
      bulletFeatures: [
        "Pared doble de acero inoxidable 304",
        "Tapa con sellado antiderrame",
        "Base de silicona antideslizante",
        "Libre de BPA y apto para lavavajillas",
      ],
      categoryPath: "Hogar / Cocina / Termos",
      seoMetadata: {
        metaTitle: "Termo de Acero 750ml | Edición Andes",
        metaDescription:
          "Termo de pared doble que mantiene 12h caliente y 24h frío. Envío a Paraguay y LATAM.",
        keywords: ["termo acero", "termo 750ml", "mate", "regalo", "outdoor"],
      },
      missingInformation: [
        "Confirmar precio final en GS y color stock antes de publicar.",
      ],
    },
    adVariants: [
      {
        platform: "instagram",
        concept: "Ritual premium",
        artDirection: "Superficie marfil limpia estilo portada de revista, producto peque�o integrado abajo a la derecha, luz lateral suave y aire de tipograf�a arriba.",
        styleArchetype: "editorial-poster",
        hook: "12 h caliente. Cero fugas.",
        body: "El termo que aguanta tu ruta completa, del amanecer en Areguá al último mate de la noche.",
        cta: "Comprar ahora",
        imageUrl: "/demo/studio-1.svg",
        featurePills: ["12 h caliente", "24 h frío", "Cero fugas"],
      },
      {
        platform: "facebook",
        concept: "La mochila sin derrames",
        artDirection: "Split 50/50: foto protagonista a la derecha sobre superficie clara, panel de degradado a la izquierda con espacio para beneficios.",
        styleArchetype: "split-commerce",
        hook: "Mate sin sorpresas",
        body: "Pared doble, tapa con seguro y base que no se resbala. Garantía de 12 meses.",
        cta: "Ver detalles",
        imageUrl: "/demo/studio-2.svg",
        featurePills: ["Pared doble", "Tapa con seguro", "Base antideslizante"],
      },
      {
        platform: "instagram",
        concept: "De escritorio a aventura",
        artDirection: "Fondo azul noche, producto centrado con halo de luz del acento, sello flotante de oferta y franja superior limpia.",
        styleArchetype: "bold-dark",
        hook: "Tu escritorio, versión aventura",
        body: "750 ml de acero que sobrevive al mate, al gym y a la mochila. Colores limitados.",
        cta: "Elegir color",
        imageUrl: "/demo/studio-3.svg",
        featurePills: ["750 ml acero", "Apto lavavajillas", "Libre de BPA"],
      },
    ],
    audiences: [
      {
        name: "Yerba mate ritual",
        interests: ["mate", "yerba", "termo", "outdoor"],
        ageMin: 22,
        ageMax: 45,
        geo: ["Asunción", "Central", "Alto Paraná"],
      },
      {
        name: "Oficina minimalista",
        interests: ["productividad", "oficina en casa", "diseño escandinavo"],
        ageMin: 25,
        ageMax: 40,
        geo: ["Asunción", "Ciudad del Este"],
      },
      {
        name: "Ruta y camping",
        interests: ["camping", "trekking", "road trip"],
        ageMin: 24,
        ageMax: 50,
        geo: ["Paraguay", "Argentina NEA"],
      },
    ],
    flyerTexts: {
      headline: "Termo Andes 750 ml",
      subheadline: "12 h caliente · 24 h frío · cero fugas",
      bullets: ["Pared doble inox 304", "Tapa antiderrame", "Base antideslizante"],
    },
  },

  pt: {
    skuId: "AFG-DEMO-TERM750PT",
    listing: {
      sku: "TERM-ACO-750",
      standardizedTitle: "Garrafa térmica 750 ml · Edição Andes",
      shortPitch:
        "12 h quente / 24 h gelada. Parede dupla, tampa antivazamento e base antiderrapante.",
      bulletFeatures: [
        "Parede dupla em aço inox 304",
        "Tampa com vedação antivazamento",
        "Base de silicone antiderrapante",
        "Livre de BPA e apta para lava-louças",
      ],
      categoryPath: "Casa / Cozinha / Garrafas térmicas",
      seoMetadata: {
        metaTitle: "Garrafa Térmica 750ml | Edição Andes",
        metaDescription:
          "Garrafa de parede dupla: 12h quente, 24h gelada. Frete para todo o Brasil.",
        keywords: ["garrafa térmica", "chimarrão", "termo inox", "presente", "trilha"],
      },
      missingInformation: [
        "Confirmar preço final e cores disponíveis antes de publicar.",
      ],
    },
    adVariants: [
      {
        platform: "instagram",
        concept: "Ritual premium",
        artDirection: "Superfício marfim limpa estilo capa de revista, produto pequeno integrado abaixo à direita, luz lateral suave e respiro tipográfico.",
        styleArchetype: "editorial-poster",
        hook: "12 h quente. Zero vazamento.",
        body: "A garrafa que acompanha a rota inteira, do chimarrão da manhã à trilha do fim de semana.",
        cta: "Comprar agora",
        imageUrl: "/demo/studio-1.svg",
        featurePills: ["12 h quente", "24 h gelada", "Zero vazamento"],
      },
      {
        platform: "facebook",
        concept: "Mochila sem vazamentos",
        artDirection: "Split 50/50: foto protagonista à direita sobre superfície clara, painel de gradiente à esquerda com espaço para benefícios.",
        styleArchetype: "split-commerce",
        hook: "Chimarrão sem sustos",
        body: "Parede dupla, tampa com trava e base que não escorrega. Garantia de 12 meses.",
        cta: "Ver detalhes",
        imageUrl: "/demo/studio-2.svg",
      },
      {
        platform: "instagram",
        concept: "Da mesa para a trilha",
        artDirection: "Fundo azul-noite, produto centralizado com halo de luz do acento, selo flutuante de oferta e faixa superior limpa.",
        styleArchetype: "bold-dark",
        hook: "Sua mesa, versão trilha",
        body: "750 ml de inox que sobrevive ao chimarrão, à academia e à mochila. Cores limitadas.",
        cta: "Escolher cor",
        imageUrl: "/demo/studio-3.svg",
      },
    ],
    audiences: [
      {
        name: "Ritual do chimarrão",
        interests: ["chimarrão", "erva-mate", "térmica", "outdoor"],
        ageMin: 22,
        ageMax: 45,
        geo: ["Porto Alegre", "Curitiba", "Florianópolis"],
      },
      {
        name: "Escritório minimal",
        interests: ["produtividade", "home office", "design escandinavo"],
        ageMin: 25,
        ageMax: 40,
        geo: ["São Paulo", "Rio de Janeiro"],
      },
      {
        name: "Trilha e camping",
        interests: ["camping", "trekking", "road trip"],
        ageMin: 24,
        ageMax: 50,
        geo: ["Sul do Brasil", "Serrana"],
      },
    ],
    flyerTexts: {
      headline: "Garrafa Andes 750 ml",
      subheadline: "12 h quente · 24 h gelada · zero vazamento",
      bullets: ["Parede dupla inox 304", "Tampa antivazamento", "Base antiderrapante"],
    },
  },

  en: {
    skuId: "AFG-DEMO-TERM750EN",
    listing: {
      sku: "TERMO-STEEL-750",
      standardizedTitle: "750 ml Steel Insulated Bottle · Andes Edition",
      shortPitch:
        "12 h hot / 24 h cold. Double-wall body, leak-proof cap, non-slip silicone base.",
      bulletFeatures: [
        "Double-wall 304 stainless body",
        "Leak-proof twist-lock cap",
        "Non-slip silicone base",
        "BPA-free and dishwasher safe",
      ],
      categoryPath: "Home / Kitchen / Insulated bottles",
      seoMetadata: {
        metaTitle: "750ml Steel Insulated Bottle | Andes Edition",
        metaDescription:
          "Double-wall bottle that holds 12h hot, 24h cold. Ships worldwide from Asunción.",
        keywords: ["insulated bottle", "steel thermos", "mate gourd", "gift", "outdoor"],
      },
      missingInformation: [
        "Confirm final USD price and color stock before publishing.",
      ],
    },
    adVariants: [
      {
        platform: "instagram",
        concept: "Premium daily ritual",
        artDirection: "Clean ivory magazine-cover surface, bottle small and elegantly integrated bottom-right, soft side light, generous negative space for type.",
        styleArchetype: "editorial-poster",
        hook: "12 h hot. Zero leaks.",
        body: "The bottle that survives your full route, sunrise hike to last cup at home.",
        cta: "Shop now",
        imageUrl: "/demo/studio-1.svg",
      },
      {
        platform: "facebook",
        concept: "A leak-free commute",
        artDirection: "50/50 split: hero photo on the right over a clean surface, gradient paint panel on the left with room for benefits and a big CTA.",
        styleArchetype: "split-commerce",
        hook: "Coffee without surprises",
        body: "Double-wall steel, locking lid, base that stays put. 12-month warranty.",
        cta: "See details",
        imageUrl: "/demo/studio-2.svg",
      },
      {
        platform: "instagram",
        concept: "Desk to trail",
        artDirection: "Deep night-blue background, glowing accent halo around the centered product, floating offer seal, clean top band for the headline.",
        styleArchetype: "bold-dark",
        hook: "Your desk, adventure edition",
        body: "750 ml of steel that outlives the gym, the trail, and the commute.",
        cta: "Pick a color",
        imageUrl: "/demo/studio-3.svg",
      },
    ],
    audiences: [
      {
        name: "Morning ritual",
        interests: ["coffee", "commute", "thermos", "outdoor"],
        ageMin: 22,
        ageMax: 45,
        geo: ["Austin", "Denver", "Portland"],
      },
      {
        name: "Desk minimal",
        interests: ["productivity", "home office", "scandinavian design"],
        ageMin: 25,
        ageMax: 40,
        geo: ["New York", "San Francisco"],
      },
      {
        name: "Trail and camping",
        interests: ["camping", "trekking", "road trip"],
        ageMin: 24,
        ageMax: 50,
        geo: ["Colorado", "British Columbia"],
      },
    ],
    flyerTexts: {
      headline: "Andes Bottle 750 ml",
      subheadline: "12 h hot · 24 h cold · zero leaks",
      bullets: ["Double-wall 304 steel", "Leak-proof cap", "Non-slip base"],
    },
  },
};
