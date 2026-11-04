import type { VisualReview } from "@/lib/schema/campaign";
import { redactSensitiveText } from "./privacy";

/** Campaign style preferences and caption notes do not make an image unusable. */
export function isBlockingIssue(issue: VisualReview["issues"][number]): boolean {
  return issue.category === "privacy" || (issue.severity === "critical" && issue.category !== "diversity" && !/^DESCRIPCI[ÓO]N:/i.test(issue.description));
}

/** Las fallas de layout (safe zones, proporción) no se corrigen con img2img:
 * el modelo conserva la posición del titular/CTA y vuelve a fallar. Estos
 * casos deben recomponerse desde las fotos originales (modo regenerate). */
export function requiresFreshLayout(review: VisualReview | null): boolean {
  if (!review) return false;
  if (review.checks.some((check) => !check.passed && (check.id === "safe_zones" || check.id === "dimensions"))) return true;
  return review.issues.filter(isBlockingIssue).some((issue) =>
    issue.category === "typography" && /safe_?zones|zona segura|13%|87%|superior|inferior|posici[oó]n|reubicar|empieza dentro|termina dentro/i.test(`${issue.description} ${issue.suggestion}`),
  );
}

export function requiresImageCorrection(review: VisualReview | null): boolean {
  return Boolean(review && (review.issues.some(isBlockingIssue) || review.checks.some(check => !check.passed)));
}

/** Shared by new generations and saved campaigns; no additional model call. */
export function automaticCorrectionInstruction(review: VisualReview | null): string | null {
  if (!review || !requiresImageCorrection(review)) return null;
  const prefix = "Corregí SOLO estos hallazgos de la auditoría en esta pieza. Conservá el producto, copy, logo y resto del diseño salvo los ajustes indicados. ";
  const findings = review.issues.filter(isBlockingIssue).map(issue => issue.category === "privacy"
    ? "Ocultar cualquier dato sensible sin reproducirlo."
    : redactSensitiveText(`${issue.description} → ${issue.suggestion}`));
  const failedChecks = review.checks.filter(check => !check.passed).map(check => redactSensitiveText(`${check.id}: ${check.detail}`));
  const details = [...findings, ...failedChecks];
  // Reserve a fair share for every finding, so a verbose first issue cannot hide another.
  const limit = Math.floor((800-prefix.length-details.length*2)/details.length);
  return (prefix + details.map(detail => detail.slice(0,limit)).join("; ")).slice(0,800);
}

/** Failed checks must not silently pass just because the VLM omitted issues. */
export function enforceReviewChecks(review: VisualReview): VisualReview {
  const mappings = {
    dimensions: ["composition", "Corregir la proporción nativa solicitada."],
    safe_zones: ["typography", "Reubicar titular y CTA dentro de las zonas seguras, lejos de la interfaz."],
    fidelity: ["product", "Restaurar envase, etiqueta y proporciones según las fotos originales."],
    coherence: ["scene", "Corregir la incoherencia entre escena, producto y copy."],
  } as const;
  for (const check of review.checks.filter(c => !c.passed)) {
    const [category, suggestion] = mappings[check.id];
    if (review.issues.some(i => i.category === category && i.severity === "critical")) continue;
    review.issues = [{ category, severity: "critical" as const, description: `${check.id}: ${check.detail}`.slice(0,300), suggestion, affectedIndices: [] }, ...review.issues].slice(0,8);
  }
  if (review.status === "reviewed" && review.issues.length) review.status = "needs_review";
  return review;
}

export function correctionReport(before: VisualReview, after: VisualReview, accepted: boolean): NonNullable<VisualReview["correctionReport"]> {
  const safe = (issue: VisualReview["issues"][number]) => issue.category === "privacy" ? "Ocultar datos sensibles." : redactSensitiveText(issue.description).slice(0,300);
  return {
    outcome: accepted ? "corrected" : after.status === "unavailable" ? "unavailable" : "unresolved",
    attempted: before.issues.map(safe).slice(0,8),
    // Only report improvements in the image actually delivered, never a rejected candidate.
    verified: accepted ? before.issues.filter(i => !after.issues.some(j => j.category === i.category)).map(safe).slice(0,8) : [],
    pending: (accepted ? after : before).issues.map(safe).slice(0,8),
  };
}
