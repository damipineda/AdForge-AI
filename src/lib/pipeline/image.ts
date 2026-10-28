/**
 * Vocabulario común de la pipeline: cómo viaja una imagen entre la foto del
 * usuario, el paso de visión y el motor de pósters. Independiente del proveedor
 * para que ningún módulo del camino vivo dependa de un adaptador concreto.
 */

/** Una imagen binaria lista para mandarse como data URL a cualquier modelo. */
export type ImageInput = { base64: string; mimeType: string };

/** Imagen devuelta por un motor de generación, todavía sin data URL armar. */
export type GeneratedImage = { base64: string; mimeType: string };

export function bufferToBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}
