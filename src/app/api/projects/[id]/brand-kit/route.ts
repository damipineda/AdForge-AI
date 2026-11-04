import { z } from "zod";
import { connection } from "next/server";
import { getAsset, getBrandKit, listAssets, projectExists, upsertBrandKit } from "@/lib/store/db";

const HEX = /^#[0-9a-fA-F]{6}$/;

const bodySchema = z.strictObject({
  name: z.string().trim().max(80).default(""),
  primaryColor: z.string().trim().regex(HEX, "color inválido").default("#8D7B6A"),
  secondaryColor: z.string().trim().regex(HEX, "color inválido").default("#2A2421"),
  accentColor: z.string().trim().regex(HEX, "color inválido").default("#8D7B6A"),
  logoAssetId: z.string().trim().min(1).nullable().default(null),
  logoPosition: z.enum(["auto", "left", "right"]).default("auto"),
});

/** Kit de marca del proyecto + su logo. Sin kit, el agente diseña libremente. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!projectExists(id)) return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  const kit = getBrandKit(id);
  const logo = kit?.logoAssetId
    ? listAssets(id).find((a) => a.id === kit.logoAssetId && a.type === "logo") ?? null
    : null;
  return Response.json({ kit, logo }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!projectExists(id)) return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Kit de marca inválido (colores #RRGGBB)." }, { status: 422 });
  }
  if (parsed.data.logoAssetId) {
    const asset = getAsset(parsed.data.logoAssetId);
    if (!asset || asset.projectId !== id) {
      return Response.json({ error: "Logo no válido para este proyecto." }, { status: 422 });
    }
  }
  const kit = upsertBrandKit({ projectId: id, ...parsed.data });
  return Response.json({ kit });
}
