import { memo } from "react";
import { Check, ChevronDown, Terminal, X } from "lucide-react";
import type { ReviewCheck, VisualReview } from "@/lib/schema/campaign";
import { REVIEW_STATUS_LABELS } from "./ReviewNotes";

const LABELS: Record<ReviewCheck["id"], string> = {
  dimensions: "Dimensiones & Aspect Ratio",
  safe_zones: "Safe Zones UI",
  fidelity: "Fidelidad de Empaque & Legibilidad",
  coherence: "Coherencia Escena-Copy",
};

/**
 * Transparencia del agente crítico sin romper la tarjeta: la vista principal
 * muestra solo badges resumidos (✓/✗ + etiqueta corta) y todo el diagnóstico
 * largo (detalles por check, motivo del reintento) vive en un audit log
 * colapsable con altura máxima y scroll, estilo consola.
 */
export const ReviewChecks = memo(function ReviewChecks({ review }: { review: VisualReview | null }) {
  if (!review || review.checks.length === 0) return null;
  const passed = review.checks.filter((c) => c.passed).length;
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-night-rule-strong bg-night px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">
          Verificación automática
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
            <span className="truncate">{LABELS[check.id]}</span>
          </li>
        ))}
      </ul>
      <details className="group mt-1.5 border-t border-night-rule-strong pt-1.5">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-paper-muted transition-colors hover:text-paper [&::-webkit-details-marker]:hidden">
          <Terminal className="h-3 w-3 shrink-0" />
          Inspección del agente
          <ChevronDown className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
          {review.retryCount > 0 && (
            <span className="ml-auto shrink-0 rounded-full border border-night-rule-strong px-1.5 py-0.5 text-[9px]">
              reintento ×{review.retryCount}
            </span>
          )}
        </summary>
        <div className="mt-1.5 max-h-60 overflow-y-auto rounded bg-night-panel/60 p-2 font-mono text-[10px] leading-relaxed">
          <ul className="space-y-1.5">
            {review.checks.map((check) => (
              <li key={check.id} className="min-w-0 break-words">
                <span className={check.passed ? "text-mint" : "text-danger"}>
                  {check.passed ? "✓" : "✗"} {LABELS[check.id]}:
                </span>{" "}
                <span className="text-paper-dim">{check.detail}</span>
              </li>
            ))}
          </ul>
          {review.retryCount > 0 && (
            <div className="mt-2 space-y-1 border-t border-night-rule-strong pt-2">
              <p className="min-w-0 break-words text-paper-dim">
                <span className="font-semibold text-paper">Motivo del reintento {review.retryCount}: </span>
                {review.retryReason ?? "corrección intentada sin motivo registrado"}
              </p>
              <p className="text-paper-muted">
                Estado final tras corrección: {REVIEW_STATUS_LABELS[review.status]}
              </p>
            </div>
          )}
        </div>
      </details>
    </div>
  );
});
