import { memo } from "react";
import type { VisualReview } from "@/lib/schema/campaign";

export const REVIEW_STATUS_LABELS: Record<VisualReview["status"], string> = {
  reviewed: "Revisión automática: sin hallazgos reportados",
  needs_review: "Revisión automática: observaciones",
  unavailable: "Revisión automática no disponible",
  not_generated: "Composición local sin revisión visual IA",
};

const labels = REVIEW_STATUS_LABELS;

export const ReviewNotes = memo(function ReviewNotes({ review, title }: { review: VisualReview | null; title?: string }) {
  if (!review) return null;
  return (
    <details className="min-w-0 overflow-hidden rounded-md border border-night-rule-strong bg-night px-3 py-2 text-paper-dim">
      <summary className="cursor-pointer break-words text-xs font-semibold leading-relaxed">
        {title ? `${title} · ` : ""}{labels[review.status]}{review.retryCount ? " · corrección intentada" : ""}
      </summary>
      <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
        <p className="break-words text-xs leading-relaxed">{review.summary}</p>
        {review.issues.length > 0 && (
          <ul className="space-y-2 text-xs leading-relaxed">
            {review.issues.map((issue, index) => (
              <li key={`${issue.category}-${index}`} className="break-words">
                <span className={issue.severity === "critical" ? "font-semibold text-danger" : "font-semibold text-paper"}>
                  {issue.severity === "critical" ? "Importante" : "Revisar"}
                  {issue.affectedIndices.length ? ` · piezas ${issue.affectedIndices.join(", ")}` : ""}:
                </span>{" "}{issue.description} {issue.suggestion}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-paper-muted">La revisión automática puede equivocarse; verificá imagen, copy y condiciones antes de publicar.</p>
      </div>
    </details>
  );
});
