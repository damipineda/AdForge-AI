import { connection } from "next/server";
import { listCampaigns, projectExists } from "@/lib/store/db";

/** Sesiones/chats del proyecto (sin el resultJson pesado; se pide por id). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!projectExists(id)) return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  const campaigns = listCampaigns(id).map((row) => ({
    id: row.id,
    projectId: row.projectId,
    prompt: row.prompt,
    status: row.status,
    createdAt: row.createdAt,
  }));
  return Response.json({ campaigns }, { headers: { "Cache-Control": "no-store" } });
}
