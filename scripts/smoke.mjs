#!/usr/bin/env node
/**
 * Smoke test del pipeline. Requiere que `pnpm dev` esté corriendo en :3000.
 * Sube un PNG fixture, consume el SSE y valida que lleguen los 8 eventos de
 * stage + 1 resultado parseable con piezas por placement. Sale con exit
 * code 1 si algo falla.
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
if (JSON.stringify(result.data.placements) !== JSON.stringify(["feed", "story"])) {
  console.error(`placements por defecto deben ser ["feed","story"], recibí ${JSON.stringify(result.data.placements)}.`);
  process.exit(1);
}
if (result.data.feedVariants.length !== 2) {
  console.error("feedVariants debería tener 2 elementos.");
  process.exit(1);
}
if (!result.data.story?.hook || !result.data.story?.cta) {
  console.error("La story por defecto debe traer hook y cta.");
  process.exit(1);
}
if (!result.data.feedVariants.every((v) => v.captionInstagram && v.captionFacebook)) {
  console.error("Cada dirección de feed debe traer caption de Instagram y Facebook.");
  process.exit(1);
}
if (!result.data.creativeStrategy?.campaignIdea || !result.data.creativeStrategy?.visualWorld) {
  console.error("La campaña debe incluir estrategia y mundo visual.");
  process.exit(1);
}
if (result.data.feedReviews?.length !== 2 || result.data.feedReviews.some((review) => review.status !== "not_generated") || result.data.storyReview?.status !== "not_generated" || result.data.diversityReview.status !== "unavailable") {
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
if (result.data.carouselSlides !== null) {
  console.error("Sin placement carousel, carouselSlides debe ser null.");
  process.exit(1);
}
if (!result.data.artworkDims || result.data.artworkDims.feed.length !== 2) {
  console.error("artworkDims debe traer dims de feed×2 y story.");
  process.exit(1);
}
if (result.data.feedReviews.some((r) => !r.checks.some((c) => c.id === "dimensions" && c.passed))) {
  console.error("Cada review de demo debe traer el check dimensions en verde (Canvas local exacto).");
  process.exit(1);
}
if (result.data.legalDisclaimer !== null) {
  console.error("El producto demo (termo) no debe traer disclaimer legal.");
  process.exit(1);
}
if (!Array.isArray(result.data.allowedClaims) || result.data.allowedClaims.length === 0) {
  console.error("allowedClaims debe traer los hechos del empaque demo.");
  process.exit(1);
}

console.log("OK ·", result.data.skuId, "·", result.data.timings.total, "ms");

for (const placements of ["feed", "feed,story,carousel"]) {
  const request = new FormData();
  request.append("image", new Blob([tinyPng], { type: "image/png" }), "smoke.png");
  request.append("locale", "es");
  request.append("placements", placements);
  const response = await fetch(`${BASE}/api/generate-campaign`, { method: "POST", body: request });
  const frames = parseSse(await response.text());
  const campaign = frames.find((frame) => frame.event === "result")?.data;
  if (!response.ok || !campaign || campaign.placements.join(",") !== placements) throw new Error(`Fallaron los placements ${placements}`);
  if (placements.includes("carousel")) {
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
  } else {
    if (campaign.story !== null || campaign.storyReview !== null) {
      throw new Error("Sin placement story, story y storyReview deben ser null.");
    }
  }
  console.log(`OK · placements ${placements}`);
}

// Merchant opcional: viaja al resultado para el CSV de Meta Catalog.
{
  const request = new FormData();
  request.append("image", new Blob([tinyPng], { type: "image/png" }), "smoke.png");
  request.append("locale", "es");
  request.append("price", "Gs. 35.000");
  request.append("link", "https://wa.me/595981000000");
  const response = await fetch(`${BASE}/api/generate-campaign`, { method: "POST", body: request });
  const frames = parseSse(await response.text());
  const campaign = frames.find((frame) => frame.event === "result")?.data;
  if (!response.ok || !campaign) throw new Error("Falló la corrida con merchant");
  if (campaign.merchant?.price !== "Gs. 35.000" || campaign.merchant?.link !== "https://wa.me/595981000000") {
    throw new Error(`Merchant no volvió en el resultado: ${JSON.stringify(campaign.merchant)}`);
  }
  console.log("OK · merchant price/link");
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
