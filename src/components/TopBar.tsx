"use client";

import { useState } from "react";
import { Check, Compass, Eye, EyeOff, KeyRound, Languages, Loader2, Trash2, X } from "lucide-react";
import type { Provider } from "@/lib/pipeline";
import type { ApiKeySettings } from "@/lib/store/client";
import { useI18n } from "@/lib/i18n";

type TopBarProps = {
  provider: Provider;
  apiKeySettings?: ApiKeySettings | null;
  onSaveApiKey?: (key: string) => Promise<ApiKeySettings>;
  onClearApiKey?: () => Promise<ApiKeySettings>;
  onStartTour?: () => void;
};

export function TopBar({ provider, apiKeySettings, onSaveApiKey, onClearApiKey, onStartTour }: TopBarProps) {
  const { lang, setLang, t } = useI18n();
  const [modalOpen, setModalOpen] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const effectiveProvider = apiKeySettings?.provider ?? provider;
  const configured = apiKeySettings?.configured ?? effectiveProvider === "meta";
  const badge =
    effectiveProvider === "meta"
      ? { tone: "signal" as const, label: t.topBar.liveBadge }
      : { tone: "mint" as const, label: t.topBar.demoBadge };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveApiKey || !draftKey.trim() || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await onSaveApiKey(draftKey.trim());
      setDraftKey("");
      setFeedback(updated.verified ? t.apiKey.verifiedOk : t.apiKey.savedToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!onClearApiKey || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await onClearApiKey();
      setFeedback(t.apiKey.clearedToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="border-b border-night-rule/70 bg-night/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl font-semibold tracking-tight text-paper">
              AdForge<span className="text-mint"> AI</span>
            </span>
            <span className="hidden text-sm text-paper-muted lg:inline">
              {t.topBar.subtitle}
            </span>
          </div>

          <div data-tour="topbar-controls" className="flex flex-wrap items-center gap-2 sm:gap-3">
            {onStartTour && (
              <button
                type="button"
                onClick={onStartTour}
                title={t.topBar.tourTitle}
                className="inline-flex items-center gap-1.5 rounded-full border border-night-rule-strong bg-night-panel px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-paper-dim transition-colors hover:border-mint/60 hover:bg-mint-soft hover:text-mint"
              >
                <Compass className="h-3.5 w-3.5 text-mint" />
                <span>{t.topBar.tourButton}</span>
              </button>
            )}
            <div
              className="inline-flex items-center rounded-full border border-night-rule-strong bg-night-panel p-0.5 font-mono text-[11px]"
              role="group"
              aria-label={t.topBar.langLabel}
            >
              <Languages className="ml-2 mr-1 h-3.5 w-3.5 text-paper-muted" />
              {(["es", "en"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  className={`rounded-full px-2.5 py-0.5 uppercase tracking-wider transition-colors ${
                    lang === code
                      ? "bg-mint text-ink font-semibold"
                      : "text-paper-muted hover:text-paper"
                  }`}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>

            {onSaveApiKey && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setFeedback(null);
                  setModalOpen(true);
                }}
                title={configured ? t.topBar.apiKeyConfiguredTitle : t.topBar.apiKeyMissingTitle}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  configured
                    ? "border-mint/40 bg-mint-soft text-mint hover:bg-mint hover:text-ink"
                    : "border-amber-400/50 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                }`}
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{t.topBar.apiKeyButton}</span>
                {apiKeySettings?.maskedKey && (
                  <span className="hidden text-[10px] opacity-80 sm:inline">
                    ({apiKeySettings.maskedKey})
                  </span>
                )}
              </button>
            )}

            <Badge tone={badge.tone} label={badge.label} dot />
            <span className="hidden font-mono text-xs text-paper-muted xl:inline">
              muse-spark-1.3 · muse-image-1.0
            </span>
          </div>
        </div>
      </header>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-night-rule-strong bg-night-panel p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-paper">
                  <KeyRound className="h-4 w-4 text-mint" />
                  {t.apiKey.modalTitle}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-paper-muted">
                  {t.apiKey.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md p-1 text-paper-muted hover:bg-night hover:text-paper"
                aria-label={t.apiKey.closeButton}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg border border-night-rule bg-night px-3 py-2 font-mono text-[11px]">
              <span className={configured ? "text-mint" : "text-amber-300"}>
                ●{" "}
                {apiKeySettings?.source === "ui"
                  ? t.apiKey.statusActiveUi
                  : apiKeySettings?.source === "env"
                    ? t.apiKey.statusActiveEnv
                    : t.apiKey.statusMissing}
              </span>
              {apiKeySettings?.maskedKey && (
                <span className="text-paper-dim">{apiKeySettings.maskedKey}</span>
              )}
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-3">
              <label className="block text-xs text-paper-dim">
                <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">
                  {t.apiKey.inputLabel}
                </span>
                <div className="relative mt-1.5 flex items-center">
                  <input
                    type={showKey ? "text" : "password"}
                    value={draftKey}
                    onChange={(e) => setDraftKey(e.target.value)}
                    placeholder={t.apiKey.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-lg border border-night-rule-strong bg-night py-2 pl-3 pr-9 font-mono text-xs text-paper placeholder:text-paper-muted focus:border-mint focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 rounded p-1 text-paper-muted hover:text-paper"
                    aria-label={showKey ? t.apiKey.hideKey : t.apiKey.showKey}
                    title={showKey ? t.apiKey.hideKey : t.apiKey.showKey}
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </label>

              {error && (
                <p role="alert" className="text-xs text-danger">
                  {error}
                </p>
              )}
              {feedback && (
                <p role="status" className="flex items-center gap-1.5 text-xs text-mint">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  {feedback}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {apiKeySettings?.source === "ui" ? (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-danger-dark/50 bg-danger/10 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-danger transition-colors hover:bg-danger hover:text-paper disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.apiKey.clearButton}
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-lg border border-night-rule-strong px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-paper-muted hover:text-paper"
                  >
                    {t.apiKey.closeButton}
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !draftKey.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-mint/50 bg-mint px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-mint-dark hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                    {busy ? t.apiKey.savingButton : t.apiKey.saveButton}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Badge({
  tone,
  label,
  dot,
}: {
  tone: "mint" | "signal";
  label: string;
  dot?: boolean;
}) {
  const color = tone === "mint" ? "text-mint" : "text-signal";
  const bg = tone === "mint" ? "bg-mint-soft" : "bg-signal/10";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-night-rule-strong px-3 py-1 font-mono text-[11px] uppercase tracking-widest ${bg} ${color}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${tone === "mint" ? "bg-mint" : "bg-signal"} animate-pulse`}
        />
      )}
      {label}
    </span>
  );
}
