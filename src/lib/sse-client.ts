import type { CampaignResult, Placement, StageEvent } from "@/lib/schema/campaign";

export type SseEvent =
  | { kind: "stage"; payload: StageEvent }
  | { kind: "result"; payload: CampaignResult }
  | { kind: "error"; payload: { message: string } };

export type MerchantInput = { price: string };

/**
 * Sube 1-4 imágenes, consume el stream SSE del route handler y emite eventos
 * tipados. El frontend los reinyecta en el estado del dashboard.
 */
export async function* streamCampaign(
  files: File | File[],
  locale: "es" | "pt" | "en",
  placements: Placement[],
  merchant: MerchantInput = { price: "" },
  opts: { groupMode?: boolean } = {},
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const list = (Array.isArray(files) ? files : [files]).filter(Boolean).slice(0, 4);
  const body = new FormData();
  list.forEach((file, i) => {
    body.append(`image_${i}`, file, file.name);
  });
  // Compat: el backend viejo leía `image`; se sigue enviando la primera.
  if (list[0]) body.append("image", list[0], list[0].name);
  body.append("locale", locale);
  body.append("placements", placements.join(","));
  body.append("productCount", String(list.length));
  body.append("groupMode", opts.groupMode ?? list.length > 1 ? "true" : "false");
  if (merchant.price.trim()) body.append("price", merchant.price.trim().slice(0, 64));

  const response = await fetch("/api/generate-campaign", {
    method: "POST",
    body,
    signal,
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    yield {
      kind: "error",
      payload: { message: json.error ?? `HTTP ${response.status}` },
    };
    return;
  }
  if (!response.body) {
    yield { kind: "error", payload: { message: "El servidor no devolvió stream." } };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseChunk(raw);
        if (parsed) yield parsed;
      }
    }
    // drain tail
    buffer += decoder.decode();
    const tail = parseChunk(buffer);
    if (tail) yield tail;
  } finally {
    reader.cancel().catch(() => {});
  }
}

function parseChunk(chunk: string): SseEvent | null {
  const eventMatch = /^event:\s*(.+)$/m.exec(chunk);
  const dataMatch = /^data:\s*([\s\S]+)$/m.exec(chunk);
  if (!eventMatch || !dataMatch) return null;
  const name = eventMatch[1].trim();
  try {
    const payload = JSON.parse(dataMatch[1]);
    if (name === "stage") return { kind: "stage", payload };
    if (name === "result") return { kind: "result", payload };
    if (name === "error") return { kind: "error", payload };
  } catch {
    return { kind: "error", payload: { message: `Frame SSE inválido: ${chunk.slice(0, 60)}` } };
  }
  return null;
}
