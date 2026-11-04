import sharp from "sharp";
import type { ImageInput } from "./image";

/** Reference only: never used as final artwork. Every supplied product reaches Muse. */
export async function referenceSheet(sources: ImageInput[], artwork?: ImageInput | null): Promise<ImageInput> {
  if (!sources.length) throw new Error("Faltan las fotos originales de producto.");
  if (sources.length === 1 && !artwork) return sources[0];
  if (sources.length === 1 && artwork && sources[0].base64 === artwork.base64) return artwork;
  const width = 1600, height = 1200;
  const refs = sources.slice(0, 4);
  const cells = artwork
    ? [{ image: artwork, left: 0, top: 0, width: 1000, height }, ...refs.map((image, i) => ({ image, left: 1016, top: Math.floor(i * height / refs.length), width: 584, height: Math.floor(height / refs.length) }))]
    : refs.map((image, i) => ({ image, left: (i % 2) * 800, top: Math.floor(i / 2) * 600, width: 800, height: 600 }));
  const composite = await Promise.all(cells.map(async cell => ({
    input: await sharp(Buffer.from(cell.image.base64, "base64"), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(cell.width - 16, cell.height - 16, { fit: "contain", background: "#E8E5E0" })
      .sharpen({ sigma: 0.7, m1: 0.5, m2: 1.2 })
      .png()
      .toBuffer(),
    left: cell.left + 8, top: cell.top + 8,
  })));
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#E8E5E0" } }).composite(composite).png().toBuffer();
  return { mimeType: "image/png", base64: bytes.toString("base64") };
}
