import { NextRequest } from "next/server";
import { z } from "zod";
import { getProvider, runPipeline } from "@/lib/pipeline";
import {
  localeSchema,
  placementSchema,
  type Placement,
  type StageEvent,
} from "@/lib/schema/campaign";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 4;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const payloadSchema = z.strictObject({
  locale: localeSchema,
  /** "feed,story" por defecto; el feed siempre se genera. */
  placements: z.string().trim().min(1).max(40).default("feed,story"),
  /** Precio opcional para el catálogo (texto libre). Sin link: la imagen no lleva URL. */
  price: z.string().trim().max(64).default(""),
  link: z.string().trim().max(500).default(""),
  groupMode: z.enum(["true", "false"]).default("true"),
});

function parsePlacements(raw: string): Placement[] | null {
  const picked = raw.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (picked.length === 0) return null;
  const valid: Placement[] = [];
  for (const p of picked) {
    const parsed = placementSchema.safeParse(p);
    if (!parsed.success) return null;
    if (!valid.includes(parsed.data)) valid.push(parsed.data);
  }
  if (!valid.includes("feed")) valid.unshift("feed");
  return valid;
}

function collectImages(form: FormData): File[] {
  const files: File[] = [];
  // Nuevo: image_0..image_3 (multi-producto). Legacy: `image` solo.
  for (let i = 0; i < MAX_FILES; i++) {
    const f = form.get(`image_${i}`);
    if (f instanceof File && f.size > 0) files.push(f);
  }
  if (files.length === 0) {
    const legacy = form.get("image");
    if (legacy instanceof File && legacy.size > 0) files.push(legacy);
  }
  // Compat extra: `images` repetido.
  for (const f of form.getAll("images")) {
    if (f instanceof File && f.size > 0 && files.length < MAX_FILES && !files.includes(f)) {
      files.push(f);
    }
  }
  return files.slice(0, MAX_FILES);
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return errorResponse(400, "El body debe ser multipart/form-data.");
  }

  const files = collectImages(form);
  if (files.length === 0) {
    return errorResponse(400, "Falta al menos una imagen (`image_0` o `image`).");
  }
  for (const image of files) {
    if (!ALLOWED_MIME.has(image.type)) {
      return errorResponse(415, `MIME no soportado: ${image.type}. Usa jpeg, png o webp.`);
    }
    if (image.size === 0) {
      return errorResponse(400, "Una imagen está vacía.");
    }
    if (image.size > MAX_BYTES) {
      return errorResponse(413, `Una imagen excede ${MAX_BYTES / 1024 / 1024} MB.`);
    }
  }

  const parsed = payloadSchema.safeParse({
    locale: form.get("locale"),
    placements: form.get("placements") ?? undefined,
    price: form.get("price") ?? undefined,
    link: form.get("link") ?? undefined,
    groupMode: form.get("groupMode") ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse(422, "Mercado o placements no válidos.");
  }
  const placements = parsePlacements(parsed.data.placements);
  if (!placements) {
    return errorResponse(422, "Placements no válidos: usá feed, story y/o carousel separados por comas.");
  }

  const buffers = await Promise.all(files.map((f) => f.arrayBuffer()));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const onStage = (event: StageEvent) => {
        controller.enqueue(
          encoder.encode(`event: stage\ndata: ${JSON.stringify(event)}\n\n`),
        );
      };
      try {
        const result = await runPipeline(
          {
            images: files.map((f, i) => ({
              bytes: buffers[i],
              mimeType: f.type,
              filename: f.name,
            })),
            locale: parsed.data.locale,
            placements,
            merchant: {
              price: parsed.data.price || null,
              link: parsed.data.link || null,
            },
            groupMode: parsed.data.groupMode === "true",
          },
          { onStage },
        );
        controller.enqueue(
          encoder.encode(`event: result\ndata: ${JSON.stringify(result)}\n\n`),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Pipeline falló.";
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  return Response.json(
    {
      name: "AdForge AI · generate-campaign",
      provider: getProvider(),
      supportedLocales: ["es", "pt", "en"],
      maxUploadMb: MAX_BYTES / 1024 / 1024,
      maxFiles: MAX_FILES,
      stages: ["sam", "museSpark", "museImage", "review"],
      transport: "SSE (event: stage | result | error)",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function errorResponse(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
