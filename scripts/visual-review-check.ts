import assert from "node:assert/strict";
import sharp from "sharp";
import { storyImageSize } from "../src/lib/pipeline/meta";
import { visualReviewSchema } from "../src/lib/schema/campaign";
import { reviewCampaign } from "../src/lib/pipeline/visual-review";
import type { MuseImageInput, MuseImageOutput } from "../src/lib/pipeline/muse-image";

const source = { mimeType: "image/png", base64: "YWJj" };
let url = "data:image/png;base64,YWJj";
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
  const fixture = async (width: number, height: number, color: string) => ({ mimeType: "image/png", base64: (await sharp({create:{width,height,channels:3,background:color}}).png().toBuffer()).toString("base64") });
  const feed = await fixture(80,100,"red"), story = await fixture(90,160,"red");
  const feedFix = await fixture(80,100,"blue"), storyFix = await fixture(90,160,"blue");
  const fixedUrl = `data:image/png;base64,${feedFix.base64}`;
  const storyUrl = `data:image/png;base64,${story.base64}`;
  url = `data:image/png;base64,${feed.base64}`;
  image.feed = [url,url]; image.storyImage = storyUrl;
  const replacement = (size: string) => size === storyImageSize() ? storyFix : feedFix;
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
    regenerate: async (_prompt,_photo,size) => { regenerationCalls++; return replacement(size); },
  });
  assert.equal(regenerationCalls, 3, "cada pieza con errores recibe su corrección");
  assert.equal(fixed.feedReviews[0].retryCount, 1);
  assert.equal(fixed.feedReviews[1].retryCount, 1);
  assert.equal(fixed.storyReview?.status, "reviewed");
  assert.equal(fixed.storyReview?.correctionReport?.outcome,"corrected");
  assert.equal(fixed.image.feed[0], fixedUrl);
  assert.notEqual(fixed.image.storyImage, storyUrl);

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
  assert.equal(attempts, 3);
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
    regenerate: async () => { retried++; return feedFix; },
  });
  assert.equal(retried, 1, "solo se corrige la pieza señalada");
  assert.equal(compared, 3, "se compara la candidata y luego la salida final");
  assert.equal(repetitive.image.feed[1], fixedUrl);
  assert.equal(repetitive.image.feed[0], url);
  let editReference: unknown;
  let checks = 0;
  const edited = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => {
      if (prompt.includes("MISMA campaña")) return { summary: "Variadas", issues: [] };
      checks++;
      return checks === 1 ? { summary: "Texto ilegible", issues: [{ ...issue, category: "typography", severity: "critical" }] } : { summary: "Corregido", issues: [] };
    },
    regenerate: async (_prompt, _photo, _size, reference) => { editReference = reference; return feedFix; },
  });
  assert.equal((editReference as { base64: string }).base64, feed.base64, "la edición usa el arte anterior como referencia");
  assert.equal(edited.image.feed[0], fixedUrl);
  let persistentCalls = 0;
  const persistent = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => {
      if (prompt.includes("MISMA campaña")) return { summary: "Variadas", issues: [] };
      persistentCalls++;
      return persistentCalls === 1 || prompt.includes("Verificá específicamente")
        ? { summary: "Texto ilegible", issues: [{ ...issue, category: "typography", severity: "critical" }] }
        : { summary: "Sin errores", issues: [] };
    },
    regenerate: async () => feedFix,
  });
  assert.equal(persistent.image.feed[0], url, "se conserva el original si la revisión detecta el mismo problema");
  let captionEdits = 0;
  const captionIssue = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => prompt.includes("MISMA campaña") ? { summary: "Variadas", issues: [] } : { summary: "Descripción genérica", issues: [{ ...issue, category: "copy", severity: "warning", description: "DESCRIPCIÓN: no acompaña la pieza" }] },
    regenerate: async () => { captionEdits++; return feedFix; },
  });
  assert.equal(captionEdits, 0, "un problema de descripción externa no debe editar el arte");
  assert.equal(captionIssue.feedReviews[0].status, "needs_review");
  let privacyReference: unknown;
  const privateIssue = { ...issue, category: "privacy", description: "La matrícula se ve legible", suggestion: "Cubrir los caracteres" };
  const privateResult = await reviewCampaign(input, image, "meta", {
    inspect: async (prompt) => prompt.includes("MISMA campaña") ? { summary: "Variadas", issues: [] } : { summary: "Datos visibles", issues: [privateIssue] },
    regenerate: async (_prompt, _photo, _size, reference) => { privacyReference = reference; return feedFix; },
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
        ? { summary: "CTA bajo", issues: [], checks: [{ id: "safe_zones", passed: false, detail: "CTA dentro del 13% inferior" }] }
        : { summary: "CTA reubicado", issues: [] };
    },
    regenerate: async () => { zoneRegenerations++; return storyFix; },
  });
  assert.equal(zoneRegenerations, 1, "el safe_zones fallido sin issue debe reintentar igual");
  assert.equal(zoned.storyReview?.retryCount, 1);
  assert.deepEqual(zoned.image.feed,image.feed,"corregir la story no debe modificar los feeds");
  let minorEdits = 0;
  await reviewCampaign(input,image,"meta",{
    inspect:async(prompt)=>prompt.includes("MISMA campaña") ? {summary:"Variadas",issues:[]} : {summary:"Observación menor",issues:[{...issue,severity:"warning"}]},
    regenerate:async()=>{minorEdits++;return feedFix;},
  });
  assert.equal(minorEdits,0,"las advertencias menores se informan sin regenerar imágenes");
  let activeCorrections = 0, maxConcurrent = 0, changedPieces = 0;
  const progress: string[] = [];
  await reviewCampaign(input,image,"meta",{
    inspect:async(prompt)=>({summary:"Revisión",issues:prompt.includes("MISMA campaña") || prompt.includes("pieza corregida") ? [] : [issue]}),
    regenerate:async(_prompt,_photo,size)=>{
      changedPieces++; activeCorrections++; maxConcurrent=Math.max(maxConcurrent,activeCorrections);
      await new Promise(resolve=>setTimeout(resolve,5));
      activeCorrections--; return replacement(size);
    },
  },{onProgress:detail=>progress.push(detail)});
  assert.equal(changedPieces,3);
  assert.equal(maxConcurrent,2,"dos correcciones simultáneas como máximo; no una cola secuencial");
  assert.ok(progress.some(detail=>detail.includes("story vertical") && detail.includes("verificando")));
  let expiredEdits = 0;
  const expired = await reviewCampaign(input,image,"meta",{
    inspect:async(_prompt,_images,signal)=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>resolve({summary:"Revisión tardía",issues:[issue]}),200);
      signal?.addEventListener("abort",()=>{clearTimeout(timer);reject(new Error("Presupuesto agotado"));},{once:true});
    }),
    regenerate:async()=>{expiredEdits++;return feedFix;},
  },{budgetMs:15});
  assert.equal(expiredEdits,0,"al expirar el presupuesto no arranca ninguna corrección");
  assert.equal(expired.feedReviews[0].status,"unavailable");
  assert.deepEqual(expired.image.feed,image.feed);
  let correctionAttempts = 0;
  const recovered = await reviewCampaign(input, image, "meta", {
    inspect: async(prompt) => {
      if (prompt.includes("MISMA campaña")) return {summary:"Variadas",issues:[]};
      if (!prompt.includes("story vertical")) return {summary:"Feed correcto",issues:[]};
      const passed = correctionAttempts === 2;
      return {summary:passed ? "CTA y etiqueta corregidos" : "CTA fuera de zona y etiqueta ilegible",issues:[],checks:[
        {id:"safe_zones",passed,detail:passed ? "CTA dentro de zona segura" : "CTA demasiado bajo"},
        {id:"fidelity",passed,detail:passed ? "Etiqueta fiel" : "Etiqueta ilegible"},
      ]};
    },
    regenerate: async(prompt) => {
      correctionAttempts++;
      assert.ok(prompt.includes("Restaurar envase") && prompt.includes("Reubicar titular"));
      return storyFix;
    },
  });
  assert.equal(correctionAttempts,2,"un candidato con checks fallidos no puede aceptarse aunque no reporte issues");
  assert.equal(recovered.storyReview?.retryCount,2);
  assert.equal(recovered.storyReview?.correctionReport?.outcome,"corrected");
  assert.equal(recovered.storyReview?.correctionReport?.verified.length,2);
  assert.equal(recovered.storyReview?.correctionReport?.pending.length,0);
  assert.ok(visualReviewSchema.safeParse(recovered.storyReview).success,"el informe y los dos intentos pueden persistirse");
  let persistentAttempts = 0;
  const unresolved = await reviewCampaign(input, image, "meta", {
    inspect: async(prompt) => prompt.includes("MISMA campaña") || !prompt.includes("story vertical")
      ? {summary:"Correcto",issues:[]}
      : {summary:"Sigue fallando",issues:[],checks:[{id:"fidelity",passed:false,detail:"Etiqueta alterada"}]},
    regenerate: async()=>{persistentAttempts++;return storyFix;},
  });
  assert.equal(persistentAttempts,2);
  assert.equal(unresolved.image.storyImage,storyUrl);
  assert.equal(unresolved.storyReview?.correctionReport?.outcome,"unresolved");
  assert.deepEqual(unresolved.storyReview?.correctionReport?.verified,[],"nunca afirmar que se corrigió el borrador que se conserva");
  assert.ok(unresolved.storyReview?.correctionReport?.pending.length);
  console.log("OK · revisión, límite de reintentos y conservación de originales");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
