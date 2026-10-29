import { z } from "zod";
import { connection } from "next/server";
import { deleteProject, projectExists, renameProject } from "@/lib/store/db";

const bodySchema = z.strictObject({ name: z.string().trim().min(1).max(80) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!projectExists(id)) return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  const json = (await request.json().catch(() => ({}))) as { name?: unknown };
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Nombre inválido." }, { status: 422 });
  }
  renameProject(id, parsed.data.name);
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!projectExists(id)) return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  deleteProject(id);
  return Response.json({ ok: true });
}
