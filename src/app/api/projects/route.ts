import { z } from "zod";
import { connection } from "next/server";
import { createProject, listProjects } from "@/lib/store/db";

const bodySchema = z.strictObject({ name: z.string().trim().min(1).max(80).default("Proyecto sin título") });

export async function GET() {
  await connection();
  return Response.json({ projects: listProjects() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  await connection();
  const json = (await request.json().catch(() => ({}))) as { name?: unknown };
  const parsed = bodySchema.safeParse({ name: json.name ?? "Proyecto sin título" });
  if (!parsed.success) {
    return Response.json({ error: "Nombre de proyecto inválido." }, { status: 422 });
  }
  const project = createProject(parsed.data.name);
  return Response.json({ project }, { status: 201 });
}
