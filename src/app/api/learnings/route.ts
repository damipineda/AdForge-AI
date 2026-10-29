import { connection } from "next/server";
import { listLearnings, projectExists } from "@/lib/store/db";

/** Historial de aprendizaje (por pieza) de un proyecto. */
export async function GET(request: Request) {
  await connection();
  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
  if (!projectId || !projectExists(projectId)) {
    return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }
  return Response.json({ learnings: listLearnings(projectId) }, { headers: { "Cache-Control": "no-store" } });
}
