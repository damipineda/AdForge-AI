/**
 * Adaptador del Meta Model API (hackathon Cerebral Valley). Los nombres de
 * campo y las rutas de este archivo están VERIFICADOS contra la key real el
 * 26-oct-2026 con las sondas de `.probe/`; ya no son suposiciones:
 *
 * - `GET /v1/models` → `muse-image-1.0`, `muse-spark-1.3`, `sam-3.1`,
 *   `muse-wonder-1.0`, `muse-voice-transcribe-1.0` (+ variantes contributor).
 * - `POST /v1/images/edits` (multipart `model` + `prompt` + `image` + `size`)
 *   → `data[0].b64_json`. Es el camino img2img: conserva el producto de la foto
 *   y hornea la tipografía. El mime real viene de `output_format` (webp/png).
 *   `size` es "WxH" y la API lo ajusta al encuadre nativo más cercano
 *   (verificado 28-oct-2026: 4:5 → 1408x1760, 9:16 → 1152x2048).
 * - `POST /v1/responses` con `text.format = json_schema` → `output[]` con
 *   `reasoning` + `message/output_text`. Es el único endpoint de texto, y
 *   `/v1/chat/completions` lo dice explícitamente: "image models are only
 *   supported on the /v1/responses API".
 *
 * Dos cosas que NO funcionan y conviene no reintentar:
 * - `POST /v1/images/generations` con imagen: solo acepta `{model, prompt}`
 *   (text-to-image) y rechaza cualquier parámetro de referencia con
 *   "unknown parameter".
 * - `sam-3.1`: responde 200 con `output_text` vacío y 0 tokens en todas las
 *   formas probadas, y `/v1/{segmentations,images/segment,masks,segment}` dan
 *   404. La pasada de visión la hace `muse-spark-1.3`, que sí acepta
 *   `input_image` y devuelve el bounding box normalizado.
 *
 * Una sola key (`MUSE_IMAGE_API_KEY`) configura el acceso a Muse Spark y Muse Image.
 */

import type { GeneratedImage, ImageInput } from "./image";

const BASE = "https://api.meta.ai/v1";
const DEFAULT_SPARK_MODEL = "muse-spark-1.3";
const DEFAULT_IMAGE_MODEL = "muse-image-1.0";
/**
 * La API acepta `size` como "WxH" y lo ajusta al encuadre nativo más cercano
 * preservando el aspecto (verificado 28-oct-2026 con scripts/image-size-probe.mjs):
 * feed/carrusel 4:5 → 1408x1760, story 9:16 → 1152x2048.
 */
const DEFAULT_FEED_SIZE = "1080x1350";
const DEFAULT_STORY_SIZE = "1080x1920";

/** Los pasos de razonamiento de muse-spark-1.3 son largos (576 tokens en la
 * prueba para 3 hooks). 90s deja margen sin colgar la corrida. */
const TEXT_TIMEOUT_MS = Number(process.env.META_TEXT_TIMEOUT_MS ?? 90_000) || 90_000;
/** `/images/edits` tardó 18-25s por flyer en la prueba. */
const IMAGE_TIMEOUT_MS = Number(process.env.META_IMAGE_TIMEOUT_MS ?? 120_000) || 120_000;

export function metaApiKey(): string {
  const key = process.env.MUSE_IMAGE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "MUSE_IMAGE_API_KEY no está definida. Es la llave del Meta Model API del hackathon; habilita muse-spark y muse-image.",
    );
  }
  return key;
}

export function metaAvailable(): boolean {
  return Boolean(process.env.MUSE_IMAGE_API_KEY?.trim());
}

export function metaTextModel(): string {
  const model = (process.env.MUSE_SPARK_MODEL ?? DEFAULT_SPARK_MODEL).trim() || DEFAULT_SPARK_MODEL;
  if (!/^muse-spark-[a-z0-9][a-z0-9.-]*$/i.test(model)) throw new Error("MUSE_SPARK_MODEL debe identificar un modelo Muse Spark.");
  return model;
}

export function metaImageModel(): string {
  const model = (process.env.MUSE_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL).trim() || DEFAULT_IMAGE_MODEL;
  if (!/^muse-image-[a-z0-9][a-z0-9.-]*$/i.test(model)) throw new Error("MUSE_IMAGE_MODEL debe identificar un modelo Muse Image.");
  return model;
}

/** Tamaño pedido para feed 4:5 y carrusel. `MUSE_IMAGE_SIZE` legado vale para ambos. */
export function feedImageSize(): string {
  return (
    process.env.MUSE_IMAGE_SIZE_FEED?.trim() ||
    process.env.MUSE_IMAGE_SIZE?.trim() ||
    DEFAULT_FEED_SIZE
  );
}

/** Tamaño pedido para la story 9:16 nativa. */
export function storyImageSize(): string {
  return (
    process.env.MUSE_IMAGE_SIZE_STORY?.trim() ||
    process.env.MUSE_IMAGE_SIZE?.trim() ||
    DEFAULT_STORY_SIZE
  );
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${metaApiKey()}` };
}

/** Combina la señal del caller con el presupuesto propio de la llamada. */
function timedSignal(caller: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

/** Error legible para el badge de fallback del cliente. */
function apiError(model: string, status: number, body: string): Error {
  const message = /"message"\s*:\s*"([^"]{1,300})/.exec(body)?.[1] ?? body.slice(0, 200);
  return new Error(`Meta ${model} → HTTP ${status}: ${message}`);
}

/** Un reintento ante HTTP 5xx o red caída (nunca ante abort, timeout ni
 * 4xx): un 500 aislado no debería mandar la pieza al fallback local. El
 * presupuesto total de timeout se comparte entre ambos intentos. */
async function postMeta(
  url: string,
  init: RequestInit,
  model: string,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; raw: string }> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1500);
    try {
      const res = await fetch(url, init);
      const raw = await res.text().catch(() => "");
      if (res.status >= 500 && attempt === 0) continue;
      return { ok: res.ok, status: res.status, raw };
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
        throw new Error(`Meta ${model}: se superó el límite de ${timeoutMs} ms.`);
      }
      lastErr = err;
    }
  }
  throw new Error(`Meta ${model}: red caída (${String(lastErr)}).`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Texto / JSON ────────────────────────────────────────────────────────────

type MetaContentPart = { type: string; text?: string; image_url?: string };

type MetaResponse = {
  id?: string;
  status?: string;
  output?: Array<{ type?: string; content?: MetaContentPart[] }>;
  error?: { message?: string };
  usage?: Record<string, unknown>;
};

/** Concatena todo `output_text` de la respuesta (muse-spark mete razonado
 * aparte, así que el JSON útil está en el item `message`). */
function textOf(response: MetaResponse): string {
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim();
}

/**
 * JSON estructurado vía `/v1/responses`. El modelo lo fija `MUSE_SPARK_MODEL`
 * (default `muse-spark-1.3`); el caller no nombra modelos, solo pide JSON.
 */
export async function metaJson<T>(
  prompt: string,
  args: {
    schema?: Record<string, unknown>;
    image?: ImageInput;
    images?: ImageInput[];
    signal?: AbortSignal;
    timeoutMs?: number;
    previousResponseId?: string;
  } = {},
): Promise<T> {
  const model = metaTextModel();
  const content: MetaContentPart[] = [{ type: "input_text", text: prompt }];
  for (const image of args.images ?? (args.image ? [args.image] : [])) {
    content.push({
      type: "input_image",
      image_url: `data:${image.mimeType};base64,${image.base64}`,
    });
  }

  const body: Record<string, unknown> = {
    model,
    input: [{ role: "user", content }],
    ...(args.previousResponseId ? { previous_response_id: args.previousResponseId } : {}),
    ...(args.schema
      ? {
          text: {
            format: {
              type: "json_schema",
              name: "respuesta",
              strict: true,
              schema: toStrictJsonSchema(args.schema),
            },
          },
        }
      : { text: { format: { type: "json_object" } } }),
  };

  const { ok, status, raw } = await postMeta(
    `${BASE}/responses`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: timedSignal(args.signal, args.timeoutMs ?? TEXT_TIMEOUT_MS),
    },
    model,
    args.timeoutMs ?? TEXT_TIMEOUT_MS,
  );

  if (!ok) throw apiError(model, status, raw);
  const parsed = JSON.parse(raw) as MetaResponse;
  const text = textOf(parsed);
  if (!text) throw new Error(`Meta ${model} respondió sin texto (status=${parsed.status ?? "?"}).`);
  return parseJsonBlock(text) as T;
}

/** Acepta el JSON directo y también el que viene envuelto en ```json ... ```. */
function parseJsonBlock(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidate = (fenced ?? text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    const end = candidate.lastIndexOf(candidate.trim().endsWith("]") ? "]" : "}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error(`Meta devolvió algo que no es JSON: ${candidate.slice(0, 160)}`);
  }
}

/**
 * Las pipelines arman schemas compactos (tipos en mayúscula, `required`
 * parcial). `strict: true` de Meta exige JSON Schema canónico: tipos en
 * minúscula, `additionalProperties: false` y TODA propiedad en `required`.
 */
export function toStrictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeNode(schema);
  return fillRequired(normalized);
}

function normalizeNode(node: unknown): Record<string, unknown> {
  if (Array.isArray(node)) return { type: "array", items: node.map(normalizeNode) };
  if (!node || typeof node !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "type" && typeof value === "string") {
      out.type = value.toLowerCase();
    } else if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeNode(v)]),
      );
    } else if (key === "items") {
      out.items = normalizeNode(value);
    } else {
      out[key] = value;
    }
  }
  if (typeof out.type !== "string") delete out.type;
  return out;
}

/** `strict` rechaza schemas con propiedades opcionales: las exigimos todas. */
function fillRequired(node: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...node, additionalProperties: false };
  if (next.type === "object" || next.properties) {
    const props = (next.properties ?? {}) as Record<string, unknown>;
    next.required = Object.keys(props);
    next.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, fillRequired(v as Record<string, unknown>)]),
    );
  }
  if (next.type === "array" && next.items) {
    next.items = fillRequired(next.items as Record<string, unknown>);
  }
  return next;
}

// ── Imagen ──────────────────────────────────────────────────────────────────

type MetaImagesResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  output_format?: string;
  error?: { message?: string };
};

/**
 * Flyer img2img: `/images/edits` con la foto del usuario como archivo. Es el
 * camino que conserva el producto EXACTO y diseña el fondo + la tipografía
 * alrededor (probado: 18-25 s por pieza).
 */
export async function metaImageFlyer(
  prompt: string,
  photo: ImageInput,
  opts: { signal?: AbortSignal; timeoutMs?: number; size?: string } = {},
): Promise<GeneratedImage> {
  const model = metaImageModel();
  const bytes = Buffer.from(photo.base64, "base64");
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("image", new Blob([bytes], { type: photo.mimeType }), "producto");
  form.append("size", opts.size?.trim() || feedImageSize());

  const { ok, status, raw } = await postMeta(
    `${BASE}/images/edits`,
    {
      method: "POST",
      headers: authHeaders(),
      body: form,
      signal: timedSignal(opts.signal, opts.timeoutMs ?? IMAGE_TIMEOUT_MS),
    },
    model,
    opts.timeoutMs ?? IMAGE_TIMEOUT_MS,
  );

  if (!ok) throw apiError(model, status, raw);
  const parsed = JSON.parse(raw) as MetaImagesResponse;
  const b64 = parsed.data?.[0]?.b64_json;
  if (!b64) throw new Error(`Meta ${model} respondió sin imagen.`);
  return { base64: b64, mimeType: mimeFromFormat(parsed.output_format) };
}

/** `output_format` dice "webp" o "png"; si falta, PNG fue lo que devolvió la
 * prueba sin `size`. */
function mimeFromFormat(format: string | undefined): string {
  const f = (format ?? "").toLowerCase();
  if (f === "jpeg" || f === "jpg") return "image/jpeg";
  if (f === "webp") return "image/webp";
  return "image/png";
}
