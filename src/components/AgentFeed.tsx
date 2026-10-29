"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { clsx } from "clsx";
import type { StageKey, StageTracker } from "./ProgressBar";

type Step = { key: StageKey; label: string };

const STEPS: Step[] = [
  { key: "sam", label: "🔍 Extrayendo ADN visual y segmentando con SAM 3.1..." },
  { key: "museSpark", label: "🧠 Muse Spark planificando dirección de arte y copywriting AIDA..." },
  { key: "museImage", label: "🎨 Muse Image renderizando piezas nativas en 3 planos..." },
  { key: "review", label: "👁️ Agente Crítico de Visión auditando proporciones y safe-zones..." },
];

/**
 * Feedback en vivo estilo terminal/agente autónomo: los pasos aparecen uno a
 * uno a medida que el SSE los activa, con cursor parpadeante en el paso en
 * curso y ms reales al completar. En `compact` resume en una línea.
 */
export function AgentFeed({
  tracker,
  isRunning,
  total,
  compact = false,
}: {
  tracker: StageTracker;
  isRunning: boolean;
  total?: number;
  compact?: boolean;
}) {
  const started = STEPS.filter((s) => tracker[s.key] !== "idle");
  const done = started.filter((s) => tracker[s.key] === "done").length;

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-night-rule bg-night-panel px-4 py-2.5 font-mono text-[11px] text-paper-muted">
        <Check className="h-3.5 w-3.5 shrink-0 text-mint" />
        <span className="truncate">
          ✓ {done}/{STEPS.length} agentes
          {typeof total === "number" ? ` · ${total} ms total` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-night-rule bg-night">
      <div className="flex items-center justify-between gap-2 border-b border-night-rule bg-night-panel px-4 py-2.5">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-paper-muted">
          <span className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-signal/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-mint/70" />
          </span>
          Agentes en vivo
        </span>
        <LiveElapsed isRunning={isRunning} total={total} />
      </div>
      <ol className="space-y-1 p-3 font-mono text-[12px] leading-relaxed">
        {started.length === 0 && (
          <li className="px-1 text-paper-muted">
            <span className="text-mint">›</span> Esperando envío… <span className="caret">▍</span>
          </li>
        )}
        {started.map((step) => (
          <StepRow key={step.key} step={step} state={tracker[step.key]} ms={tracker.ms[step.key]} />
        ))}
        {!isRunning && started.length > 0 && done === started.length && (
          <li className="block-in px-1 pt-1 text-mint">
            <span>›</span> ✓ Pipeline completo — revelando piezas… <span className="caret">▍</span>
          </li>
        )}
      </ol>
    </div>
  );
}

function StepRow({ step, state, ms }: { step: Step; state: StageTracker[StageKey]; ms: number }) {
  return (
    <li
      className={clsx(
        "block-in flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5",
        state === "running" && "bg-mint-soft/60 stage-sweep",
        state === "done" && "bg-transparent",
        state === "error" && "bg-danger/10",
      )}
    >
      <span className={clsx("shrink-0", state === "error" ? "text-danger" : "text-mint")}>›</span>
      {state === "running" && <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-mint" />}
      {state === "done" && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" />}
      {state === "error" && <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />}
      <span className={clsx("min-w-0 flex-1 break-words", state === "error" ? "text-danger" : "text-paper-dim")}>
        {step.label}
        {state === "running" && <span className="caret"> ▍</span>}
      </span>
      {state === "done" && ms > 0 && (
        <span className="shrink-0 text-[11px] text-paper-muted">{ms} ms</span>
      )}
    </li>
  );
}

function LiveElapsed({ isRunning, total }: { isRunning: boolean; total?: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 100);
    return () => clearInterval(timer);
  }, [isRunning]);
  return (
    <span className="shrink-0 font-mono text-[11px] text-paper-muted">
      {isRunning ? `${elapsed} ms` : typeof total === "number" ? `${total} ms total` : "listo"}
    </span>
  );
}
