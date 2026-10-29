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
  feedVariants: Array<{
    concept: string;
    artDirection: string;
    styleArchetype: StyleArchetype;
    hook: string;
    body: string;
    cta: string;
    imageUrl: string;
    featurePills?: string[];
    captionInstagram: string;
    captionFacebook: string;
  }>;
  story: {
    concept: string;
    artDirection: string;
    hook: string;
    cta: string;
  };
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
    feedVariants: [
      {
        concept: "Ritual premium",
        artDirection: "Superficie marfil limpia estilo portada de revista, producto pequeño integrado abajo a la derecha, luz lateral suave y aire de tipografía arriba.",
        styleArchetype: "editorial-poster",
        hook: "12 h caliente. Cero fugas.",
        body: "El termo que aguanta tu ruta completa, del amanecer en Areguá al último mate de la noche.",
        cta: "Comprar ahora",
        imageUrl: "/demo/studio-1.svg",
        featurePills: ["12 h caliente", "24 h frío", "Cero fugas"],
        captionInstagram: "12 h caliente. Cero fugas. El Termo Andes 750 ml, del primer mate al último. #termo #mate #outdoor",
        captionFacebook: "Termo Andes 750 ml: 12 h caliente, 24 h frío y tapa antiderrame. Escribinos para conocer colores disponibles.",
      },
      {
        concept: "La mochila sin derrames",
        artDirection: "Split 50/50: foto protagonista a la derecha sobre superficie clara, panel de degradado a la izquierda con espacio para beneficios.",
        styleArchetype: "split-commerce",
        hook: "Mate sin sorpresas",
        body: "Pared doble, tapa con seguro y base que no se resbala. Garantía de 12 meses.",
        cta: "Ver detalles",
        imageUrl: "/demo/studio-2.svg",
        featurePills: ["Pared doble", "Tapa con seguro", "Base antideslizante"],
        captionInstagram: "Mate sin sorpresas. Pared doble y tapa con seguro. #mate #termoacero #camping",
        captionFacebook: "¿Derrames en la mochila? Nunca más: pared doble de acero, tapa con seguro y garantía de 12 meses.",
      },
    ],
    story: {
      concept: "De escritorio a aventura",
      artDirection: "Composición vertical 9:16: producto en el tercio medio sobre fondo cálido con luz lateral, titular grande arriba y botón CTA abajo con aire libre en los extremos.",
      hook: "Tu escritorio, versión aventura",
      cta: "Elegir color",
    },
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
    feedVariants: [
      {
        concept: "Ritual premium",
        artDirection: "Superfície marfim limpa estilo capa de revista, produto pequeno integrado abaixo à direita, luz lateral suave e respiro tipográfico.",
        styleArchetype: "editorial-poster",
        hook: "12 h quente. Zero vazamento.",
        body: "A garrafa que acompanha a rota inteira, do chimarrão da manhã à trilha do fim de semana.",
        cta: "Comprar agora",
        imageUrl: "/demo/studio-1.svg",
        featurePills: ["12 h quente", "24 h gelada", "Zero vazamento"],
        captionInstagram: "12 h quente. Zero vazamento. A Andes 750 ml do chimarrão à trilha. #garrafatermica #chimarrao #trilha",
        captionFacebook: "Garrafa Andes 750 ml: 12 h quente, 24 h gelada e tampa antivazamento. Chama no direct para cores disponíveis.",
      },
      {
        concept: "Mochila sem vazamentos",
        artDirection: "Split 50/50: foto protagonista à direita sobre superfície clara, painel de gradiente à esquerda com espaço para benefícios.",
        styleArchetype: "split-commerce",
        hook: "Chimarrão sem sustos",
        body: "Parede dupla, tampa com trava e base que não escorrega. Garantia de 12 meses.",
        cta: "Ver detalhes",
        imageUrl: "/demo/studio-2.svg",
        captionInstagram: "Chimarrão sem sustos. Parede dupla e tampa com trava. #chimarrao #termico #camping",
        captionFacebook: "Vazamento na mochila? Nunca mais: parede dupla em inox, tampa com trava e garantia de 12 meses.",
      },
    ],
    story: {
      concept: "Da mesa para a trilha",
      artDirection: "Composição vertical 9:16: produto no terço médio sobre fundo quente com luz lateral, título grande acima e botão de CTA abaixo com respiro nas extremidades.",
      hook: "Sua mesa, versão trilha",
      cta: "Escolher cor",
    },
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
    feedVariants: [
      {
        concept: "Premium daily ritual",
        artDirection: "Clean ivory magazine-cover surface, bottle small and elegantly integrated bottom-right, soft side light, generous negative space for type.",
        styleArchetype: "editorial-poster",
        hook: "12 h hot. Zero leaks.",
        body: "The bottle that survives your full route, sunrise hike to last cup at home.",
        cta: "Shop now",
        imageUrl: "/demo/studio-1.svg",
        captionInstagram: "12 h hot. Zero leaks. The Andes 750 ml, sunrise hike to last cup. #insulatedbottle #outdoors #gift",
        captionFacebook: "Andes 750 ml steel bottle: 12 h hot, 24 h cold, leak-proof cap. Message us for available colors.",
      },
      {
        concept: "A leak-free commute",
        artDirection: "50/50 split: hero photo on the right over a clean surface, gradient paint panel on the left with room for benefits and a big CTA.",
        styleArchetype: "split-commerce",
        hook: "Coffee without surprises",
        body: "Double-wall steel, locking lid, base that stays put. 12-month warranty.",
        cta: "See details",
        imageUrl: "/demo/studio-2.svg",
        captionInstagram: "Coffee without surprises. Double-wall steel, locking lid. #coffee #commute #thermos",
        captionFacebook: "Leaks in your bag? Never again: double-wall steel, locking lid and 12-month warranty.",
      },
    ],
    story: {
      concept: "Desk to trail",
      artDirection: "Native vertical 9:16 layout: product in the middle third over a warm backdrop with side light, big headline on top and CTA button below with clear space at both ends.",
      hook: "Your desk, adventure edition",
      cta: "Pick a color",
    },
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
