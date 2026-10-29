import { z } from "zod";
import { connection } from "next/server";
import {
  createAsset,
  createCampaign,
  linkAssetsToCampaign,
  listCampaignAssets,
  projectExists,
} from "@/lib/store/db";
import { saveDataUrl } from "@/lib/store/files";

const flyerSchema = z.strictObject({
  slot: z.string().trim().min(1).max(40),
  type: z.enum(["feed", "story", "carousel"]),
  dataUrl: z.string().min(1),
  filename: z.string().trim().min(1).max(120).default("flyer.png"),
});

const bodySchema = z.strictObject({
  projectId: z.string().trim().min(1),
  prompt: z.string().trim().max(500).default(""),
  status: z.enum(["done", "error"]).default("done"),
  /** CampaignResult serializado; los data URLs se reescriben a /api/files. */
  resultJson: z.string().min(1).nullable().default(null),
  /** Ids de Asset fuente (type=source) a enlazar con la campaña. */
  sourceAssetIds: z.array(z.string()).max(8).default([]),
  flyers: z.array(flyerSchema).max(8).default([]),
});

/**
 * Persiste una campaña generada: guarda los flyers (data URL → archivo),
 * enlaza las fuentes y reescribe el resultJson con URLs estables para que
 * recargar la página restaure la campaña sin base64 en la DB.
 */
export async function POST(request: Request) {
  await connection();
  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Payload de campaña inválido." }, { status: 422 });
  }
  const { projectId, prompt, status, sourceAssetIds, flyers } = parsed.data;
  if (!projectExists(projectId)) {
    return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }

  let resultJson = parsed.data.resultJson;
  let result: Record<string, unknown> | null = null;
  if (resultJson) {
    try {
      result = JSON.parse(resultJson) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "resultJson no es JSON válido." }, { status: 422 });
    }
  }

  const campaign = createCampaign({ projectId, prompt, status, resultJson: null });

  // 1) Flyers generados → archivos + filas Asset.
  const rewritten: Record<string, string> = {};
  for (const flyer of flyers) {
    const url = saveDataUrl(campaign.id, flyer.filename, flyer.dataUrl);
    if (!url) continue;
    rewritten[flyer.slot] = url;
    createAsset({
      campaignId: campaign.id,
      projectId,
      type: flyer.type,
      url,
      metadataJson: JSON.stringify({ slot: flyer.slot, filename: flyer.filename }),
    });
  }

  // 2) Reescribe los data URLs del resultado con las URLs persistidas.
  if (result && Object.keys(rewritten).length > 0) {
    if (Array.isArray(result.feedImages)) {
      result.feedImages = (result.feedImages as Array<string | null>).map((img, i) =>
        typeof img === "string" && img.startsWith("data:") ? (rewritten[`feed-${i}`] ?? img) : img,
      );
    }
    if (typeof result.storyImage === "string" && result.storyImage.startsWith("data:")) {
      result.storyImage = rewritten["story"] ?? result.storyImage;
    }
    if (Array.isArray(result.carouselImages)) {
      result.carouselImages = (result.carouselImages as Array<string | null>).map((img, i) =>
        typeof img === "string" && img.startsWith("data:") ? (rewritten[`carousel-${i}`] ?? img) : img,
      );
    }
    resultJson = JSON.stringify(result);
  }

  // 3) Enlaza las fuentes subidas al proyecto con esta campaña.
  linkAssetsToCampaign(projectId, sourceAssetIds, campaign.id);

  // 4) Guarda el resultJson final en la fila (update vía delete+insert no; update directo).
  const { getDb } = await import("@/lib/store/db");
  getDb().prepare("UPDATE Campaign SET resultJson = ? WHERE id = ?").run(resultJson, campaign.id);

  // 5) Aprendizaje: extrae un registro por pieza y promueve patrones a
  // reglas del skill cuando superan el umbral (no bloquea la respuesta).
  let learned: { learnings: number; promoted: Array<{ id: string }> } = { learnings: 0, promoted: [] };
  if (result && status === "done") {
    try {
      const { learnFromCampaign } = await import("@/lib/store/learning");
      const { campaignResultSchema } = await import("@/lib/schema/campaign");
      const parsedResult = campaignResultSchema.safeParse(result);
      if (parsedResult.success) {
        learned = learnFromCampaign(parsedResult.data, { campaignId: campaign.id, projectId });
      }
    } catch (err) {
      console.warn("[learnings] No se pudo registrar el aprendizaje:", err instanceof Error ? err.message : err);
    }
  }

  const assets = listCampaignAssets(campaign.id);
  return Response.json({ campaign: { ...campaign, resultJson }, assets, learned }, { status: 201 });
}
