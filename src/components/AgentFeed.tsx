"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { clsx } from "clsx";
import type { StageKey, StageTracker } from "./ProgressBar";
import { useI18n } from "@/lib/i18n";

type Step = { key: StageKey; label: string };

const STEP_KEYS: StageKey[] = ["sam", "museSpark", "museImage", "review"];

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
  const { t } = useI18n();
  const steps: Step[] = STEP_KEYS.map((key) => ({ key, label: t.agentFeed.steps[key] }));
  const started = steps.filter((s) => tracker[s.key] !== "idle");
  const done = started.filter((s) => tracker[s.key] === "done").length;
  const failed = started.some((s) => tracker[s.key] === "error");

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-night-rule bg-night-panel px-4 py-2.5 font-mono text-[11px] text-paper-muted">
        {failed ? <X className="h-3.5 w-3.5 shrink-0 text-danger" /> : <Check className="h-3.5 w-3.5 shrink-0 text-mint" />}
        <span className="truncate">
          {failed ? t.agentFeed.failedCompact : t.agentFeed.agentsDoneCompact(done, steps.length)}
          {typeof total === "number" ? ` · ${t.agentFeed.totalMs(total)}` : ""}
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
          {t.agentFeed.liveHeader}
        </span>
        <LiveElapsed isRunning={isRunning} total={total} failed={failed} />
      </div>
      <ol className="space-y-1 p-3 font-mono text-[12px] leading-relaxed">
        {started.length === 0 && (
          <li className="px-1 text-paper-muted">
            <span className="text-mint">›</span> {t.agentFeed.waiting} <span className="caret">▍</span>
          </li>
        )}
        {started.map((step) => (
          <StepRow key={step.key} step={step} state={tracker[step.key]} ms={tracker.ms[step.key]} detail={tracker.details?.[step.key]} />
        ))}
        {!isRunning && started.length > 0 && done === started.length && (
          <li className="block-in px-1 pt-1 text-mint">
            <span>›</span> {t.agentFeed.complete} <span className="caret">▍</span>
          </li>
        )}
      </ol>
    </div>
  );
}

function StepRow({ step, state, ms, detail }: { step: Step; state: StageTracker[StageKey]; ms: number; detail?: string }) {
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
        {detail ?? step.label}
        {state === "running" && <span className="caret"> ▍</span>}
      </span>
      {state === "done" && ms > 0 && (
        <span className="shrink-0 text-[11px] text-paper-muted">{ms} ms</span>
      )}
    </li>
  );
}

function LiveElapsed({ isRunning, total, failed }: { isRunning: boolean; total?: number; failed: boolean }) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 100);
    return () => clearInterval(timer);
  }, [isRunning]);
  return (
    <span className="shrink-0 font-mono text-[11px] text-paper-muted">
      {isRunning
        ? `${elapsed} ms`
        : failed
          ? t.agentFeed.failedRetry
          : typeof total === "number"
            ? t.agentFeed.totalMs(total)
            : t.agentFeed.stopped}
    </span>
  );
}
