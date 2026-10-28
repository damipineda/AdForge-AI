import { NextRequest } from "next/server";
import { z } from "zod";
import { getProvider, runPipeline } from "@/lib/pipeline";
import {
  localeSchema,
  campaignFormatSchema,
  type StageEvent,
} from "@/lib/schema/campaign";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const payloadSchema = z.strictObject({
  locale: localeSchema,
  format: campaignFormatSchema.default("post"),
});

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return errorResponse(400, "El body debe ser multipart/form-data.");
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return errorResponse(400, "Falta el campo `image`.");
  }
  if (!ALLOWED_MIME.has(image.type)) {
    return errorResponse(415, `MIME no soportado: ${image.type}. Usa jpeg, png o webp.`);
  }
  if (image.size === 0) {
    return errorResponse(400, "La imagen está vacía.");
  }
  if (image.size > MAX_BYTES) {
    return errorResponse(413, `La imagen excede ${MAX_BYTES / 1024 / 1024} MB.`);
  }

  const parsed = payloadSchema.safeParse({ locale: form.get("locale"), format: form.get("format") ?? undefined });
  if (!parsed.success) {
    return errorResponse(422, "Mercado o formato no válido.");
  }

  const bytes = await image.arrayBuffer();

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
            image: { bytes, mimeType: image.type, filename: image.name },
            locale: parsed.data.locale,
            format: parsed.data.format,
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
      stages: ["sam", "museSpark", "museImage", "review"],
      transport: "SSE (event: stage | result | error)",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function errorResponse(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
