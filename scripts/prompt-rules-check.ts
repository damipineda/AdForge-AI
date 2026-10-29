import assert from "node:assert/strict";
import { fitStrategy } from "../src/lib/flyer/fit";
import { carouselPrompts, feedPrompts, storyOutpaintPrompt, storyPrompt, type MuseImageInput } from "../src/lib/pipeline/muse-image";
import { autoFix, findViolations } from "../src/lib/pipeline/copy-validate";
import { piecePrompt } from "../src/lib/pipeline/visual-review";

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
assert.ok(story.includes("268px") && story.includes("384px"), "la story debe fijar las safe zones en píxeles");
assert.ok(story.includes("15% superior") && story.includes("22% inferior"), "la story debe ubicar titular y CTA fuera de las safe zones");
assert.ok(review.includes("SAFE ZONES"), "el revisor debe verificar las safe zones de la story");
assert.ok(review.includes("CHECKS ESTRUCTURADOS"), "el revisor debe devolver checks estructurados");
assert.ok(review.includes("COHERENCIA ESCENA-COPY"), "el revisor debe verificar coherencia escena-copy");

// 7) Estrategia de encuadre: lo nativo se recorta (nunca rellena), el
// mismatch grande se extiende (y la UI lo señaliza).
assert.equal(fitStrategy(1408, 1760, 1080, 1350).mode, "crop", "feed 4:5 nativo no debe rellenar");
assert.equal(fitStrategy(1344, 1792, 1080, 1350).mode, "crop", "feed 3:4 debe ir a center-crop, no a bandas");
assert.equal(fitStrategy(1152, 2048, 1080, 1920).mode, "crop", "story 9:16 nativa no debe rellenar");
assert.equal(fitStrategy(1344, 1792, 1080, 1920).mode, "extend", "story 3:4 debe extenderse (y señalizarse)");
assert.ok(feed[0].includes("90% central"), "el feed debe pedir elementos clave en el 90% central");
assert.ok(slides[0].includes("90% central"), "el carrusel debe pedir elementos clave en el 90% central");

// 9) Outpainting de story: extender sin tocar lo existente.
const outpaint = storyOutpaintPrompt(input, input.story!);
assert.ok(outpaint.includes("OUTPAINTING"), "el reintento de story debe ser outpainting");
assert.ok(outpaint.includes("PROHIBIDO redibujar"), "el outpaint no debe tocar producto ni texto");
assert.ok(outpaint.includes("268px"), "el outpaint respeta las safe zones");

// 10) Validador determinístico de copy.
const fixed = autoFix([{ id: "t", text: "Trae cuatro unidades para el finde, cuando pinten. Tené stock." }], "es");
assert.ok(!/finde|pinten|stock/i.test(fixed.surfaces[0].text), "el autoFix debe limpiar porteñismos y jerga");
assert.ok(fixed.surfaces[0].text.includes("Traé"), "el autoFix debe voseorizar conjugaciones");
assert.equal(autoFix([{ id: "t", text: "Preparalas y armá" }], "es").surfaces[0].text, "Preparalas y armá", "el voseo existente no se toca");
assert.equal(autoFix([{ id: "t", text: "Keep stock ready" }], "en").surfaces[0].text, "Keep stock ready", "en inglés no se toca nada");
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
