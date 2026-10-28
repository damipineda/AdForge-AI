"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CampaignResult, Locale, StageEvent } from "@/lib/schema/campaign";
import type { Provider } from "@/lib/pipeline";
import { streamCampaign } from "@/lib/sse-client";
import { UploadPanel } from "./UploadPanel";
import { ProgressBar, reduceStages, type StageTracker } from "./ProgressBar";
import { ResultsTabs } from "./ResultsTabs";
import { TopBar } from "./TopBar";

const IDLE_TRACKER: StageTracker = {
  sam: "idle",
  museImage: "idle",
  museSpark: "idle",
  review: "idle",
  ms: { sam: 0, museImage: 0, museSpark: 0, review: 0 },
};

export function Dashboard({ provider }: { provider: Provider }) {
  const [file, setFile] = useState<File | null>(null);
  const [locale, setLocale] = useState<Locale>("es");
  const [isRunning, setIsRunning] = useState(false);
  const [tracker, setTracker] = useState<StageTracker>(IDLE_TRACKER);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = useCallback((next: File | null) => {
    setFile(next);
    setError(null);
    setResult(null);
    setTracker(IDLE_TRACKER);
  }, []);

  const handleLocaleChange = useCallback((next: Locale) => {
    setLocale(next);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setError(null);
    setResult(null);
    setTracker(IDLE_TRACKER);

    try {
      for await (const event of streamCampaign(file, locale, "post", controller.signal)) {
        if (event.kind === "stage") {
          setTracker((prev) => reduceStages(prev, event.payload as StageEvent));
        } else if (event.kind === "result") {
          setResult(event.payload);
        } else if (event.kind === "error") {
          setError(event.payload.message);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Fallo inesperado en el pipeline.");
    } finally {
      setIsRunning(false);
    }
  }, [file, locale]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col night-glow">
      <TopBar provider={provider} />
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 p-4 sm:p-5 md:p-6 lg:flex-row">
        <div className="w-full shrink-0 lg:w-[340px]">
          <UploadPanel
            file={file}
            previewUrl={previewUrl}
            locale={locale}
            isRunning={isRunning}
            error={error}
            onFileChange={handleFileChange}
            onLocaleChange={handleLocaleChange}
            onSubmit={handleSubmit}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <ProgressBar tracker={tracker} total={result?.timings.total} format={result?.format} />
          <ResultsTabs result={result} previewUrl={previewUrl} />
        </div>
      </main>
      <footer className="border-t border-night-rule/60 bg-night px-6 py-3">
        <p className="mx-auto max-w-[1400px] font-mono text-[10px] uppercase tracking-widest text-paper-muted">
          AdForge AI · Cerebral Valley Hackathon · Meta Model API
          {result && (
            <>
              {" "}
              · SKU {result.skuId} · {result.timings.total} ms
            </>
          )}
        </p>
      </footer>
    </div>
  );
}
