"use client";

import { clsx } from "clsx";
import { Check, LoaderCircle, CircleDashed } from "lucide-react";
import type { StageEvent } from "@/lib/schema/campaign";

export type StageState = "idle" | "running" | "done" | "error";
export type StageKey = "sam" | "museImage" | "museSpark" | "review";

export type StageTracker = {
  sam: StageState;
  museImage: StageState;
  museSpark: StageState;
  review: StageState;
  ms: Record<StageKey, number>;
};

export function reduceStages(tracker: StageTracker, event: StageEvent): StageTracker {
  const next = { ...tracker, ms: { ...tracker.ms } };
  const status: StageState =
    event.status === "running" ? "running" : event.status === "done" ? "done" : "error";
  next[event.stage] = status;
  if (event.status === "done") next.ms[event.stage] = event.ms;
  return next;
}

const LABEL: Record<StageKey, string> = {
  sam: "Muse Spark · Visión del producto",
  museImage: "Muse Image · Generando pósters",
  museSpark: "Muse Spark · Generando campaña",
  review: "Revisión visual y correcciones",
};

const ORDER: StageKey[] = ["sam", "museSpark", "museImage", "review"];

export function ProgressBar({
  tracker,
  total,
  format,
}: {
  tracker: StageTracker;
  total?: number;
  format?: "post" | "story" | "carousel";
}) {
  const order: Array<StageKey> = ORDER;
  return (
    <div className="rounded-xl border border-night-rule bg-night-panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-paper-muted">
          Pipeline en vivo
        </h3>
        {typeof total === "number" && (
          <span className="font-mono text-xs text-mint">{total} ms total</span>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {order.map((key) => (
          <StagePill key={key} state={tracker[key]} label={key === "museImage" && format === "carousel" ? "Componiendo carrusel local" : LABEL[key]} ms={tracker.ms[key]} />
        ))}
      </ol>
    </div>
  );
}

function StagePill({
  state,
  label,
  ms,
}: {
  state: StageState;
  label: string;
  ms: number;
}) {
  const Icon = state === "running" ? LoaderCircle : state === "done" ? Check : state === "error" ? Check : CircleDashed;
  return (
    <li
      className={clsx(
        "relative flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
        state === "running" && "border-mint/60 bg-mint-soft text-mint stage-sweep",
        state === "done" && "border-mint-dark/40 bg-night-panel-elevated text-mint",
        state === "error" && "border-danger-dark/40 bg-danger/10 text-danger",
        state === "idle" && "border-night-rule bg-night text-paper-muted",
      )}
    >
      <Icon className={clsx("h-4 w-4 shrink-0", state === "running" && "animate-spin")} />
      <span className="flex-1 truncate font-mono text-[11px] uppercase tracking-wider">
        {label}
      </span>
      {state === "done" && ms > 0 && (
        <span className="font-mono text-[10px] text-paper-muted">{ms} ms</span>
      )}
    </li>
  );
}
