import { connection } from "next/server";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { campaignResultSchema } from "@/lib/schema/campaign";
import { getCampaign, listCampaignAssets, getDb, createAsset } from "@/lib/store/db";
import { contentTypeFor, resolveStoredFile, saveBuffer } from "@/lib/store/files";
import { getProvider } from "@/lib/pipeline/provider";
import { refinePiece, refinementRequest } from "@/lib/pipeline/refine-piece";
import type { ImageInput } from "@/lib/pipeline/image";

export const maxDuration = 300;
const inFlight = new Set<string>();

async function localImage(url: string): Promise<ImageInput> {
  const data = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (data) {
    if (data[2].length > 32_000_000) throw new Error("La imagen excede el tamaño admitido.");
    return { mimeType: data[1], base64: data[2] };
  }
  if (!url.startsWith("/api/files/")) throw new Error("La referencia no es una imagen guardada del proyecto.");
  const filename = resolveStoredFile(url.slice("/api/files/".length).split("/"));
  if (!filename) throw new Error("La ruta de referencia no es válida.");
  const bytes = await readFile(filename);
  if (bytes.length > 24_000_000) throw new Error("La imagen excede el tamaño admitido.");
  return { mimeType: contentTypeFor(filename), base64: bytes.toString("base64") };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const parsed = refinementRequest.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return Response.json({ error: "Indicá una pieza y una instrucción de entre 3 y 800 caracteres." }, { status: 400 });
  const campaign = getCampaign(id);
  if (!campaign?.resultJson) return Response.json({ error: "Campaña no encontrada." }, { status: 404 });
  let raw: unknown;
  try { raw = JSON.parse(campaign.resultJson); } catch { return Response.json({ error: "La campaña guardada es inválida." }, { status: 422 }); }
  const saved = campaignResultSchema.safeParse(raw);
  if (!saved.success) return Response.json({ error: "La campaña guardada no se puede refinar." }, { status: 422 });
  if (getProvider() !== "meta") return Response.json({ error: "El refinamiento requiere Muse Image y Muse Spark configurados. El modo demo no genera ediciones con IA." }, { status: 503 });
  const { placement, instruction, mode } = parsed.data;
  if (placement === "story" && !saved.data.story) return Response.json({ error: "La campaña no contiene Story." }, { status: 400 });
  const key = `${id}:${placement}`;
  if (inFlight.has(key)) return Response.json({ error: "Esta pieza ya se está refinando. Esperá a que termine." }, { status: 409 });
  inFlight.add(key);
  const story = placement === "story", index = placement === "feed-1" ? 1 : 0;
  const beforeUrl = story ? saved.data.storyImage : saved.data.feedImages[index];
  try {
    const sources = listCampaignAssets(id).filter(a=>a.type === "source").slice(0,4);
    const [photos, artwork] = await Promise.all([Promise.all(sources.map(a=>localImage(a.url))), beforeUrl ? localImage(beforeUrl) : Promise.resolve(null)]);
    // Fallback sin fotos vinculadas: la pieza ya generada actúa como
    // referencia del producto y del diseño actual para no bloquear nunca la
    // corrección ni la regeneración cuando las fotos quedaron en un intento previo.
    const photoSources = photos.length ? photos : artwork ? [artwork] : [];
    if (!photoSources.length) return Response.json({ error: "No hay imagen de referencia disponible para corregir esta pieza." }, { status: 422 });
    const refined = await refinePiece(saved.data, placement, instruction, photoSources, artwork, undefined, mode);
    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    let transactionOpen = true;
    try {
      // Merge into the current row so concurrent edits of other pieces are never lost.
      const fresh = getCampaign(id);
      if (!fresh?.resultJson) { db.exec("ROLLBACK"); return Response.json({ error: "La campaña ya no existe." }, { status: 404 }); }
      const next = campaignResultSchema.parse(JSON.parse(fresh.resultJson));
      const currentUrl = story ? next.storyImage : next.feedImages[index];
      if (currentUrl !== beforeUrl) { db.exec("ROLLBACK"); return Response.json({ error: "Esta pieza cambió durante el refinamiento. Recargá la campaña y reintentá." }, { status: 409 }); }
      const revisionId = randomUUID();
      const url = saveBuffer(id, `${next.skuId}-${placement}-${revisionId}`, refined.image.mimeType, Buffer.from(refined.image.base64,"base64"));
      const review = { ...refined.review, summary: `${mode === "regenerate" ? "Nueva composición" : "Refinamiento"} Muse Image. ${refined.review.summary}`.slice(0,350) };
      if (story && next.story) {
        next.story = { concept: refined.plan.concept, artDirection: refined.plan.artDirection, hook: refined.plan.hook, cta: refined.plan.cta };
        next.storyImage = url; next.storyError = null; next.storyReview = review; next.artworkDims.story = refined.dims;
      } else {
        next.feedVariants[index] = { ...next.feedVariants[index], ...refined.plan };
        delete next.feedVariants[index].layoutLayers;
        next.feedImages[index] = url; next.feedErrors[index] = null; next.feedReviews[index] = review; next.artworkDims.feed[index] = refined.dims;
      }
      next.copyReview = { status: "needs_review", summary: "Se refinó una pieza y su copy. Revisá el resultado final antes de publicar." };
      next.diversityReview = { status: "unavailable", summary: "La comparación anterior pertenece al conjunto previo al refinamiento.", issues: [], checks: [], retryCount: 0, retryReason: null };
      next.refinements = [...next.refinements.slice(-49), { id: revisionId, placement, instruction: refined.instruction, at: Date.now(), beforeUrl, afterUrl: url, review, mode, draft: Boolean(refined.notice) }];
      createAsset({ campaignId: id, projectId: campaign.projectId, type: story ? "story" : "feed", url, metadataJson: JSON.stringify({ slot: placement, revisionId, filename: `${next.skuId}-${placement}.png`, model: "Muse Image", instruction: refined.instruction, mode, draft: Boolean(refined.notice) }) });
      const result = campaignResultSchema.parse(next);
      db.prepare("UPDATE Campaign SET resultJson = ? WHERE id = ?").run(JSON.stringify(result),id);
      db.exec("COMMIT"); transactionOpen = false;
      return Response.json({ result, assets: listCampaignAssets(id), ...(refined.notice ? { notice: refined.notice } : {}) });
    } catch (error) { if (transactionOpen) db.exec("ROLLBACK"); throw error; }
  } catch (error) {
    const message = error instanceof Error && /^(La |No se pudo completar la auditoría|Muse no entregó|Faltan)/.test(error.message) ? error.message : "No se pudo completar el refinamiento con Muse. Se conserva la pieza anterior.";
    return Response.json({ error: message }, { status: 422 });
  } finally { inFlight.delete(key); }
}
