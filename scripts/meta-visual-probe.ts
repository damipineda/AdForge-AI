/** Optional live check: npx tsx scripts/meta-visual-probe.ts original.jpg flyer1.png flyer2.png flyer3.png */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { metaJson } from "../src/lib/pipeline/meta";
import type { ImageInput } from "../src/lib/pipeline/image";

async function load(path: string): Promise<ImageInput> {
  const ext = extname(path).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { mimeType, base64: (await readFile(path)).toString("base64") };
}

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length !== 4) throw new Error("Indicá las rutas de la foto original y tres piezas.");
  process.loadEnvFile(".env.local");
  const images = await Promise.all(paths.map(load));
  const schema = { type: "OBJECT", properties: { observation: { type: "STRING" } }, required: ["observation"] };
  const [pair, group] = await Promise.all([
    metaJson<{ observation: string }>("Imagen 1 es el producto original e imagen 2 es un anuncio. Describe en una frase si aparece el mismo producto.", { images: [images[0], images[1]], schema, timeoutMs: 90_000 }),
    metaJson<{ observation: string }>("Compara las tres imágenes: describe en una frase una diferencia visible de composición.", { images: images.slice(1), schema, timeoutMs: 90_000 }),
  ]);
  if (!pair.observation || !group.observation) throw new Error("Respuesta vacía.");
  console.log(JSON.stringify({ pair: pair.observation, group: group.observation }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
