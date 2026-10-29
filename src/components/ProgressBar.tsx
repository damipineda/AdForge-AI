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
};

export function reduceStages(tracker: StageTracker, event: StageEvent): StageTracker {
  const next = { ...tracker, ms: { ...tracker.ms } };
  const status: StageState =
    event.status === "running" ? "running" : event.status === "done" ? "done" : "error";
  next[event.stage] = status;
  if (event.status === "done") next.ms[event.stage] = event.ms;
  return next;
}

/** Orden canónico del pipeline (visión → copy → imagen → revisión). */
export const STAGE_ORDER: StageKey[] = ["sam", "museSpark", "museImage", "review"];
