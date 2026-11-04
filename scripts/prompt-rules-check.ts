import assert from "node:assert/strict";
import { fitStrategy } from "../src/lib/flyer/fit";
import { carouselPrompts, feedPrompts, storyOutpaintPrompt, storyPrompt, type MuseImageInput } from "../src/lib/pipeline/muse-image";
import { autoFix, findViolations } from "../src/lib/pipeline/copy-validate";
import { diversityPrompt, piecePrompt } from "../src/lib/pipeline/visual-review";
import { requiresFreshLayout } from "../src/lib/pipeline/review-policy";
import { constrainLayers, defaultLayers } from "../src/lib/flyer/layers";

/**
 * Cobertura de las reglas anti-deformación y de composición: los builders de
 * prompts son funciones puras, así que se verifican sin red ni llave.
 * Correr con: npx tsx scripts/prompt-rules-check.ts
 */
const input: MuseImageInput = {
  locale: "es",
  productDescription: "Caja de té verde de 250 g",
  designData: { dominantColorHex: "#0f6b4f", secondaryColorHex: "#f5f5f2", styleArchetype: "editorial-poster" },
  photo: { mimeType: "image/png", base64: "YWJj" },
  feed: [
    { hook: "H1", body: "B1", cta: "C1", concept: "K1", artDirection: "D1", pills: [] },
    { hook: "H2", body: "B2", cta: "C2", concept: "K2", artDirection: "D2", pills: [] },
  ],
  story: { hook: "HS", cta: "CS", concept: "KS", artDirection: "DS" },
  creativeStrategy: {
    campaignIdea: "Té de la mañana", audience: "Hogares", objective: "Conocer",
    visualWorld: "Cocina luminosa", carouselRecommended: false, carouselReason: "Piezas bastan",
  },
  carouselSlides: [
    { stage: "attention", headline: "A", body: "B", cta: "C" },
    { stage: "interest", headline: "A", body: "B", cta: "C" },
    { stage: "desire", headline: "A", body: "B", cta: "C" },
    { stage: "action", headline: "A", body: "B", cta: "C" },
  ],
};

const feed = feedPrompts(input);
const story = storyPrompt(input, input.story!);
const slides = carouselPrompts(input);
const review = piecePrompt(input, { hook: "H", body: "B", cta: "C" }, "story vertical 9:16");

// 1) Geometría exacta en TODAS las piezas generadas.
for (const [name, prompt] of [["feed V1", feed[0]], ["feed V2", feed[1]], ["story", story], ...slides.map((s, i) => [`lámina ${i + 1}`, s] as const)]) {
  assert.ok(prompt.includes("GEOMETRÍA EXACTA"), `${name}: falta la cláusula de geometría exacta`);
  assert.ok(prompt.includes("PROHIBIDO estirarlo"), `${name}: falta la prohibición de estirar/aplastar`);
}

// Las decisiones específicas de cada pieza deben llegar al generador sin escenas prefijadas.
for (const [name, prompt] of [["feed V1", feed[0]], ["feed V2", feed[1]], ["story", story], ...slides.map((s, i) => [`lámina ${i + 1}`, s] as const)]) {
  assert.ok(prompt.includes("DIVERSIDAD DE DIRECCIÓN"), `${name}: debe pedir diversidad conceptual`);
  assert.ok(!prompt.includes("HERO STUDIO") && !prompt.includes("LIFESTYLE CONTEMPORÁNEO"), `${name}: no debe imponer escenas por variante`);
  assert.ok(!prompt.includes("luz cenital dramática"), `${name}: no debe imponer iluminación de plantilla`);
}
assert.ok(feed[0].includes("DIRECCIÓN DE ARTE ESPECÍFICA: D1"));
assert.ok(feed[1].includes("DIRECCIÓN DE ARTE ESPECÍFICA: D2"));
assert.ok(story.includes("DIRECCIÓN DE ARTE: DS"));

// 4) El revisor compara aspecto y rechaza deformación como critical.
assert.ok(review.includes("GEOMETRÍA DEL ENVASE"), "el revisor debe verificar la geometría del envase");
assert.ok(review.includes("ancho/alto"), "el revisor debe comparar la relación ancho/alto");
assert.ok(review.includes("severity=critical"), "la deformación clara debe ser critical (dispara regeneración)");
assert.ok(review.includes("sin imponer un porcentaje fijo"), "la escala debe evaluarse según la pieza");

// 5) Safe zones de Meta con píxeles explícitos + checks estructurados.
const bounded = constrainLayers({ ...defaultLayers("Titular", null, "CTA", true), headline: { ...defaultLayers("Titular", null, "CTA", true).headline, y: 0 }, cta: { ...defaultLayers("Titular", null, "CTA", true).cta, y: 99 } }, true);
assert.ok(bounded.headline.y >= 16 && bounded.cta.y <= 74, "las capas story deben respetar las zonas seguras");
assert.ok(story.includes("DISEÑO INTEGRADO OBLIGATORIO") && story.includes("COPY EXACTO"), "Story debe incluir tipografía y CTA integrados");
assert.ok(review.includes("SAFE ZONES"), "el revisor debe verificar las safe zones de la story");
assert.ok(review.includes("CHECKS ESTRUCTURADOS"), "el revisor debe devolver checks estructurados");
assert.ok(review.includes("COHERENCIA ESCENA-COPY"), "el revisor debe verificar coherencia escena-copy");

// 7) Estrategia de encuadre: lo nativo se recorta (nunca rellena), el
// mismatch grande se extiende (y la UI lo señaliza).
assert.equal(fitStrategy(1408, 1760, 1080, 1350).mode, "crop", "feed 4:5 nativo no debe rellenar");
assert.equal(fitStrategy(1344, 1792, 1080, 1350).mode, "crop", "feed 3:4 debe ir a center-crop, no a bandas");
assert.equal(fitStrategy(1152, 2048, 1080, 1920).mode, "crop", "story 9:16 nativa no debe rellenar");
assert.equal(fitStrategy(1344, 1792, 1080, 1920).mode, "extend", "story 3:4 debe extenderse (y señalizarse)");
assert.ok(feed.every(prompt=>prompt.includes("DISEÑO INTEGRADO OBLIGATORIO") && prompt.includes("COPY EXACTO")), "el feed debe generar anuncios completos");
assert.ok(slides[0].includes("90% central"), "el carrusel debe pedir elementos clave en el 90% central");

// 9) Outpainting de story: extender sin tocar lo existente.
const outpaint = storyOutpaintPrompt(input, input.story!);
assert.ok(outpaint.includes("OUTPAINTING"), "el reintento de story debe ser outpainting");
assert.ok(outpaint.includes("PROHIBIDO redibujar"), "el outpaint no debe tocar producto ni texto");
assert.ok(outpaint.includes("250px"), "el outpaint respeta las safe zones");

// 10) Validador determinístico de copy.
const fixed = autoFix([{ id: "t", text: "Trae cuatro unidades para el finde, cuando pinten. Tené stock." }], "es");
assert.ok(!/finde|pinten|stock/i.test(fixed.surfaces[0].text), "el autoFix debe limpiar porteñismos y jerga");
assert.ok(fixed.surfaces[0].text.includes("Traé"), "el autoFix debe voseorizar conjugaciones");
assert.equal(autoFix([{ id: "t", text: "Preparalas y armá" }], "es").surfaces[0].text, "Preparalas y armá", "el voseo existente no se toca");
assert.equal(autoFix([{ id: "t", text: "Keep stock ready" }], "en").surfaces[0].text, "Keep stock ready", "en inglés no se toca nada");
assert.equal(autoFix([{ id: "pill1", text: "Friegasuelos 1,5 en etiqueta" }], "es").surfaces[0].text, "Friegasuelos 1,5", "el autoFix debe limpiar 'en etiqueta' de las pills");
const dups = findViolations([
  { id: "a", text: "Carne vacuna congelada de industria paraguaya para vos" },
  { id: "b", text: "Hamburguesas de carne vacuna congelada de industria paraguaya" },
], "es");
assert.ok(dups.some((d) => d.kind === "duplicate"), "la duplicación literal entre superficies debe detectarse");

// La elección de fondo inicial no debe reemplazar las direcciones propias.
const scenePrompts = feedPrompts({ ...input, background: { mode: "scene", colorHex: null, reason: "referencia inicial" } });
assert.ok(scenePrompts.every((prompt) => prompt.includes("orientativa")));
assert.ok(scenePrompts.every((prompt) => !prompt.includes("ESCENA BASE OBLIGATORIA")));

// 11) Skill aprendido: sin reglas no hay ruido; con reglas se inyectan.
assert.ok(!feed[0].includes("REGLAS APRENDIDAS"), "sin reglas activas el prompt no debe mencionar el skill");
const skilled = { ...input, learnedRules: ["Regla de prueba del skill"] };
const skilledFeed = feedPrompts(skilled);
assert.ok(skilledFeed.every((prompt) => prompt.includes("REGLAS APRENDIDAS") && prompt.includes("Regla de prueba del skill")), "las reglas activas deben inyectarse en feed");
assert.ok(storyPrompt(skilled, skilled.story!).includes("Regla de prueba del skill"), "las reglas activas deben inyectarse en story");
assert.ok(carouselPrompts(skilled)[0].includes("Regla de prueba del skill"), "las reglas activas deben inyectarse en carrusel");

// 12) Oficio determinístico: apertura de catálogo y color como idea van a reparación.
const catalogHit = findViolations([
  { id: "V1 body", text: "Esta zapatilla deportiva negra con tiras blancas te acompaña siempre" },
  { id: "V1 hook", text: "Salí a moverte con confianza" },
], "es");
assert.ok(catalogHit.some((v) => v.kind === "catalog" && v.surface === "V1 body"), "el apoyo de catálogo debe marcarse como catalog");
// Genérico por estructura, sin vocabulario de categoría: termo, hamburguesa, auto.
for (const [id, text] of [
  ["V1 body", "Este termo de acero mantiene todo caliente"],
  ["V2 body", "Esta hamburguesa de carne vacuna es bien paraguaya"],
  ["subheadline", "Estos medallones rinden hasta cincuenta lavados"],
] as const) {
  const hit = findViolations([{ id, text }], "es");
  assert.ok(hit.some((v) => v.kind === "catalog"), `${id} "${text}" debe marcarse como catalog`);
}
const catalogMiss = findViolations([
  { id: "V1 body", text: "Este fin de semana salí a correr con ellas" },
  { id: "V2 body", text: "Esta es tu oportunidad de entrenar mejor" },
], "es");
assert.ok(!catalogMiss.some((v) => v.kind === "catalog"), "momentos de uso y copulativas no deben marcarse como catalog");
const colorHit = findViolations([{ id: "story hook", text: "Mirá este negro de cerca" }], "es");
assert.ok(colorHit.some((v) => v.kind === "color-concept"), "el color como idea en story debe marcarse");
console.log("OK · direcciones contextuales, geometría, safe zones y copy");

// Editable typography must not flatten the photographic scene.
const groupFeed = feedPrompts({ ...input, productCount: 3, groupMode: true });
for (const prompt of [...groupFeed, story]) {
  assert.ok(prompt.includes("TRES PLANOS"));
  assert.ok(prompt.includes("f/1.8"));
  assert.ok(!prompt.includes("0-32% completamente despejado"));
  assert.ok(!prompt.includes("solo pared"));
}
assert.ok(groupFeed.every((prompt) => prompt.includes("cluster compacto y coherente") && prompt.includes("15-25%") && prompt.includes("REGLA DE BASES ALINEADAS")), "los flyers de grupo deben exigir cluster en media luna con bases alineadas al mismo nivel y sin escalones");
assert.ok(feed.every((prompt) => prompt.includes("HERO SHOT DE AGENCIA") && prompt.includes("PROHIBIDO colocar cajas blancas o banners opacos grandes") && prompt.includes("AISLAMIENTO DE ETIQUETAS") && prompt.includes("rojo semáforo")), "los flyers individuales y grupales prohíben tarjetas blancas opacas, mezcla de etiquetas y CTA rojo genérico clonado");
assert.ok(outpaint.includes("PROHIBIDO franjas lisas"));

assert.ok(feed.every(prompt=>!prompt.includes("agregada después") && !prompt.includes("PROHIBIDO dibujar titulares")));
const pills = feedPrompts({ ...input, feed: [input.feed[0], { ...input.feed[1], pills: ["Beneficio verificado"] }] });
assert.ok(pills[1].includes("PASTILLAS DE BENEFICIOS INTEGRADAS") && pills[1].includes("Beneficio verificado"));
assert.ok(review.includes("Copy previsto"));

// 13) Kit de marca: sin kit el prompt no cambia; con kit entra paleta y reserva de logo.
const brand = { name: "Tienda Py", primary: "#123456", secondary: "#654321", accent: "#ABCDEF", hasLogo: true };
const brandedFeed = feedPrompts({ ...input, brand });
assert.ok(brandedFeed.every((prompt) => prompt.includes("#123456") && prompt.includes("esquina inferior libre")), "con kit debe entrar paleta y reserva de logo en feed");
assert.ok(storyPrompt({ ...input, brand }, input.story!).includes("#123456"), "con kit debe entrar paleta en story");
assert.ok(carouselPrompts({ ...input, brand })[0].includes("NO dibujes ningún logo"), "con kit no debe dibujar logos el modelo");
assert.ok(!feed.some((prompt) => prompt.includes("#123456") || prompt.includes("LOGO REAL")), "sin kit no debe aparecer la marca");

// 14) Contrato texto-escena: el texto nunca pisa al producto y la escena es su contexto real.
for (const [name, prompt] of [["feed V1", feed[0]], ["feed V2", feed[1]], ["story", story], ["carrusel", slides[0]]]) {
  assert.ok(prompt.includes("CONTRATO TEXTO-ESCENA"), `${name}: falta el contrato texto-escena`);
  assert.ok(prompt.includes("ENCIMA del producto"), `${name}: el texto no debe ir sobre el producto`);
}
assert.ok(review.includes("TEXTO SOBRE EL PRODUCTO"), "el revisor debe verificar texto sobre el producto");
assert.ok(review.includes("ESCENA ACORDE AL PRODUCTO"), "el revisor debe verificar escena acorde al producto");
assert.ok(review.includes("sin excepciones"), "el texto sobre el producto debe ser critical absoluto");

// 15) Variedad de CTA: cada pieza varía formato y posición; el logo respeta zona segura.
for (const [name, prompt] of [["feed V1", feed[0]], ["feed V2", feed[1]], ["story", story], ["carrusel", slides[0]]]) {
  assert.ok(prompt.includes("VARIEDAD DE CTA"), `${name}: el CTA debe variar de formato y posición`);
  assert.ok(prompt.includes("mismo botón abajo"), `${name}: prohibido el botón abajo clonado`);
}
assert.ok(story.includes("antes del 87%"), "el CTA de story debe terminar antes del 87%");
assert.ok(review.includes("por debajo del 87%"), "el revisor debe medir el CTA de story contra el 87%");

// 16) Colisiones con logo y flotación: CTA con ancho tope y apoyo obligatorio.
assert.ok(
  brandedFeed.every((prompt) => prompt.includes("70% del ancho")),
  "con kit el CTA no debe invadir la esquina del logo",
);
const brandedReview = piecePrompt(
  { ...input, productCount: 4, groupMode: true, brand },
  { hook: "H", body: "B", cta: "C" },
  "feed 4:5",
);
assert.ok(
  brandedReview.includes("70% del ancho"),
  "el revisor debe exigir esquina libre para el logo",
);
assert.ok(
  brandedReview.includes("sin apoyo ni sombra es composition severity=critical"),
  "el producto flotando sin apoyo debe ser critical",
);

// 17) Logo fijado por el usuario: la reserva y el revisor usan esa esquina.
const brandLeft = { ...brand, logoPosition: "left" as const };
const brandedFeedLeft = feedPrompts({ ...input, brand: brandLeft });
assert.ok(
  brandedFeedLeft.every((prompt) => prompt.includes("inferior IZQUIERDA") || prompt.includes("inferior izquierda")),
  "con logo a la izquierda el prompt debe reservar esa esquina",
);
const brandedReviewLeft = piecePrompt({ ...input, brand: brandLeft }, { hook: "H", body: "B", cta: "C" }, "feed 4:5");
assert.ok(
  brandedReviewLeft.includes("inferior izquierda"),
  "el revisor debe exigir libre la esquina fijada a la izquierda",
);

// 18) Variedad de CTA en el comparador: mismo formato+posición = clonación critical.
const diversity = diversityPrompt(input, ["feed V1", "feed V2", "story"]);
assert.ok(
  diversity.includes("VARIEDAD DE CTA") && diversity.includes("mismo formato") && diversity.includes("diversity severity=critical"),
  "el comparador debe marcar como critical el CTA idéntico en formato y posición",
);

// 19) Story con producto único flotando: apoyo obligatorio critical.
const storySingleReview = piecePrompt(input, { hook: "H", body: "B", cta: "C" }, "story vertical 9:16");
assert.ok(
  storySingleReview.includes("APOYO EN STORY") && storySingleReview.includes("composition severity=critical"),
  "la story con producto flotante sin apoyo debe ser critical",
);

// 20) Auto-corrección: fallas de layout exigen recomposición desde fotos.
const safeZoneReview = {
  status: "needs_review" as const, summary: "CTA bajo", issues: [{
    category: "typography" as const, severity: "critical" as const,
    description: "SAFE ZONES: el titular empieza dentro del 13% superior (7-8% del alto), zona reservada a la UI de Instagram.",
    suggestion: "Bajar el bloque de titular para que inicie debajo del 13% superior.",
    affectedIndices: [],
  }],
  checks: [{ id: "safe_zones" as const, passed: false, detail: "CTA dentro del 13% inferior" }],
  retryCount: 0, retryReason: null,
};
assert.equal(requiresFreshLayout(safeZoneReview), true, "una falla de safe_zones debe recomponerse desde fotos, no con img2img");
assert.equal(
  requiresFreshLayout({ status: "reviewed" as const, summary: "ok", issues: [], checks: [], retryCount: 0, retryReason: null }),
  false,
  "sin fallas de layout la corrección puede ir sobre la imagen",
);
