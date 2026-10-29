/** Live check against an original photo, two feed ads and a story; may regenerate up to two pieces. */
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
  if (paths.length !== 4) throw new Error("Indicá la foto original, dos piezas de feed y la story.");
  process.loadEnvFile(".env.local");
  const images = await Promise.all(paths.map(load));
  const input: MuseImageInput = {
    locale: "es", productDescription: "Bolsa de detergente OMO Lavagem Perfeita de 4 kg; el envase dice hasta 50 lavados.", designData: null, photo: images[0],
    feed: [
      { hook: "Blanco impecable, familia feliz", body: "", cta: "Sumalo a tu compra", concept: "Familia", artDirection: "Usar contexto de lavado", pills: [] },
      { hook: "¿No te dura el detergente?", body: "", cta: "Pedí tu bolsa 4 kg", concept: "Uso", artDirection: "Mostrar la bolsa en una escena de uso", pills: [] },
    ],
    story: { hook: "4 kilos, 50 lavados reales", cta: "Asegurá tus 50 lavados", concept: "Rendimiento", artDirection: "Enfatizar el producto" },
    creativeStrategy: { campaignIdea: "Lavado cotidiano", audience: "Hogares", objective: "Presentar producto", visualWorld: "Contexto de lavado cotidiano", carouselRecommended: false, carouselReason: "No aplica" }, carouselSlides: null,
  };
  const data = (image: ImageInput) => `data:${image.mimeType};base64,${image.base64}`;
  const original: MuseImageOutput = { scenes: [] as unknown as MuseImageOutput["scenes"], feed: [data(images[1]), data(images[2])], feedErrors: [null, null], storyImage: data(images[3]), storyError: null, carouselImages: null, carouselErrors: null };
  const result = await reviewCampaign(input, original, "meta");
  console.log(JSON.stringify({ feed: result.feedReviews, story: result.storyReview, diversity: result.diversityReview, changed: [result.image.feed[0] !== original.feed[0], result.image.feed[1] !== original.feed[1], result.image.storyImage !== original.storyImage] }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
