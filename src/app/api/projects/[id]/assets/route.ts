import { connection } from "next/server";
import { createAsset, listAssets, projectExists } from "@/lib/store/db";
import { saveBuffer } from "@/lib/store/files";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Biblioteca de fuentes del proyecto: fotos subidas aún sin campaña. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!projectExists(id)) return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  return Response.json({ assets: listAssets(id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!projectExists(id)) return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "El body debe ser multipart/form-data." }, { status: 400 });

  const saved = [];
  for (const entry of form.getAll("file")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (!ALLOWED_MIME.has(entry.type)) {
      return Response.json({ error: `MIME no soportado: ${entry.type}.` }, { status: 415 });
    }
    if (entry.size > MAX_BYTES) {
      return Response.json({ error: "Una imagen excede 8 MB." }, { status: 413 });
    }
    const bytes = Buffer.from(await entry.arrayBuffer());
    const url = saveBuffer(id, entry.name, entry.type, bytes);
    // campaignId null: se enlaza a la campaña real al guardarla (linkAssets).
    const asset = createAsset({
      campaignId: null,
      projectId: id,
      type: "source",
      url,
      metadataJson: JSON.stringify({ filename: entry.name, mime: entry.type, bytes: entry.size }),
    });
    saved.push(asset);
  }
  if (saved.length === 0) return Response.json({ error: "Sin archivos válidos." }, { status: 400 });
  return Response.json({ assets: saved }, { status: 201 });
}
