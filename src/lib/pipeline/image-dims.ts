/**
 * Dimensiones reales de un binario de imagen (PNG IHDR, WebP VP8/VP8L/VP8X,
 * JPEG SOF). Sin dependencias: la revisión determinística lo usa para
 * verificar que el arte IA respete el aspecto del placement antes de entregar.
 */

export type ImageDims = { width: number; height: number; format: string };

export function imageDimsFromBytes(buf: Buffer): ImageDims | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" };
  }
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 ") {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, format: "webp" };
    }
    if (chunk === "VP8L") {
      const b1 = buf[21], b2 = buf[22], b3 = buf[23], b4 = buf[24];
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
        format: "webp",
      };
    }
    if (chunk === "VP8X") {
      return {
        width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
        format: "webp",
      };
    }
  }
  for (let i = 0; i + 9 < buf.length; i++) {
    if (buf[i] === 0xff && buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xcf && buf[i + 1] !== 0xc4 && buf[i + 1] !== 0xc8) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), format: "jpeg" };
    }
  }
  return null;
}

/** Decodifica un data URL `data:image/...;base64,...` a dimensiones. */
export function imageDimsFromDataUrl(value: string | null): ImageDims | null {
  if (!value) return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  try {
    return imageDimsFromBytes(Buffer.from(match[2], "base64"));
  } catch {
    return null;
  }
}
