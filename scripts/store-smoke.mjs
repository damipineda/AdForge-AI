// Smoke test del ciclo de persistencia AdForge AI (corre con `node scripts/store-smoke.mjs`).
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3100";

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

// PNG mínimo de 1x1.
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const { project } = await api("/api/projects", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Smoke test" }),
});
console.log("project:", project.id, project.name);

const form = new FormData();
form.append("file", new Blob([tinyPng], { type: "image/png" }), "fuente.png");
const { assets: uploaded } = await api(`/api/projects/${project.id}/assets`, { method: "POST", body: form });
console.log("source asset:", uploaded[0].id, uploaded[0].url, uploaded[0].type);

const fakeResult = {
  skuId: "AFG-SMOKE",
  listing: { standardizedTitle: "Campaña smoke" },
  feedImages: [`data:image/png;base64,${tinyPng.toString("base64")}`, null],
  storyImage: null,
  carouselImages: null,
  timings: { total: 1 },
  productCount: 1,
};
const { campaign, assets } = await api("/api/campaigns", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId: project.id,
    prompt: "Campaña smoke · feed+story · es",
    status: "done",
    resultJson: JSON.stringify(fakeResult),
    sourceAssetIds: [uploaded[0].id],
    flyers: [{ slot: "feed-0", type: "feed", dataUrl: fakeResult.feedImages[0], filename: "AFG-SMOKE-feed-V1.png" }],
  }),
});
console.log("campaign:", campaign.id, "| assets:", assets.map((a) => `${a.type}:${a.url}`).join(", "));
if (campaign.resultJson.includes("data:")) throw new Error("resultJson aún contiene data URLs");

const full = await api(`/api/campaigns/${campaign.id}`);
console.log("restore ok:", full.campaign.id === campaign.id, "| linked assets:", full.assets.length);

const flyerUrl = assets.find((a) => a.type === "feed").url;
const fileRes = await fetch(`${BASE}${flyerUrl}`);
if (!fileRes.ok || !fileRes.headers.get("content-type")?.startsWith("image/")) {
  throw new Error(`archivo no servido: HTTP ${fileRes.status}`);
}
console.log("file serve ok:", fileRes.headers.get("content-type"), (await fileRes.arrayBuffer()).byteLength, "bytes");

const { campaigns } = await api(`/api/projects/${project.id}/campaigns`);
console.log("sessions:", campaigns.length, campaigns[0].prompt);

// Aprendizaje: 3 campañas de un auto con safe_zones fallando en story.
// Con el umbral (3) debe emerger una regla activa del skill de vehículos.
function learningResult() {
  const review = (failed) => ({
    status: failed ? "needs_review" : "reviewed",
    summary: "Revisión smoke del skill.",
    issues: [],
    retryCount: failed ? 1 : 0,
    checks: [
      { id: "dimensions", passed: true, detail: "1080x1350 4:5" },
      { id: "safe_zones", passed: !failed, detail: failed ? "CTA dentro del 22% inferior" : "Zonas libres" },
      { id: "fidelity", passed: true, detail: "Envase fiel" },
      { id: "coherence", passed: true, detail: "Escena coherente" },
    ],
    retryReason: failed ? "El CTA cae en la barra de respuesta; la superficie se repite" : null,
  });
  const variant = (i) => ({
    concept: `Concepto smoke ${i}`,
    artDirection: "SUPERFICIE: calle urbana de asfalto; LUZ: natural de día lateral; encuadre frontal del auto.",
    styleArchetype: "editorial-poster",
    hook: "De frente, pensá en ciudad",
    body: "Un compacto para moverte todos los días.",
    cta: "Consultá por este modelo",
    imageUrl: "canvas://studio-1",
    featurePills: [],
    captionInstagram: "El día a día pide un compacto. Consultá por este modelo #kia #ciudad",
    captionFacebook: "¿Buscás un compacto para todos los días? Consultá por este modelo",
  });
  return {
    mode: "demo",
    model: null,
    skuId: "AFG-SMOKE",
    locale: "es",
    placements: ["feed", "story"],
    creativeStrategy: {
      campaignIdea: "Kia urbano de frente",
      audience: "Conductores urbanos",
      objective: "Conocer el modelo",
      visualWorld: "Calle urbana de día",
      carouselRecommended: false,
      carouselReason: "Piezas bastan",
    },
    planReview: { status: "reviewed", summary: "Plan smoke." },
    reviewRequired: true,
    listing: {
      sku: "SMOKE",
      standardizedTitle: "Kia auto compacto gris",
      shortPitch: "Compacto gris para la ciudad.",
      bulletFeatures: ["Color gris metalizado"],
      categoryPath: "Vehículos",
      seoMetadata: { metaTitle: "Kia compacto", metaDescription: "Compacto urbano", keywords: ["kia", "auto"] },
      missingInformation: [],
    },
    feedVariants: [variant(1), variant(2)],
    story: {
      concept: "Story smoke",
      artDirection: "SUPERFICIE: calle urbana de asfalto; LUZ: natural de día lateral; titular arriba y CTA abajo.",
      hook: "De frente Kia urbano",
      cta: "Consultá por este modelo",
    },
    audiences: [{ name: "Urbanos", interests: ["autos"], ageMin: 18, ageMax: 65, geo: [] }],
    imageAssets: [
      { slot: "original", url: "x", sourceModel: "smoke" },
      { slot: "cutout", url: "x", sourceModel: "smoke" },
    ],
    segmentation: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    flyerTexts: { headline: "Kia de frente", subheadline: "Compacto urbano", bullets: ["Gris", "Compacto", "Urbano"] },
    studioScenes: [0, 1, 2].map((i) => ({
      name: `Escena smoke ${i}`,
      background: ["#111111", "#222222"],
      accent: "#ffffff",
      textColor: "#ffffff",
      lighting: "soft-window",
      shadow: "soft",
      badge: "DESTACADO",
      vibe: "Smoke",
    })),
    designData: null,
    feedImages: [null, null],
    feedErrors: [null, null],
    storyImage: null,
    storyError: null,
    feedReviews: [review(false), review(false)],
    storyReview: review(true),
    artworkDims: { feed: [null, null], story: null },
    merchant: { price: null, link: null },
    legalDisclaimer: null,
    allowedClaims: [],
    carouselReviews: null,
    diversityReview: review(false),
    timings: { sam: 1, museImage: 1, museSpark: 1, review: 1, total: 4 },
    stageEvents: [
      { stage: "sam", status: "done", ms: 1 },
      { stage: "museSpark", status: "done", ms: 1 },
      { stage: "review", status: "done", ms: 1 },
    ],
  };
}

const learningIds = [];
for (let i = 0; i < 3; i++) {
  const saved = await api("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.id,
      prompt: `Campaña aprendizaje ${i + 1}`,
      status: "done",
      resultJson: JSON.stringify(learningResult()),
      sourceAssetIds: [],
      flyers: [],
    }),
  });
  learningIds.push(saved.campaign.id);
  console.log(`learning campaign ${i + 1}:`, saved.learned.learnings, "piezas registradas");
}
if (learningIds.length !== 3) throw new Error("No se guardaron las 3 campañas de aprendizaje");

const { learnings } = await api(`/api/learnings?projectId=${project.id}`);
console.log("learnings totales:", learnings.length);
if (learnings.length < 9) throw new Error(`Esperaba >=9 learnings, hay ${learnings.length}`);
if (!learnings.some((l) => l.category === "vehiculos" && l.surface?.includes("asfalto"))) {
  throw new Error("Falta el learning de vehículos con superficie parseada");
}

const { rules } = await api("/api/skills?category=vehiculos");
const active = rules.filter((r) => r.status === "active");
console.log("skill vehiculos:", active.map((r) => `×${r.evidenceCount} ${r.rule.slice(0, 60)}…`).join(" | "));
if (!active.some((r) => r.evidenceCount >= 3 && r.rule.includes("story"))) {
  throw new Error("El umbral no promovió la regla de safe_zones en story");
}

const exported = await api(`/api/skills/export?category=vehiculos`);
if (!exported.markdown.includes("# Skill") || !exported.markdown.includes("story")) {
  throw new Error("El SKILL.md exportado no trae la regla");
}
console.log("skill export ok:", exported.filename);

const logged = await api(`/api/campaigns/${learningIds[0]}`, { method: "POST" });
if (logged.marked < 1) throw new Error("La señal de descarga no marcó learnings");
console.log("export signal ok:", logged.marked, "learnings marcados");

for (const id of learningIds) await api(`/api/campaigns/${id}`, { method: "DELETE" });
await api(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
await api(`/api/projects/${project.id}`, { method: "DELETE" });
const { projects } = await api("/api/projects");
console.log("cleanup ok, projects left:", projects.filter((p) => p.id === project.id).length);
console.log("SMOKE PASS");
