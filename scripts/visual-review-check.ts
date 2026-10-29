import assert from "node:assert/strict";
import { reviewCampaign } from "../src/lib/pipeline/visual-review";
import type { MuseImageInput, MuseImageOutput } from "../src/lib/pipeline/muse-image";

const source = { mimeType: "image/png", base64: "YWJj" };
const url = "data:image/png;base64,YWJj";
const input: MuseImageInput = {
  locale: "es", productDescription: "Hamburguesas congeladas", designData: null, photo: source,
  feed: [
    { hook: "Primera", body: "A", cta: "Ver", concept: "Preparar", artDirection: "A", pills: [] },
    { hook: "Segunda", body: "B", cta: "Ver", concept: "Comer", artDirection: "B", pills: [] },
  ],
  story: { hook: "Tercera", cta: "Ver", concept: "Compartir", artDirection: "C" },
  creativeStrategy: { campaignIdea: "Preparar en casa", audience: "Hogares", objective: "Conocer", visualWorld: "Cocina cotidiana", carouselRecommended: false, carouselReason: "Una pieza basta" }, carouselSlides: null,
};
const image: MuseImageOutput = {
  scenes: [] as unknown as MuseImageOutput["scenes"], feed: [url, url], feedErrors: [null, null], storyImage: url, storyError: null, carouselImages: null, carouselErrors: null,
};
const issue = { category: "scene", severity: "critical", description: "No aparece el producto", suggestion: "Mostrar el producto", affectedIndices: [] };

async function run() {
  const demo = await reviewCampaign(input, image, "demo", {
    inspect: async () => { throw new Error("demo no debe llamar a red"); },
    regenerate: async () => { throw new Error("demo no debe regenerar"); },
  });
  assert.equal(demo.feedReviews[0].status, "not_generated");
  assert.equal(demo.storyReview?.status, "not_generated");

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
  assert.equal(fixed.feedReviews[0].retryCount, 1);
  assert.equal(fixed.feedReviews[1].retryCount, 1);
  assert.equal(fixed.storyReview?.status, "needs_review");
  assert.equal(fixed.image.feed[0], "data:image/png;base64,ZGVm");
  assert.equal(fixed.image.storyImage, url);

  const unavailable = await reviewCampaign(input, image, "meta", {
    inspect: async () => { throw new Error("proveedor no disponible"); },
    regenerate: async () => { throw new Error("no debe regenerar sin observaciones"); },
  });
  assert.equal(unavailable.feedReviews[0].status, "unavailable");
  assert.equal(unavailable.diversityReview.status, "unavailable");
  assert.equal(unavailable.image.feed[0], url);

  const verbose = await reviewCampaign(input, image, "meta", {
    inspect: async () => ({ summary: "Resumen ".repeat(100), issues: [{ ...issue, severity: "warning", description: "Detalle ".repeat(100), suggestion: "Sugerencia ".repeat(100) }] }),
    regenerate: async () => { throw new Error("una advertencia no debe regenerar"); },
  });
  assert.equal(verbose.feedReviews[0].status, "needs_review");
  assert.ok(verbose.feedReviews[0].issues[0].description.length <= 300);
  assert.ok(verbose.feedReviews[0].summary.length <= 350);

  let attempts = 0;
  const failedRetry = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => prompt.includes("MISMA campaña") ? { summary: "Distintas", issues: [] } : { summary: "Fallo", issues: [issue] },
    regenerate: async () => { attempts++; throw new Error("falló imagen"); },
  });
  assert.equal(attempts, 2);
  assert.equal(failedRetry.image.feed[0], url);
  assert.equal(failedRetry.feedReviews[0].status, "needs_review");
  assert.equal(failedRetry.feedReviews[0].retryCount, 1);

  let compared = 0;
  let retried = 0;
  const repetitive = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt, images) => {
      if (prompt.includes("MISMA campaña")) {
        assert.equal(images.length, 3, "comparación recibe feed V1, V2 y story");
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
  assert.equal(compared, 3, "se compara la candidata y luego la salida final");
  assert.equal(repetitive.image.feed[1], "data:image/png;base64,ZGVm");
  assert.equal(repetitive.image.feed[0], url);
  let editReference: unknown;
  let checks = 0;
  const edited = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => {
      if (prompt.includes("MISMA campaña")) return { summary: "Variadas", issues: [] };
      checks++;
      return checks === 1 ? { summary: "Texto ilegible", issues: [{ ...issue, category: "typography", severity: "warning" }] } : { summary: "Corregido", issues: [] };
    },
    regenerate: async (_prompt, _photo, _size, reference) => { editReference = reference; return { mimeType: "image/png", base64: "ZGVm" }; },
  });
  assert.equal((editReference as { base64: string }).base64, "YWJj", "la edición usa el arte anterior como referencia");
  assert.equal(edited.image.feed[0], "data:image/png;base64,ZGVm");
  let persistentCalls = 0;
  const persistent = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => {
      if (prompt.includes("MISMA campaña")) return { summary: "Variadas", issues: [] };
      persistentCalls++;
      return persistentCalls === 1 || prompt.includes("Verificá específicamente")
        ? { summary: "Texto ilegible", issues: [{ ...issue, category: "typography", severity: "warning" }] }
        : { summary: "Sin errores", issues: [] };
    },
    regenerate: async () => ({ mimeType: "image/png", base64: "ZGVm" }),
  });
  assert.equal(persistent.image.feed[0], url, "se conserva el original si la revisión detecta el mismo problema");
  let captionEdits = 0;
  const captionIssue = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => prompt.includes("MISMA campaña") ? { summary: "Variadas", issues: [] } : { summary: "Descripción genérica", issues: [{ ...issue, category: "copy", severity: "warning", description: "DESCRIPCIÓN: no acompaña la pieza" }] },
    regenerate: async () => { captionEdits++; return { mimeType: "image/png", base64: "ZGVm" }; },
  });
  assert.equal(captionEdits, 0, "un problema de descripción externa no debe editar el arte");
  assert.equal(captionIssue.feedReviews[0].status, "needs_review");
  let privacyReference: unknown;
  const privateIssue = { ...issue, category: "privacy", description: "La matrícula se ve legible", suggestion: "Cubrir los caracteres" };
  const privateResult = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => prompt.includes("MISMA campaña") ? { summary: "Variadas", issues: [] } : { summary: "Datos visibles", issues: [privateIssue] },
    regenerate: async (_prompt, _photo, _size, reference) => { privacyReference = reference; return { mimeType: "image/png", base64: "ZGVm" }; },
  });
  assert.ok(privacyReference, "la corrección usa la imagen previa");
  assert.equal(privateResult.image.feed[0], url, "no se acepta la corrección si el dato sigue visible");
  assert.ok(privateResult.feedReviews[0].issues.some((entry) => entry.category === "privacy"));

  // Escalado determinístico: check safe_zones fallido sin issue crítico igual dispara reintento.
  let zoneRegenerations = 0;
  let zoneInspections = 0;
  const zoned = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => {
      if (prompt.includes("MISMA campaña")) return { summary: "Variadas", issues: [] };
      if (!prompt.includes("story vertical")) return { summary: "Feed bien", issues: [] };
      zoneInspections++;
      return zoneInspections === 1
        ? { summary: "CTA bajo", issues: [], checks: [{ id: "safe_zones", passed: false, detail: "CTA dentro del 22% inferior" }] }
        : { summary: "CTA reubicado", issues: [] };
    },
    regenerate: async () => { zoneRegenerations++; return { mimeType: "image/png", base64: "ZGVm" }; },
  });
  assert.equal(zoneRegenerations, 1, "el safe_zones fallido sin issue debe reintentar igual");
  assert.equal(zoned.storyReview?.retryCount, 1);
  console.log("OK · revisión, límite de reintentos y conservación de originales");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
