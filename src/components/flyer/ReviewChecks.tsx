"use client";

import { memo } from "react";
import { Check, ChevronDown, Terminal, X } from "lucide-react";
import type { VisualReview } from "@/lib/schema/campaign";
import { useI18n } from "@/lib/i18n";

export const ReviewChecks = memo(function ReviewChecks({ review }: { review: VisualReview | null }) {
  const { t } = useI18n();
  if (!review || review.checks.length === 0) return null;
  const passed = review.checks.filter((c) => c.passed).length;
  const labels = t.review.checkLabels;
  const statusLabels = t.review.statusLabels;

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-night-rule-strong bg-night px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">
          {t.review.autoVerification}
        </p>
        <span className="shrink-0 font-mono text-[10px] text-paper-muted">
          {passed}/{review.checks.length} ✓
        </span>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {review.checks.map((check) => (
          <li
            key={check.id}
            title={check.detail}
            className={
              "inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
              (check.passed
                ? "border-mint/40 bg-mint-soft text-mint"
                : "border-danger-dark/40 bg-danger/10 text-danger")
            }
          >
            {check.passed ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
            <span className="truncate">{labels[check.id]}</span>
          </li>
        ))}
      </ul>
      <details className="group mt-1.5 border-t border-night-rule-strong pt-1.5">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-paper-muted transition-colors hover:text-paper [&::-webkit-details-marker]:hidden">
          <Terminal className="h-3 w-3 shrink-0" />
          {t.review.agentInspection}
          <ChevronDown className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
          {review.retryCount > 0 && (
            <span className="ml-auto shrink-0 rounded-full border border-night-rule-strong px-1.5 py-0.5 text-[9px]">
              {t.review.retryBadge(review.retryCount)}
            </span>
          )}
        </summary>
        <div className="mt-1.5 max-h-60 overflow-y-auto rounded bg-night-panel/60 p-2 font-mono text-[10px] leading-relaxed">
          <ul className="space-y-1.5">
            {review.checks.map((check) => (
              <li key={check.id} className="min-w-0 break-words">
                <span className={check.passed ? "text-mint" : "text-danger"}>
                  {check.passed ? "✓" : "✗"} {labels[check.id]}:
                </span>{" "}
                <span className="text-paper-dim">{check.detail}</span>
              </li>
            ))}
          </ul>
          {review.retryCount > 0 && (
            <div className="mt-2 space-y-1 border-t border-night-rule-strong pt-2">
              <p className="min-w-0 break-words text-paper-dim">
                <span className="font-semibold text-paper">{t.review.retryReasonLabel(review.retryCount)}</span>
                {review.retryReason ?? t.review.retryReasonDefault}
              </p>
              <p className="text-paper-muted">
                {t.review.finalStatusAfterRetry} {statusLabels[review.status]}
              </p>
            </div>
          )}
        </div>
      </details>
    </div>
  );
});
