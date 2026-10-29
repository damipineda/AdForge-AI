import { readFile } from "node:fs/promises";
import { connection } from "next/server";
import { contentTypeFor, resolveStoredFile } from "@/lib/store/files";

/** Sirve los archivos persistidos de `data/files` (fuentes y flyers). */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  await connection();
  const { path: segments } = await params;
  if (!segments || segments.length === 0 || segments.length > 3) {
    return Response.json({ error: "Ruta inválida." }, { status: 400 });
  }
  const resolved = resolveStoredFile(segments);
  if (!resolved) return Response.json({ error: "Ruta inválida." }, { status: 400 });
  try {
    const bytes = await readFile(resolved);
    const filename = segments[segments.length - 1];
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentTypeFor(filename),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch {
    return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
  }
}
