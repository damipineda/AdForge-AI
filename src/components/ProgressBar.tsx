"use client";

import type { StageEvent } from "@/lib/schema/campaign";

export type StageState = "idle" | "running" | "done" | "error";
export type StageKey = "sam" | "museImage" | "museSpark" | "review";

export type StageTracker = {
  sam: StageState;
  museImage: StageState;
  museSpark: StageState;
  review: StageState;
  ms: Record<StageKey, number>;
  details?: Partial<Record<StageKey, string>>;
};

export function reduceStages(tracker: StageTracker, event: StageEvent): StageTracker {
  const next = { ...tracker, ms: { ...tracker.ms } };
  const status: StageState =
    event.status === "running" ? "running" : event.status === "done" ? "done" : "error";
  next[event.stage] = status;
  if (event.detail) next.details = { ...tracker.details, [event.stage]: event.detail };
  if (event.status === "done") next.ms[event.stage] = event.ms;
  return next;
}

/** A terminal failure cannot leave a stage spinning after the stream stops. */
export function failRunningStages(tracker: StageTracker, message: string): StageTracker {
  const next = { ...tracker, details: { ...tracker.details } };
  for (const stage of STAGE_ORDER) {
    if (next[stage] !== "running") continue;
    next[stage] = "error";
    next.details[stage] = message;
  }
  return next;
}

/** Orden canónico del pipeline (visión → copy → imagen → revisión). */
export const STAGE_ORDER: StageKey[] = ["sam", "museSpark", "museImage", "review"];
