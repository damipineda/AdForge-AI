"use client";

import { memo } from "react";
import type { VisualReview } from "@/lib/schema/campaign";
import { requiresImageCorrection } from "@/lib/pipeline/review-policy";
import { useI18n } from "@/lib/i18n";

export const REVIEW_STATUS_LABELS: Record<VisualReview["status"], string> = {
  reviewed: "Revisión automática: sin hallazgos reportados",
  needs_review: "Revisión automática: observaciones",
  unavailable: "Revisión automática no disponible",
  not_generated: "Composición local sin revisión visual IA",
};

export const ReviewNotes = memo(function ReviewNotes({ review, title }: { review: VisualReview | null; title?: string }) {
  const { t } = useI18n();
  if (!review) return null;
  const labels = t.review.statusLabels;

  return (
    <>
      {review.correctionReport && (
        <div className="space-y-2 rounded-md border border-night-rule-strong bg-night p-3 text-xs text-paper-dim">
          <p className="font-semibold text-paper">{t.review.correctionReportTitle(review.retryCount)}</p>
          <p>
            {review.correctionReport.outcome === "corrected"
              ? t.review.outcomeCorrected
              : !requiresImageCorrection(review)
                ? t.review.outcomeOptional
                : review.correctionReport.outcome === "unavailable"
                  ? t.review.outcomeUnavailable
                  : t.review.outcomePending}
          </p>
          {(
            [
              [t.review.attemptedLabel, review.correctionReport.attempted],
              [t.review.verifiedLabel, review.correctionReport.verified],
              [t.review.pendingLabel, review.correctionReport.pending],
            ] as const
          ).map(
            ([label, items]) =>
              items.length > 0 && (
                <div key={label}>
                  <p className="font-semibold">{label}</p>
                  <ul className="list-disc space-y-1 pl-4">
                    {items.map((item, index) => (
                      <li className="break-words" key={index}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
        </div>
      )}
      <details className="min-w-0 overflow-hidden rounded-md border border-night-rule-strong bg-night px-3 py-2 text-paper-dim">
        <summary className="cursor-pointer break-words text-xs font-semibold leading-relaxed">
          {title ? `${title} · ` : ""}
          {labels[review.status]}
          {review.retryCount ? t.review.correctionAttemptedSuffix : ""}
        </summary>
        <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
          <p className="break-words text-xs leading-relaxed">{review.summary}</p>
          {review.issues.length > 0 && (
            <ul className="space-y-2 text-xs leading-relaxed">
              {review.issues.map((issue, index) => (
                <li key={`${issue.category}-${index}`} className="break-words">
                  <span className={issue.severity === "critical" ? "font-semibold text-danger" : "font-semibold text-paper"}>
                    {issue.category === "diversity"
                      ? t.review.designSuggestion
                      : issue.severity === "critical"
                        ? t.review.important
                        : t.review.reviewIssue}
                    {issue.affectedIndices.length ? t.review.piecesAffected(issue.affectedIndices) : ""}:
                  </span>{" "}
                  {issue.description} {issue.suggestion}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-paper-muted">{t.review.disclaimer}</p>
        </div>
      </details>
    </>
  );
});
