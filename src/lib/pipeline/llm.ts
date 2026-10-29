import { metaImageFlyer, metaJson } from "./meta";
import type { GeneratedImage, ImageInput } from "./image";
import { redactSensitiveValues } from "./privacy";

export type { GeneratedImage, ImageInput };

/**
 * Router de modelos de la pipeline. Hay UN solo proveedor vivo: el Meta Model
 * API. Texto/visión → `muse-spark-1.3` vía `/v1/responses`; las piezas
 * (feed, story, carrusel) → `muse-image-1.0` vía `/v1/images/edits` (img2img
 * fuera del camino: si
 * hace falta reactivar uno, se agrega acá y en `getProvider()`, no en las
 * etapas, que siempre llaman a `llmJson`/`llmImage`.
 *
 * La corrida sin llave (`AI_PROVIDER=demo`) no pasa por este módulo: cada etapa
 * despacha sus fixtures locales antes de llamar al router.
 */

export type LlmJsonArgs = {
  /** Foto del producto: con ella la llamada es una pasada de visión. */
  image?: ImageInput;
  images?: ImageInput[];
  /** Esquema de la respuesta; se normaliza a JSON Schema estricto en `meta.ts`. */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** JSON de texto o visión (si `args.image` viene, entra la foto). */
export async function llmJson<T>(prompt: string, args: LlmJsonArgs = {}): Promise<T> {
  return redactSensitiveValues(await metaJson<T>(prompt, args));
}

/** Una pieza terminada, generada a partir de la foto real del producto. */
export async function llmImage(
  prompt: string,
  image: ImageInput,
  opts: { signal?: AbortSignal; timeoutMs?: number; size?: string } = {},
): Promise<GeneratedImage> {
  return metaImageFlyer(prompt, image, opts);
}
