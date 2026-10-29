import { z } from "zod";
import type { CreativeStrategy, FeedVariant, Locale, StoryCopy } from "@/lib/schema/campaign";
import { llmJson } from "./llm";
import type { Provider } from "./provider";
import type { ImageInput } from "./image";

type Input = { product: string; locale: Locale; claims: string[]; strategy: CreativeStrategy; feed: [FeedVariant, FeedVariant]; story: StoryCopy | null; merchantLink: string | null; legalDisclaimer: string | null; artworks?: ImageInput[]; feedback?: string[]; captionsOnly?: boolean; editorialRetry?: boolean };
type CopyReview = { status: "reviewed" | "needs_review" | "unavailable"; summary: string };
const copy = z.object({ hook: z.string().trim().min(1).max(40), body: z.string().trim().min(1).max(125), cta: z.string().trim().min(1).max(30), captionInstagram: z.string().trim().min(1).max(280), captionFacebook: z.string().trim().min(1).max(280) });
const parsed = z.object({ summary: z.string().trim().min(1).max(350), feed: z.array(copy).length(2), story: z.object({ hook: z.string().trim().min(1).max(40), cta: z.string().trim().min(1).max(30) }).nullable() });
const field = { type: "STRING" };
const responseSchema = (hasStory: boolean) => ({ type: "OBJECT", properties: { summary: field, feed: { type: "ARRAY", items: { type: "OBJECT", properties: { hook: field, body: field, cta: field, captionInstagram: field, captionFacebook: field }, required: ["hook", "body", "cta", "captionInstagram", "captionFacebook"] } }, ...(hasStory ? { story: { type: "OBJECT", properties: { hook: field, cta: field }, required: ["hook", "cta"] } } : {}) }, required: ["summary", "feed", ...(hasStory ? ["story"] : [])] });

type Draft = z.infer<typeof parsed>;
export function copyQualityIssues(draft: Draft, captionsOnly = false): string[] {
  const issues: string[] = [];
  const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const genericCta = /^(conoce mas|descubri mas|descubri mas informacion|mas informacion|ver mas|saber mas|consulta donde informarte|learn more|discover more|saiba mais|conheca mais)$/;
  const appearanceCta = /^(consulta|pregunta|averigua|pedi informacion) (por |sobre )?(este |esta |ese |esa |el |la )?(frente|gris|color|vista|angulo|foto|imagen)( del producto)?$/;
  for (const [index, item] of draft.feed.entries()) {
    if (!captionsOnly && genericCta.test(clean(item.cta))) issues.push(`Feed ${index + 1}: CTA genérico sin acción u objeto específico.`);
    if (!captionsOnly && appearanceCta.test(clean(item.cta))) issues.push(`Feed ${index + 1}: CTA apunta a una vista o color, no a consultar por el producto.`);
    if (!captionsOnly && /\b(lo que se ve|nombres visibles|nombres a la vista|formatos en un vistazo|frente a frente)\b/.test(clean(`${item.hook} ${item.body}`))) issues.push(`Feed ${index + 1}: el arte describe su disposición en vez de comunicar una idea comercial.`);
    for (const [network, caption] of [["Instagram", item.captionInstagram], ["Facebook", item.captionFacebook]]) {
      const normalized = clean(caption);
      if (normalized.length < 35 || normalized === clean(item.hook) || normalized === clean(item.body)) issues.push(`Feed ${index + 1}: descripción de ${network} demasiado breve o repetida.`);
    }
  }
  if (!captionsOnly && draft.story && (genericCta.test(clean(draft.story.cta)) || appearanceCta.test(clean(draft.story.cta)))) issues.push("Story: CTA genérico o centrado en la apariencia en vez del producto.");
  return issues;
}

/** The critic edits copy before rendering; failure leaves the original intact. */
export async function reviewCampaignCopy(input: Input, provider: Provider, generate?: (prompt: string) => Promise<unknown>, judge?: (prompt: string) => Promise<unknown>): Promise<{ feed: Input["feed"]; story: StoryCopy | null; copyReview: CopyReview }> {
  const unavailable = (summary: string) => ({ feed: input.feed, story: input.story, copyReview: { status: "unavailable" as const, summary } });
  if (provider === "demo") return unavailable("El copy de demostración no recibió revisión editorial con IA.");
  const produce = generate ?? ((prompt: string) => llmJson(prompt, { schema: responseSchema(Boolean(input.story)), images: input.artworks, timeoutMs: 90_000 }));
  const assess = judge ?? (generate ? null : ((prompt: string) => llmJson(prompt, { schema: { type: "OBJECT", properties: { adequate: { type: "BOOLEAN" }, reason: { type: "STRING" } }, required: ["adequate", "reason"] }, images: input.artworks, timeoutMs: 60_000 })));
  try {
    const prompt = [
      `Sos editor publicitario. Revisá y mejorá el copy de una campaña en ${input.locale} para ${input.product}; idea: ${input.strategy.campaignIdea}; audiencia: ${input.strategy.audience}.`,
      `Datos observados, no garantías: ${JSON.stringify(input.claims)}. No inventes ni exageres beneficios, rendimiento, precio, disponibilidad, ofertas, testimonios, certificaciones ni resultados. Conservá exactamente las condiciones y cantidades; ante dudas omití el dato.`,
      "Nunca uses ni repitas matrícula, chapa, patente, número de serie, documentos o direcciones visibles; no son argumentos de venta. No los menciones en CTA, titulares ni descripciones.",
      "El texto de la imagen debe ser una idea persuasiva y concreta relacionada con el producto y su contexto, no una enumeración mecánica de atributos. El apoyo agrega contexto sin repetir el titular; el CTA propone una acción realista.",
      "Elegí un ángulo de marketing adecuado al objetivo y a la información disponible: atención, contexto y motivo para considerar, seguido por una acción concreta y honesta. El CTA debe incluir acción y objeto pertinente; evitá usar 'Conocé más' o 'Descubrí más' en todas las piezas. Sin destino de compra confirmado, no inventes un enlace, prueba de manejo, promoción, contacto o disponibilidad. En suplementos y temas de salud nunca deduzcas beneficios médicos, tratamientos o resultados de la apariencia del producto.",
      "Un CTA debe referirse a una acción comercial sobre el producto, no sobre una parte, color o ángulo de la fotografía. Evitá fórmulas como 'consultá este frente' o 'preguntá por este gris'. Si faltan datos de compra, invitá a consultar por el producto sin inventar especificaciones ni prometer una operación disponible.",
      "Cada descripción de Instagram y Facebook debe acompañar SU pieza: mencionar explícitamente el producto, desarrollar su idea con una motivación concreta o una situación de uso relacionada con lo que se sabe de él, y cerrar con una acción natural. Evitá frases genéricas que servirían para cualquier producto, preguntas de relleno y promesas de que alguien responderá. No transcribas la imagen ni cites o enumeres sus especificaciones. Mantené coherencia con el concepto y la escena; no prometas beneficios no verificados.",
      input.merchantLink ? "Hay enlace de compra disponible." : "No hay enlace de compra: usá CTA de consulta o información, no prometas compra directa.",
      `Piezas: ${JSON.stringify(input.feed.map(({ concept, artDirection, hook, body, cta, captionInstagram, captionFacebook }) => ({ concept, artDirection, hook, body, cta, captionInstagram, captionFacebook })))}. Story: ${JSON.stringify(input.story)}.`,
      ...(input.feedback?.length ? [`Observaciones editoriales a resolver sin inventar datos: ${JSON.stringify(input.feedback)}.`] : []),
      ...(input.captionsOnly ? [`Las dos imágenes adjuntas son los artes finales de feed en orden. Corregí solo las descripciones externas para que acompañen lo que realmente se ve. Conservá los titulares, apoyos y CTA que ya están en el arte. Observaciones: ${JSON.stringify(input.feedback ?? [])}.`] : []),
      "Respondé JSON con summary (máximo 350 caracteres), feed con exactamente dos objetos en orden {hook <=40, body <=125, cta <=30, captionInstagram <=280, captionFacebook <=280}, y story {hook <=40, cta <=30} solamente si hay story. Devolvé texto completo, sin markdown ni afirmaciones nuevas.",
    ].join("\n\n");
    const parse = (response: unknown) => parsed.safeParse({ ...(response as object), story: (response as { story?: unknown })?.story ?? null });
    let candidate = parse(await produce(prompt));
    if (!candidate.success || Boolean(candidate.data.story) !== Boolean(input.story)) return unavailable("No se pudo validar la revisión editorial; se conservó el copy original.");
    const firstIssues = copyQualityIssues(candidate.data, input.captionsOnly);
    if (firstIssues.length) {
      try {
        const retry = parse(await produce(`${prompt}\n\nREVISIÓN EXTRA: corregí estos problemas concretos sin añadir datos: ${firstIssues.join(" ")}. Reescribí CTA y descripciones para que la acción y el argumento tengan relación real con cada pieza.`));
        if (retry.success && Boolean(retry.data.story) === Boolean(input.story)) candidate = retry;
      } catch { /* se conserva la primera respuesta y se advierte el problema */ }
    }
    const evidence = `${input.product} ${input.claims.join(" ")}`;
    const allowedNumbers = new Set(evidence.match(/\d+(?:[.,]\d+)?/g) ?? []);
    const generatedText = JSON.stringify({ feed: candidate.data.feed, story: candidate.data.story });
    const inventedNumber = (generatedText.match(/\d+(?:[.,]\d+)?/g) ?? []).some((number) => !allowedNumbers.has(number));
    const calls = [...candidate.data.feed.map((v) => v.cta), ...(candidate.data.story ? [candidate.data.story.cta] : [])];
    const unsupportedPurchase = !input.merchantLink && calls.some((cta) => {
      const informationRequest = /^\s*ped(?:í|i|ir)\s+(?:informaci[oó]n|detalles|datos|asesoramiento)\b/i.test(cta);
      return !informationRequest && /^\s*(?:compr(?:á|a|ar|e)|ped(?:í|i|ir)|buy|shop|order)(?=\s|$|[.!?])/i.test(cta);
    });
    if (inventedNumber) return unavailable("La revisión introdujo cifras que no se pudieron corroborar; se conservó el copy original.");
    if (unsupportedPurchase) return unavailable("La revisión propuso compra directa sin enlace; se conservó el copy original.");
    const rewritten = candidate.data.feed.map((v, i) => {
      const legal = input.legalDisclaimer;
      const withLegal = (caption: string) => legal && !caption.includes(legal) ? `${caption} · ${legal}` : caption;
      return { ...input.feed[i], ...(input.captionsOnly ? {} : v), captionInstagram: withLegal(v.captionInstagram), captionFacebook: withLegal(v.captionFacebook) };
    });
    if (rewritten.some((v) => v.captionInstagram.length > 280 || v.captionFacebook.length > 280)) return unavailable("La revisión no conservó el aviso dentro del límite; se conservó el copy original.");
    const issues = copyQualityIssues(candidate.data, input.captionsOnly);
    if (assess) {
      try {
        const critiqueRaw = await assess([
          `Evaluá como editor independiente el copy publicitario de ${input.product}. Campaña: ${input.strategy.campaignIdea}. Datos observados: ${JSON.stringify(input.claims)}.`,
          `Copy: ${JSON.stringify(candidate.data)}.`,
          "¿Cada pieza contiene una idea pertinente al producto y una motivación concreta, con una descripción que aporta contexto sin solo describir el arte? ¿El CTA indica una acción útil y honesta? Rechazá frases de relleno que servirían para cualquier producto, reiteración de apariencia, lectura de etiquetas como argumento y beneficios no sustentados. Si hay suplementos, no aceptes tratamientos, resultados o beneficios de salud no verificados. No inventes un destino o información que falte. Para captionsOnly, evaluá solo las descripciones.",
          "Respondé JSON {adequate: boolean, reason: string}; explicá los fallos concretos. adequate indica calidad editorial revisada, no aprobación para publicar.",
        ].join("\n\n"));
        const critiqueValue = critiqueRaw && typeof critiqueRaw === "object" ? critiqueRaw as Record<string, unknown> : {};
        const reason = typeof critiqueValue.reason === "string" ? critiqueValue.reason.trim().slice(0, 600) : "";
        const critique = z.object({ adequate: z.boolean(), reason: z.string().trim().min(1).max(600) }).safeParse({ ...critiqueValue, reason: reason || "La evaluación no detalló sus motivos." });
        if (!critique.success) issues.push("No se pudo validar la evaluación editorial independiente.");
        else if (!critique.data.adequate) {
          if (!input.editorialRetry) {
            const repaired = await reviewCampaignCopy({ ...input, editorialRetry: true, feedback: [...(input.feedback ?? []), critique.data.reason] }, provider, produce, assess);
            if (repaired.copyReview.status === "reviewed") return repaired;
          }
          issues.push(critique.data.reason.slice(0, 220));
        }
      } catch { issues.push("No se pudo completar la evaluación editorial independiente."); }
    }
    return { feed: rewritten as Input["feed"], story: input.story && candidate.data.story ? (input.captionsOnly ? input.story : { ...input.story, ...candidate.data.story }) : null, copyReview: { status: issues.length ? "needs_review" : "reviewed", summary: issues.length ? `Revisar: ${issues.join(" ")}`.slice(0, 350) : candidate.data.summary } };
  } catch {
    return unavailable("No se pudo completar la revisión editorial; se conservó el copy original.");
  }
}
