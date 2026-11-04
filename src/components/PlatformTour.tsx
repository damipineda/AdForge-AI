"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Compass, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type PlatformTourProps = {
  open: boolean;
  onClose: () => void;
  onStepTarget?: (target: string) => void;
};

export function PlatformTour({ open, onClose, onStepTarget }: PlatformTourProps) {
  const { t } = useI18n();
  const steps = t.tour.steps;
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });

  const currentStep = steps[stepIndex] ?? steps[0];

  const measure = useCallback(() => {
    if (!open || typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setViewport({ w: vw, h: vh });
    const el = document.querySelector<HTMLElement>(`[data-tour="${currentStep.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 6;
    setRect({
      top: Math.max(4, r.top - pad),
      left: Math.max(4, r.left - pad),
      width: Math.min(vw - 8, r.width + pad * 2),
      height: Math.min(vh - 8, r.height + pad * 2),
    });
  }, [open, currentStep]);

  useEffect(() => {
    if (!open) return;
    onStepTarget?.(currentStep.target);
    const el = document.querySelector<HTMLElement>(`[data-tour="${currentStep.target}"]`);
    if (el) {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      } catch {
        /* ignore scroll errors */
      }
    }
    const t1 = window.setTimeout(measure, 40);
    const t2 = window.setTimeout(measure, 220);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, stepIndex, currentStep, measure, onStepTarget]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        setStepIndex((i) => (i + 1 < steps.length ? i + 1 : i));
      } else if (e.key === "ArrowLeft") {
        setStepIndex((i) => (i > 0 ? i - 1 : i));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length, onClose]);

  if (!open) return null;

  const cardW = Math.min(360, viewport.w - 24);
  const cardH = 220;
  let cardTop = Math.round((viewport.h - cardH) / 2);
  let cardLeft = Math.round((viewport.w - cardW) / 2);

  if (rect) {
    const spaceRight = viewport.w - (rect.left + rect.width);
    const spaceLeft = rect.left;
    const spaceTop = rect.top;
    const spaceBottom = viewport.h - (rect.top + rect.height);

    if (spaceRight >= cardW + 24) {
      cardLeft = rect.left + rect.width + 16;
      cardTop = Math.min(Math.max(16, rect.top + 16), viewport.h - cardH - 16);
    } else if (spaceLeft >= cardW + 24) {
      cardLeft = rect.left - cardW - 16;
      cardTop = Math.min(Math.max(16, rect.top + 16), viewport.h - cardH - 16);
    } else if (spaceTop >= cardH + 24) {
      cardTop = rect.top - cardH - 16;
      cardLeft = Math.min(Math.max(16, rect.left + (rect.width - cardW) / 2), viewport.w - cardW - 16);
    } else if (spaceBottom >= cardH + 24) {
      cardTop = rect.top + rect.height + 16;
      cardLeft = Math.min(Math.max(16, rect.left + (rect.width - cardW) / 2), viewport.w - cardW - 16);
    } else {
      cardTop = Math.max(16, Math.min(viewport.h - cardH - 16, rect.top + 24));
      cardLeft = Math.max(16, Math.min(viewport.w - cardW - 16, (viewport.w - cardW) / 2));
    }
  }

  const isLast = stepIndex === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={currentStep.title}
    >
      <svg
        className="pointer-events-auto fixed inset-0 h-full w-full"
        onClick={onClose}
      >
        <defs>
          <mask id="adforge-tour-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx="14"
                ry="14"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(5, 10, 8, 0.76)"
          mask="url(#adforge-tour-spotlight)"
        />
      </svg>

      {rect && (
        <div
          className="pointer-events-none fixed rounded-[14px] border-2 border-mint shadow-[0_0_0_4px_rgba(46,229,157,0.18),0_0_28px_rgba(46,229,157,0.35)] transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      <div
        className="fixed z-10 rounded-2xl border border-mint/50 bg-night-panel p-4 shadow-2xl transition-all duration-200"
        style={{
          top: cardTop,
          left: cardLeft,
          width: cardW,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-soft px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-mint">
            <Compass className="h-3 w-3" />
            {t.tour.stepOf(stepIndex + 1, steps.length)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-paper-muted transition-colors hover:bg-night hover:text-paper"
            aria-label={t.tour.skip}
            title={t.tour.skip}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="mt-2.5 font-display text-base font-semibold text-paper">
          {currentStep.title}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-paper-dim">
          {currentStep.description}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-night-rule pt-3">
          <div className="flex items-center gap-1">
            {steps.map((s, idx) => (
              <button
                key={s.target}
                type="button"
                onClick={() => setStepIndex(idx)}
                aria-label={`${idx + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  idx === stepIndex
                    ? "w-5 bg-mint"
                    : "w-1.5 bg-night-rule-strong hover:bg-paper-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-night-rule-strong bg-night px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper-dim transition-colors hover:border-paper-muted hover:text-paper"
              >
                <ChevronLeft className="h-3 w-3" />
                {t.tour.prev}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  onClose();
                } else {
                  setStepIndex((i) => Math.min(steps.length - 1, i + 1));
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-mint/50 bg-mint px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-mint-dark hover:text-paper"
            >
              {isLast ? t.tour.finish : t.tour.next}
              {!isLast && <ChevronRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
