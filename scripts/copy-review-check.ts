import assert from "node:assert/strict";
import { reviewCampaignCopy } from "../src/lib/pipeline/copy-review";
import { demoBundles } from "../src/lib/pipeline/demo-fixtures";
import type { FeedVariant } from "../src/lib/schema/campaign";

async function run() {
  const demo = demoBundles.es;
  const input = { product: "Termo", locale: "es" as const, claims: ["termo"], strategy: { campaignIdea: "Salir con el termo", audience: "Hogares", objective: "Conocer", visualWorld: "Uso cotidiano", carouselRecommended: false, carouselReason: "No aplica" }, feed: demo.feedVariants as [FeedVariant, FeedVariant], story: null, merchantLink: null, legalDisclaimer: null };
  const fallback = await reviewCampaignCopy(input, "meta", async () => { throw new Error("unavailable"); });
  assert.equal(fallback.copyReview.status, "unavailable");
  assert.equal(fallback.feed, input.feed);
  const valid = input.feed.map(() => ({ hook: "Un mate donde estés", body: "Tu termo te acompaña.", cta: "Consultá por el termo", captionInstagram: "Prepará tu próxima salida con el termo a mano. Consultá por el termo.", captionFacebook: "¿Planeando una salida? Consultá por el termo." }));
  const reviewed = await reviewCampaignCopy(input, "meta", async () => ({ summary: "Descripción alineada con cada pieza", feed: valid }));
  assert.equal(reviewed.copyReview.status, "reviewed");
  assert.equal(reviewed.feed[0].captionInstagram, valid[0].captionInstagram);
  assert.equal(reviewed.feed[0].artDirection, input.feed[0].artDirection);
  const captionsOnly = await reviewCampaignCopy({ ...input, captionsOnly: true }, "meta", async () => ({ summary: "OK", feed: valid }));
  assert.equal(captionsOnly.feed[0].hook, input.feed[0].hook, "el texto horneado no cambia al corregir la descripción");
  assert.equal(captionsOnly.feed[0].captionInstagram, valid[0].captionInstagram);
  const invalid = await reviewCampaignCopy(input, "meta", async () => ({ summary: "OK", feed: [{ ...valid[0], hook: "X".repeat(41) }, valid[1]] }));
  assert.equal(invalid.copyReview.status, "unavailable");
  assert.equal(invalid.feed, input.feed);
  const invented = await reviewCampaignCopy(input, "meta", async () => ({ summary: "OK", feed: [{ ...valid[0], hook: "Dura 48 horas" }, valid[1]] }));
  assert.equal(invented.copyReview.status, "unavailable");
  const consult = await reviewCampaignCopy(input, "meta", async () => ({ summary: "OK", feed: [{ ...valid[0], cta: "Consultá dónde comprar" }, valid[1]] }));
  assert.equal(consult.copyReview.status, "reviewed");
  const askDetails = await reviewCampaignCopy(input, "meta", async () => ({ summary: "OK", feed: [{ ...valid[0], cta: "Pedí detalles del termo" }, valid[1]] }));
  assert.equal(askDetails.copyReview.status, "reviewed");
  const purchase = await reviewCampaignCopy(input, "meta", async () => ({ summary: "OK", feed: [{ ...valid[0], cta: "Comprá ahora" }, valid[1]] }));
  assert.equal(purchase.copyReview.status, "unavailable");
  let tries = 0;
  const weak = await reviewCampaignCopy(input, "meta", async () => { tries++; return { summary: "OK", feed: [{ ...valid[0], cta: "Conocé más" }, valid[1]] }; });
  assert.equal(tries, 2, "el copy débil recibe un intento de reparación");
  assert.equal(weak.copyReview.status, "needs_review", "un CTA genérico no se marca como corregido");
  const screenshotCopy = await reviewCampaignCopy(input, "meta", async () => ({ summary: "OK", feed: [{ ...valid[0], hook: "Mirá las cinco frente a frente", body: "Cajas, frascos y tubo para ver nombres visibles", cta: "Consultá dónde informarte" }, valid[1]] }));
  assert.equal(screenshotCopy.copyReview.status, "needs_review", "las descripciones de una distribución y CTA vagos deben señalarse");
  for (const cta of ["Consultá este frente", "Preguntá por este gris"]) {
    const appearance = await reviewCampaignCopy(input, "meta", async () => ({ summary: "OK", feed: [{ ...valid[0], cta }, valid[1]] }));
    assert.equal(appearance.copyReview.status, "needs_review", `el CTA '${cta}' no describe una acción comercial`);
  }
  const critiqued = await reviewCampaignCopy(input, "meta", async () => ({ summary: "OK", feed: valid }), async () => ({ adequate: false, reason: "El texto es genérico para el producto." }));
  assert.equal(critiqued.copyReview.status, "needs_review", "una crítica independiente negativa no se aprueba");
  let critiques = 0;
  const repaired = await reviewCampaignCopy(input, "meta", async () => ({ summary: "OK", feed: valid }), async () => (++critiques === 1 ? { adequate: false, reason: "Demasiado genérico" } : { adequate: true, reason: "Mejor" }));
  assert.equal(critiques, 2, "se vuelve a revisar la corrección editorial una sola vez");
  assert.equal(repaired.copyReview.status, "reviewed");
  const noCritic = await reviewCampaignCopy(input, "meta", async () => ({ summary: "OK", feed: valid }), async () => { throw new Error("sin respuesta"); });
  assert.equal(noCritic.copyReview.status, "needs_review", "la crítica no disponible debe señalarse");
  const legal = await reviewCampaignCopy({ ...input, legalDisclaimer: "Imagen ilustrativa" }, "meta", async () => ({ summary: "OK", feed: valid }));
  assert.ok(legal.feed[0].captionInstagram.includes("Imagen ilustrativa"));
  console.log("OK · revisión editorial y conservación del copy ante fallos");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
