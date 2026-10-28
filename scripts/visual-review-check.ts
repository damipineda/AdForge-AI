import assert from "node:assert/strict";
import { reviewCampaign } from "../src/lib/pipeline/visual-review";
import type { MuseImageInput, MuseImageOutput } from "../src/lib/pipeline/muse-image";

const source = { mimeType: "image/png", base64: "YWJj" };
const url = "data:image/png;base64,YWJj";
const input: MuseImageInput = {
  locale: "es", format: "post", productDescription: "Hamburguesas congeladas", designData: null, photo: source,
  hooks: ["Primera", "Segunda", "Tercera"], bodies: ["A", "B", "C"], ctas: ["Ver", "Ver", "Ver"],
  concepts: ["Preparar", "Comer", "Compartir"], artDirections: ["A", "B", "C"], pills: [[], [], []],
  creativeStrategy: { campaignIdea: "Preparar en casa", audience: "Hogares", objective: "Conocer", visualWorld: "Cocina cotidiana", carouselRecommended: false, carouselReason: "Una pieza basta" }, carouselSlides: null,
};
const image: MuseImageOutput = {
  scenes: [] as unknown as MuseImageOutput["scenes"], posters: [url, url, url], errors: [null, null, null], carouselImages: null, carouselErrors: null,
};
const issue = { category: "scene", severity: "critical", description: "No aparece el producto", suggestion: "Mostrar el producto", affectedIndices: [] };

async function run() {
  const demo = await reviewCampaign(input, image, "demo", {
    inspect: async () => { throw new Error("demo no debe llamar a red"); },
    regenerate: async () => { throw new Error("demo no debe regenerar"); },
  });
  assert.equal(demo.visualReviews[0].status, "not_generated");

  let regenerationCalls = 0;
  let reviewCalls = 0;
  const fixed = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => {
      if (prompt.includes("misma campaña") || prompt.includes("MISMA campaña")) return { summary: "Composiciones diferentes", issues: [] };
      reviewCalls++;
      return reviewCalls <= 3 ? { summary: "Problema detectado", issues: [issue] } : { summary: "Problema corregido", issues: [] };
    },
    regenerate: async () => { regenerationCalls++; return { mimeType: "image/png", base64: "ZGVm" }; },
  });
  assert.equal(regenerationCalls, 2, "no más de dos regeneraciones por campaña");
  assert.equal(fixed.visualReviews[0].retryCount, 1);
  assert.equal(fixed.visualReviews[1].retryCount, 1);
  assert.equal(fixed.visualReviews[2].status, "needs_review");
  assert.equal(fixed.image.posters[0], "data:image/png;base64,ZGVm");
  assert.equal(fixed.image.posters[2], url);

  const unavailable = await reviewCampaign(input, image, "meta", {
    inspect: async () => { throw new Error("proveedor no disponible"); },
    regenerate: async () => { throw new Error("no debe regenerar sin observaciones"); },
  });
  assert.equal(unavailable.visualReviews[0].status, "unavailable");
  assert.equal(unavailable.diversityReview.status, "unavailable");
  assert.equal(unavailable.image.posters[0], url);

  const verbose = await reviewCampaign(input, image, "meta", {
    inspect: async () => ({ summary: "Resumen ".repeat(100), issues: [{ ...issue, severity: "warning", description: "Detalle ".repeat(100), suggestion: "Sugerencia ".repeat(100) }] }),
    regenerate: async () => { throw new Error("una advertencia no debe regenerar"); },
  });
  assert.equal(verbose.visualReviews[0].status, "needs_review");
  assert.ok(verbose.visualReviews[0].issues[0].description.length <= 300);
  assert.ok(verbose.visualReviews[0].summary.length <= 350);

  let attempts = 0;
  const failedRetry = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => prompt.includes("MISMA campaña") ? { summary: "Distintas", issues: [] } : { summary: "Fallo", issues: [issue] },
    regenerate: async () => { attempts++; throw new Error("falló imagen"); },
  });
  assert.equal(attempts, 2);
  assert.equal(failedRetry.image.posters[0], url);
  assert.equal(failedRetry.visualReviews[0].status, "needs_review");
  assert.equal(failedRetry.visualReviews[0].retryCount, 1);

  let compared = 0;
  let retried = 0;
  const repetitive = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt, images) => {
      if (prompt.includes("MISMA campaña")) {
        assert.equal(images.length, 3, "comparación recibe las tres imágenes");
        compared++;
        return compared === 1
          ? { summary: "Dos diseños repiten composición", issues: [{ category: "diversity", severity: "critical", description: "Piezas repetidas", suggestion: "Cambiar composición", affectedIndices: [2] }] }
          : { summary: "Composiciones diferentes", issues: [] };
      }
      assert.equal(images.length, 2, "revisión individual recibe original y pieza");
      return { summary: "Sin problemas observables", issues: [] };
    },
    regenerate: async () => { retried++; return { mimeType: "image/png", base64: "ZGVm" }; },
  });
  assert.equal(retried, 1, "solo se corrige la pieza señalada");
  assert.equal(compared, 2, "se compara nuevamente la salida final");
  assert.equal(repetitive.image.posters[1], "data:image/png;base64,ZGVm");
  assert.equal(repetitive.image.posters[0], url);
  console.log("OK · revisión, límite de reintentos y conservación de originales");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
