import type { VisualReview } from "@/lib/schema/campaign";

const labels: Record<VisualReview["status"], string> = {
  reviewed: "Revisión automática: sin hallazgos reportados",
  needs_review: "Revisión automática: observaciones",
  unavailable: "Revisión automática no disponible",
  not_generated: "Composición local sin revisión visual IA",
};

export function ReviewNotes({ review, title }: { review: VisualReview; title?: string }) {
  return (
    <details className="rounded-md border border-night-rule-strong bg-night px-3 py-2 text-paper-dim">
      <summary className="cursor-pointer text-xs font-semibold leading-relaxed">
        {title ? `${title} · ` : ""}{labels[review.status]}{review.retryCount ? " · corrección intentada" : ""}
      </summary>
      <p className="mt-2 text-xs leading-relaxed">{review.summary}</p>
      {review.issues.length > 0 && (
        <ul className="mt-2 space-y-2 text-xs leading-relaxed">
          {review.issues.map((issue, index) => (
            <li key={`${issue.category}-${index}`}>
              <span className={issue.severity === "critical" ? "font-semibold text-danger" : "font-semibold text-paper"}>
                {issue.severity === "critical" ? "Importante" : "Revisar"}
                {issue.affectedIndices.length ? ` · piezas ${issue.affectedIndices.join(", ")}` : ""}:
              </span>{" "}{issue.description} {issue.suggestion}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-paper-muted">La revisión automática puede equivocarse; verificá imagen, copy y condiciones antes de publicar.</p>
    </details>
  );
}
