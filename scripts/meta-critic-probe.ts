/** Live check against an original photo and three existing ads; may regenerate up to two pieces. */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { reviewCampaign } from "../src/lib/pipeline/visual-review";
import type { MuseImageInput, MuseImageOutput } from "../src/lib/pipeline/muse-image";
import type { ImageInput } from "../src/lib/pipeline/image";

async function load(path: string): Promise<ImageInput> {
  const ext = extname(path).toLowerCase();
  return { mimeType: ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg", base64: (await readFile(path)).toString("base64") };
}

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length !== 4) throw new Error("Indicá la foto original y tres piezas.");
  process.loadEnvFile(".env.local");
  const images = await Promise.all(paths.map(load));
  const input: MuseImageInput = {
    locale: "es", format: "post", productDescription: "Bolsa de detergente OMO Lavagem Perfeita de 4 kg; el envase dice hasta 50 lavados.", designData: null, photo: images[0],
    hooks: ["Blanco impecable, familia feliz", "¿No te dura el detergente?", "4 kilos, 50 lavados reales"], bodies: ["", "", ""], ctas: ["Sumalo a tu compra", "Pedí tu bolsa 4 kg", "Asegurá tus 50 lavados"],
    concepts: ["Familia", "Uso", "Rendimiento"], artDirections: ["Usar contexto de lavado", "Mostrar la bolsa en una escena de uso", "Enfatizar el producto"], pills: [[], [], []],
    creativeStrategy: { campaignIdea: "Lavado cotidiano", audience: "Hogares", objective: "Presentar producto", visualWorld: "Contexto de lavado cotidiano", carouselRecommended: false, carouselReason: "No aplica" }, carouselSlides: null,
  };
  const data = (image: ImageInput) => `data:${image.mimeType};base64,${image.base64}`;
  const original: MuseImageOutput = { scenes: [] as unknown as MuseImageOutput["scenes"], posters: [data(images[1]), data(images[2]), data(images[3])], errors: [null, null, null], carouselImages: null, carouselErrors: null };
  const result = await reviewCampaign(input, original, "meta");
  console.log(JSON.stringify({ reviews: result.visualReviews, diversity: result.diversityReview, changed: result.image.posters.map((value, i) => value !== original.posters[i]) }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
