import { connection } from "next/server";
import { deleteCampaign, getCampaign, listCampaignAssets, markLearningsExported } from "@/lib/store/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaña no encontrada." }, { status: 404 });
  return Response.json(
    { campaign, assets: listCampaignAssets(id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!getCampaign(id)) return Response.json({ error: "Campaña no encontrada." }, { status: 404 });
  deleteCampaign(id);
  return Response.json({ ok: true });
}

/**
 * Señal humana de éxito: el usuario descargó/exportó un flyer de esta
 * campaña. Marca sus learnings como exportados (peso de aprobación real
 * frente a la auto-evaluación del revisor).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!getCampaign(id)) return Response.json({ error: "Campaña no encontrada." }, { status: 404 });
  return Response.json({ marked: markLearningsExported(id) });
}
