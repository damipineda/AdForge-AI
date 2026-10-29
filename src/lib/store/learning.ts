import {
  allLearnings,
  insertLearnings,
  upsertSkillRule,
  type LearningRow,
} from "./db";
import type { CampaignResult } from "@/lib/schema/campaign";

/** Umbral automático: con esta evidencia una candidata se vuelve regla activa. */
export const LEARNING_THRESHOLD = 3;

const CATEGORY_KEYWORDS: Array<{ key: string; label: string; words: string[] }> = [
  { key: "vehiculos", label: "Vehículos", words: ["auto", "coche", "carro", "moto", "vehicul", "camioneta", "pickup", "suv", "kia", "toyota", "car "] },
  { key: "limpieza-hogar", label: "Limpieza y Hogar", words: ["omo", "detergente", "limpieza", "hogar", "lavandina", "jabon", "jabón", "desinfectante", "suavizante", "cleaning"] },
  { key: "alimentos", label: "Alimentos", words: ["comida", "hamburguesa", "alimento", "food", "snack", "yerba", "cafe", "café", "te ", "torta", "pan", "leche"] },
  { key: "moda", label: "Moda y Accesorios", words: ["ropa", "moda", "vestido", "zapatilla", "joya", "fashion", "calzado", "cartera", "reloj", "perfume"] },
];

export function categoryLabel(key: string): string {
  return CATEGORY_KEYWORDS.find((c) => c.key === key)?.label ?? "General";
}

/** Clasificador por keywords sobre la descripción del producto. */
export function classifyCategory(text: string): string {
  const lower = ` ${text.toLowerCase()} `;
  for (const { key, words } of CATEGORY_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return key;
  }
  return "general";
}

/** La dirección de arte arranca con "SUPERFICIE: …; LUZ: …;" por prompt. */
export function parseSurfaceLight(artDirection: string): { surface: string | null; lighting: string | null } {
  const match = /SUPERFICIE:\s*([^;]{2,120}?)\s*;\s*LUZ:\s*([^;]{2,120}?)\s*;/i.exec(artDirection);
  if (!match) return { surface: null, lighting: null };
  return { surface: match[1].trim(), lighting: match[2].trim() };
}

type CheckLite = { id: string; passed: boolean };

function toChecks(review: unknown): CheckLite[] {
  const checks = (review as { checks?: unknown } | null)?.checks;
  if (!Array.isArray(checks)) return [];
  return checks
    .filter((c): c is { id: unknown; passed: unknown } => !!c && typeof c === "object")
    .map((c) => ({ id: String(c.id), passed: c.passed === true }));
}

/**
 * Un registro por pieza generada: qué superficie/luz se usó, qué checks
 * pasaron y si hubo reintento. Defensivo: el resultJson puede venir parcial.
 */
export function extractLearnings(
  result: CampaignResult,
  ids: { campaignId: string; projectId: string },
): Array<Omit<LearningRow, "id" | "createdAt">> {
  const category = classifyCategory(
    `${result.listing?.standardizedTitle ?? ""} ${result.listing?.shortPitch ?? ""} ${result.creativeStrategy?.campaignIdea ?? ""}`,
  );
  const rows: Array<Omit<LearningRow, "id" | "createdAt">> = [];
  const push = (
    placement: string,
    review: unknown,
    artDirection: string,
  ) => {
    const checks = toChecks(review);
    const retryCount = Number((review as { retryCount?: unknown } | null)?.retryCount ?? 0);
    const retryReason = (review as { retryReason?: unknown } | null)?.retryReason;
    const { surface, lighting } = parseSurfaceLight(artDirection);
    rows.push({
      campaignId: ids.campaignId,
      projectId: ids.projectId,
      category,
      placement,
      surface,
      lighting,
      passedAll: checks.length > 0 && checks.every((c) => c.passed) ? 1 : 0,
      checksJson: JSON.stringify(checks),
      retried: retryCount > 0 ? 1 : 0,
      retryReason: typeof retryReason === "string" ? retryReason.slice(0, 300) : null,
      exported: 0,
    });
  };

  const variants = Array.isArray(result.feedVariants) ? result.feedVariants : [];
  const feedReviews = Array.isArray(result.feedReviews) ? result.feedReviews : [];
  variants.forEach((variant, i) => {
    push(`feed-v${i + 1}`, feedReviews[i] ?? null, variant?.artDirection ?? "");
  });
  if (result.story) {
    const story = result.story as { artDirection?: unknown };
    push("story", result.storyReview ?? null, typeof story.artDirection === "string" ? story.artDirection : "");
  }
  const slides = Array.isArray(result.carouselSlides) ? result.carouselSlides : [];
  const slideReviews = Array.isArray(result.carouselReviews) ? result.carouselReviews : [];
  slides.forEach((_, i) => {
    push(`carousel-${i + 1}`, slideReviews[i] ?? null, "");
  });
  return rows;
}

const CHECK_ADVICE: Record<string, string> = {
  safe_zones: "En story 9:16 el CTA horneado cae en la barra de respuesta: fijar titular entre 16–30% y CTA entre 68–77% de la altura.",
  fidelity: "Reforzar fidelidad antes de regenerar: geometría exacta del envase, marca y etiquetas legibles contra la foto original.",
  coherence: "La escena contradice lo que el copy afirma: alinear dirección de arte con el copy antes de regenerar.",
  dimensions: "Respetar el aspecto nativo del placement (feed/carrusel 4:5, story 9:16) sin deformar el producto.",
};

const MATERIAL_HINT = /madera|granito|superficie|fondo|material|escena|marmol|mármol|textura/i;

type Pattern = { category: string; rule: string; evidenceCount: number };

/**
 * Detección determinista de patrones sobre los learnings acumulados:
 * - checks que fallan seguido por (categoría, placement),
 * - motivos de reintento que nombran materiales/escenografía.
 * Devuelve candidatos con su conteo de evidencia.
 */
export function detectPatterns(rows: LearningRow[]): Pattern[] {
  const patterns: Pattern[] = [];
  const byKey = new Map<string, { category: string; placement: string; check: string; fail: number; total: number }>();
  for (const row of rows) {
    let checks: CheckLite[] = [];
    try {
      checks = JSON.parse(row.checksJson) as CheckLite[];
    } catch {
      continue;
    }
    for (const check of checks) {
      const key = `${row.category}‖${row.placement}‖${check.id}`;
      const entry = byKey.get(key) ?? { category: row.category, placement: row.placement, check: check.id, fail: 0, total: 0 };
      entry.total += 1;
      if (!check.passed) entry.fail += 1;
      byKey.set(key, entry);
    }
  }
  for (const entry of byKey.values()) {
    if (entry.total >= LEARNING_THRESHOLD && entry.fail / entry.total >= 0.5) {
      const advice = CHECK_ADVICE[entry.check] ?? `Revisar el check ${entry.check} en ${entry.placement}: falla en ${entry.fail}/${entry.total} piezas.`;
      patterns.push({
        category: entry.category,
        rule: `[${entry.placement}] ${advice}`,
        evidenceCount: entry.fail,
      });
    }
  }

  const materialFails = rows.filter((r) => r.retried === 1 && r.retryReason && MATERIAL_HINT.test(r.retryReason));
  const byCategory = new Map<string, number>();
  for (const row of materialFails) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1);
  }
  for (const [category, count] of byCategory) {
    if (count >= LEARNING_THRESHOLD) {
      patterns.push({
        category,
        rule: "Rotar superficie e iluminación entre piezas de la misma campaña; no repetir la misma escenografía o textura dos veces.",
        evidenceCount: count,
      });
    }
  }
  return patterns;
}

/** Persiste learnings de una campaña y promueve patrones a reglas. */
export function learnFromCampaign(
  result: CampaignResult,
  ids: { campaignId: string; projectId: string },
) {
  const inserted = insertLearnings(extractLearnings(result, ids));
  const promoted = detectPatterns(allLearnings()).map((pattern) =>
    upsertSkillRule(pattern.category, pattern.rule, pattern.evidenceCount, LEARNING_THRESHOLD),
  );
  return { learnings: inserted.length, promoted };
}

/** Arma un SKILL.md por categoría con sus reglas activas. */
export function buildSkillMarkdown(category: string, rules: Array<{ rule: string; evidenceCount: number }>): string {
  const lines = [
    `---`,
    `name: adforge-${category}`,
    `description: Reglas de dirección de arte y copy aprendidas por AdForge AI para ${categoryLabel(category)}.`,
    `---`,
    ``,
    `# Skill: ${categoryLabel(category)} — AdForge AI`,
    ``,
    `> Reglas aprendidas automáticamente de campañas reales (umbral: ${LEARNING_THRESHOLD} evidencias).`,
    `> Se inyectan en los prompts de generación cuando la categoría coincide.`,
    ``,
    `## Reglas`,
    ``,
  ];
  if (rules.length === 0) {
    lines.push(`_(Sin reglas activas todavía: se necesitan ${LEARNING_THRESHOLD} evidencias por patrón.)_`, ``);
  } else {
    rules.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.rule} _(evidencia: ${r.evidenceCount})_`);
    });
    lines.push(``);
  }
  lines.push(
    `## Cómo aplicar`,
    ``,
    `- Leer antes de planificar dirección de arte y copy para esta categoría.`,
    `- Priorizar estas reglas cuando apliquen; si una falla en la práctica, reportarla para revisión.`,
    ``,
  );
  return lines.join("\n");
}
