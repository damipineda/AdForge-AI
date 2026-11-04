import sharp from "sharp";
import { bufferToBase64 } from "./image";
import type { ImageInput } from "./image";

/**
 * Copia de análisis: la foto del producto redimensionada a 1024px en su lado
 * más largo y JPEG calidad 80 para las pasadas de visión/análisis de
 * `muse-spark-1.3`. Los crudos de teléfono (10-20MB en base64) saturan el
 * upload y disparan timeouts; para analizar basta 1024px. La foto original
 * se sigue usando intacta en img2img. Nunca lanza: ante cualquier fallo
 * devuelve el original.
 */
export async function toAnalysisImage(bytes: ArrayBuffer, mimeType: string): Promise<ImageInput> {
  try {
    const out = await sharp(Buffer.from(bytes), { failOn: "none" })
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return { base64: bufferToBase64(bytes), mimeType };
  }
}
