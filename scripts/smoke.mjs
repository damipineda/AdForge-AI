#!/usr/bin/env node
/**
 * Smoke test del pipeline. Requiere que `pnpm dev` esté corriendo en :3000.
 * Sube un PNG fixture, consume el SSE y valida que lleguen los 8 eventos de
 * stage + 1 resultado parseable. Sale con exit code 1 si algo falla.
 */
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

// PNG 1x1 blanco, 68 bytes.
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const form = new FormData();
form.append("image", new Blob([tinyPng], { type: "image/png" }), "smoke.png");
form.append("locale", "es");

const res = await fetch(`${BASE}/api/generate-campaign`, {
  method: "POST",
  body: form,
});
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const text = await res.text();
const events = parseSse(text);
const stages = events.filter((e) => e.event === "stage");
const result = events.find((e) => e.event === "result");
const error = events.find((e) => e.event === "error");

if (error) {
  console.error("Pipeline devolvió error:", error.data);
  process.exit(1);
}
if (stages.length !== 8) {
  console.error(`Esperaba 8 eventos de stage, recibí ${stages.length}.`);
  process.exit(1);
}
if (!result) {
  console.error("No llegó evento `result`.");
  process.exit(1);
}
if (result.data.mode !== "demo") {
  console.error(`mode esperado 'demo', recibí '${result.data.mode}'.`);
  process.exit(1);
}
if (result.data.adVariants.length !== 3) {
  console.error("adVariants debería tener 3 elementos.");
  process.exit(1);
}
if (!result.data.creativeStrategy?.campaignIdea || !result.data.creativeStrategy?.visualWorld) {
  console.error("La campaña debe incluir estrategia y mundo visual.");
  process.exit(1);
}
if (result.data.visualReviews?.length !== 3 || result.data.visualReviews.some((review) => review.status !== "not_generated") || result.data.diversityReview.status !== "unavailable") {
  throw new Error("El modo demo debe identificar la revisión visual como no realizada.");
}
if (!result.data.designData?.dominantColorHex || !result.data.designData?.secondaryColorHex) {
  console.error("designData debe traer dominantColorHex y secondaryColorHex (Motor de Estilos).");
  process.exit(1);
}
if (result.data.imageAssets.length !== 4) {
  console.error("imageAssets debería tener 4 elementos (cutout + 3 studios).");
  process.exit(1);
}

console.log("OK ·", result.data.skuId, "·", result.data.timings.total, "ms");

for (const format of ["story", "carousel"]) {
  const request = new FormData();
  request.append("image", new Blob([tinyPng], { type: "image/png" }), "smoke.png");
  request.append("locale", "es");
  request.append("format", format);
  const response = await fetch(`${BASE}/api/generate-campaign`, { method: "POST", body: request });
  const frames = parseSse(await response.text());
  const campaign = frames.find((frame) => frame.event === "result")?.data;
  if (!response.ok || !campaign || campaign.format !== format) throw new Error(`Falló el formato ${format}`);
  if (format === "carousel") {
    const stages = campaign.carouselSlides?.map((slide) => slide.stage);
    if (JSON.stringify(stages) !== JSON.stringify(["attention", "interest", "desire", "action"])) {
      throw new Error(`Etapas incorrectas del carrusel: ${JSON.stringify(stages)}`);
    }
    if (campaign.carouselImages?.length !== 4 || campaign.carouselErrors?.length !== 4) {
      throw new Error("El carrusel debe devolver estado de imagen por cada lámina.");
    }
    if (campaign.carouselReviews?.length !== 4 || campaign.carouselReviews.some((review) => review.status !== "not_generated")) {
      throw new Error("Las láminas locales de demo no deben figurar como revisadas.");
    }
  } else if (campaign.creativeStrategy.carouselRecommended && campaign.carouselSlides?.length !== 4) {
    throw new Error("El carrusel recomendado debe acompañar a la historia.");
  }
  console.log(`OK · formato ${format}`);
}

function parseSse(raw) {
  const out = [];
  for (const chunk of raw.split("\n\n")) {
    if (!chunk.trim()) continue;
    const ev = /^event:\s*(.+)$/m.exec(chunk)?.[1]?.trim();
    const data = /^data:\s*([\s\S]+)$/m.exec(chunk)?.[1];
    if (ev && data) {
      try {
        out.push({ event: ev, data: JSON.parse(data) });
      } catch {
        /* skip malformed */
      }
    }
  }
  return out;
}
