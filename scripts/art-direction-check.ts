import assert from "node:assert/strict";
import { brandAccent, reviewCreativePlan } from "../src/lib/pipeline/creative-plan";
import { storyImageSize } from "../src/lib/pipeline/meta";
import { artDirectedLayers } from "../src/lib/flyer/layers";

async function main() {
  const data = { dominantColorHex: "#FFFFFF", secondaryColorHex: "#EA580C", styleArchetype: "editorial-poster" as const };
  assert.equal(brandAccent(data), "#EA580C");
  const oldLegacy = process.env.MUSE_IMAGE_SIZE;
  const oldStory = process.env.MUSE_IMAGE_SIZE_STORY;
  try {
    process.env.MUSE_IMAGE_SIZE = "1408x1760";
    delete process.env.MUSE_IMAGE_SIZE_STORY;
    assert.equal(storyImageSize(), "1080x1920", "Legacy feed dimensions must not override Stories");
    process.env.MUSE_IMAGE_SIZE_STORY = "1152x2048";
    assert.equal(storyImageSize(), "1152x2048");
    process.env.MUSE_IMAGE_SIZE_STORY = "1408x1760";
    assert.equal(storyImageSize(), "1080x1920");
  } finally {
    if (oldLegacy === undefined) delete process.env.MUSE_IMAGE_SIZE; else process.env.MUSE_IMAGE_SIZE = oldLegacy;
    if (oldStory === undefined) delete process.env.MUSE_IMAGE_SIZE_STORY; else process.env.MUSE_IMAGE_SIZE_STORY = oldStory;
  }
  const variant = { concept: "Pasos cotidianos", artDirection: "Ciudad contemporánea con profundidad", styleArchetype: "editorial-poster" as const, hook: "Elegí tu próximo paso", body: "Un modelo para acompañar tus planes", cta: "Consultá tu talle", imageUrl: "/demo/studio-1.svg", featurePills: [], captionInstagram: "", captionFacebook: "" };
  const result = await reviewCreativePlan({ product: "Zapatilla deportiva", locale: "es", designData: data,
    strategy: { campaignIdea: "Tu ritmo", audience: "Adultos", objective: "Consulta", visualWorld: "Ciudad contemporánea", carouselRecommended: false, carouselReason: "Sin secuencia" },
    feed: [variant, { ...variant, concept: "Movimiento diario" }], story: { hook: "La ciudad te espera", cta: "Consultá tu talle", concept: "Tu ritmo", artDirection: "Ciudad al atardecer" },
  }, "demo");
  assert.ok(result.feed.every(v=>v.layoutLayers === undefined));
  assert.equal(result.story?.layoutLayers, undefined);
  const furniture = await reviewCreativePlan({ product: "Cama de madera para el hogar", locale: "es", designData: { ...data, dominantColorHex: "#102342", secondaryColorHex: "#C3AD91" },
    strategy: { campaignIdea: "Descanso", audience: "Adultos", objective: "Consulta", visualWorld: "Interior beige luminoso", carouselRecommended: false, carouselReason: "Sin secuencia" },
    feed: [variant, { ...variant, concept: "Dormitorio" }], story: { hook: "Descanso a tu medida", cta: "Consultá medidas", concept: "Hogar", artDirection: "Fondo beige luminoso" },
  }, "demo");
  assert.ok(furniture.feed.every(v=>v.layoutLayers === undefined));
  assert.equal(furniture.story?.layoutLayers, undefined);
  const legacy = await reviewCreativePlan({ product: "Cama", locale: "es", strategy: { campaignIdea: "Hogar", audience: "Adultos", objective: "Consulta", visualWorld: "Interior", carouselRecommended: false, carouselReason: "Sin secuencia" }, feed: [{...variant,layoutLayers:artDirectedLayers("Antes",null,"Consultar",0,"#8D7B6A")},variant], story:null },"demo");
  assert.equal(legacy.feed[0].layoutLayers,undefined);
  console.log("OK · planes integrados sin coordenadas y tamaño Story independiente");
}
void main();
