"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Plus, Send, SlidersHorizontal, Square, X } from "lucide-react";
import { clsx } from "clsx";
import type { BriefFocus, Locale, Placement } from "@/lib/schema/campaign";
import { useI18n } from "@/lib/i18n";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 4;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

const FOCUS_CHIPS: Array<{ id: BriefFocus; emoji: string }> = [
  { id: "product", emoji: "🛒" },
  { id: "promo", emoji: "🏷️" },
  { id: "personal", emoji: "👤" },
  { id: "launch", emoji: "✨" },
];

export type MerchantInput = { price: string };

type ComposerBarProps = {
  files: File[];
  previewUrls: string[];
  locale: Locale;
  placements: Placement[];
  merchant: MerchantInput;
  groupMode: boolean;
  brief: string;
  focus: BriefFocus | null;
  isRunning: boolean;
  error: string | null;
  onFilesChange: (files: File[]) => void;
  onLocaleChange: (locale: Locale) => void;
  onPlacementsChange: (placements: Placement[]) => void;
  onMerchantChange: (merchant: MerchantInput) => void;
  onGroupModeChange: (group: boolean) => void;
  onBriefChange: (brief: string) => void;
  onFocusChange: (focus: BriefFocus | null) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function ComposerBar({
  files,
  previewUrls,
  locale,
  placements,
  merchant,
  groupMode,
  brief,
  focus,
  isRunning,
  error,
  onFilesChange,
  onLocaleChange,
  onPlacementsChange,
  onMerchantChange,
  onGroupModeChange,
  onBriefChange,
  onFocusChange,
  onSubmit,
  onCancel,
}: ComposerBarProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const acceptFiles = useCallback(
    (candidates: FileList | File[] | null | undefined) => {
      setLocalError(null);
      if (!candidates || candidates.length === 0) return;
      const next = [...files];
      for (const candidate of Array.from(candidates)) {
        if (next.length >= MAX_FILES) {
          setLocalError(t.composer.errMaxFiles(MAX_FILES));
          break;
        }
        if (!ALLOWED_MIME.includes(candidate.type)) {
          setLocalError(t.composer.errAllowedMime);
          continue;
        }
        if (candidate.size > MAX_BYTES) {
          setLocalError(t.composer.errMaxMb(MAX_BYTES / 1024 / 1024));
          continue;
        }
        next.push(candidate);
      }
      onFilesChange(next);
    },
    [files, onFilesChange, t.composer],
  );

  const showError = localError ?? error;
  const canSend = files.length > 0 && !isRunning;

  return (
    <div className="sticky bottom-0 z-10 pb-1 pt-2">
      <div className="rounded-2xl border border-night-rule-strong bg-night-panel/95 shadow-2xl shadow-black/50 backdrop-blur">
        {previewUrls.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-3">
            {previewUrls.map((url, i) => (
              <div
                key={`${files[i]?.name}-${i}`}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-night-rule-strong bg-night"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={t.composer.productAlt(i + 1)} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onFilesChange(files.filter((_, j) => j !== i))}
                  disabled={isRunning}
                  className="absolute right-0.5 top-0.5 rounded-full bg-night/85 p-0.5 text-paper-dim backdrop-blur transition-colors hover:text-danger disabled:opacity-40"
                  aria-label={t.composer.removePhotoAria(i + 1)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <span className="self-center font-mono text-[10px] text-paper-muted">
              {files.length}/{MAX_FILES}
            </span>
          </div>
        )}

        {settingsOpen && !isRunning && (
          <div className="block-in mx-3 mb-1 mt-3 grid grid-cols-1 gap-3 rounded-xl border border-night-rule bg-night p-3 sm:grid-cols-3">
            <label className="block text-xs text-paper-dim">
              <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">{t.composer.market}</span>
              <select
                value={locale}
                onChange={(e) => onLocaleChange(e.target.value as Locale)}
                className="mt-1.5 w-full rounded-md border border-night-rule-strong bg-night-panel px-2 py-1.5 text-sm text-paper focus:border-mint focus:outline-none"
              >
                <option value="es">Español LATAM</option>
                <option value="pt">Português (Brasil)</option>
                <option value="en">English (US)</option>
              </select>
            </label>
            <fieldset className="text-xs text-paper-dim">
              <legend className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">{t.composer.placements}</legend>
              <div className="mt-1.5 space-y-1.5">
                <span className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked disabled className="h-3.5 w-3.5 accent-emerald-400" />
                  Feed 4:5 ×2
                </span>
                {(["story", "carousel"] as const).map((p) => (
                  <label key={p} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={placements.includes(p)}
                      onChange={(e) => onPlacementsChange(
                        e.target.checked ? [...placements, p] : placements.filter((x) => x !== p),
                      )}
                      className="h-3.5 w-3.5 accent-emerald-400"
                    />
                    {p === "story" ? "Story 9:16" : t.composer.carouselOption}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2.5">
              <label className="block text-xs text-paper-dim">
                <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">{t.composer.priceOptional}</span>
                <input
                  type="text"
                  value={merchant.price}
                  onChange={(e) => onMerchantChange({ price: e.target.value })}
                  placeholder={t.composer.pricePlaceholder}
                  maxLength={64}
                  className="mt-1.5 w-full rounded-md border border-night-rule-strong bg-night-panel px-2 py-1.5 text-sm text-paper placeholder:text-paper-muted focus:border-mint focus:outline-none"
                />
              </label>
              {files.length > 1 && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-paper-dim">
                  <input
                    type="checkbox"
                    checked={groupMode}
                    onChange={(e) => onGroupModeChange(e.target.checked)}
                    className="h-3.5 w-3.5 accent-emerald-400"
                  />
                  {t.composer.groupFlyer(files.length)}
                </label>
              )}
            </div>
          </div>
        )}

        {showError && (
          <p role="alert" className="px-4 pt-2 text-xs text-danger">
            {showError}
          </p>
        )}
        {error && !isRunning && canSend && (
          <button type="button" onClick={onSubmit} className="mx-4 mt-2 rounded border border-mint/40 px-3 py-1.5 text-xs text-mint">
            {t.composer.retryWithPhotos}
          </button>
        )}

        {!isRunning && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {FOCUS_CHIPS.map(({ id, emoji }) => {
              const active = focus === id;
              const label = t.composer.focusLabels[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onFocusChange(active ? null : id)}
                  aria-pressed={active}
                  title={label}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                    active
                      ? "border-mint/60 bg-mint-soft text-mint"
                      : "border-night-rule-strong text-paper-muted hover:border-mint/50 hover:text-paper",
                  )}
                >
                  <span aria-hidden>{emoji}</span>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isRunning) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!isRunning) acceptFiles(e.dataTransfer.files);
          }}
          className={clsx(
            "flex items-center gap-2 rounded-2xl px-2 py-2 transition-colors",
            dragging && "bg-mint-soft",
          )}
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isRunning || files.length >= MAX_FILES}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint-soft text-mint transition-colors hover:bg-mint hover:text-ink disabled:opacity-40"
            aria-label={t.composer.attachAria}
            title={t.composer.attachTitle}
          >
            <Plus className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={brief}
            onChange={(e) => onBriefChange(e.target.value)}
            disabled={isRunning}
            maxLength={280}
            placeholder={
              files.length === 0
                ? t.composer.briefPlaceholderEmpty
                : t.composer.briefPlaceholderWithFiles
            }
            aria-label={t.composer.briefAria}
            className="min-w-0 flex-1 rounded-full bg-transparent px-2 py-2 text-sm text-paper placeholder:text-paper-muted focus:outline-none disabled:opacity-60"
          />
          <span className="hidden shrink-0 font-mono text-[10px] text-paper-muted lg:inline">
            JPG·PNG·WEBP
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            disabled={isRunning}
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40",
              settingsOpen
                ? "border-mint/60 bg-mint-soft text-mint"
                : "border-night-rule-strong text-paper-muted hover:border-mint/50 hover:text-paper",
            )}
            aria-label={t.composer.settingsAria}
            title={t.composer.settingsTitle}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          {isRunning ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger transition-colors hover:bg-danger hover:text-paper"
              aria-label={t.composer.cancelAria}
              title={t.composer.cancelTitle}
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className={clsx(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all",
                canSend
                  ? "bg-mint text-ink hover:bg-mint-dark hover:text-paper"
                  : "cursor-not-allowed bg-night-rule text-paper-muted",
              )}
              aria-label={error ? t.composer.retryAria : t.composer.submitAria}
              title={error ? t.composer.retryTitle : t.composer.submitTitle}
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              acceptFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </form>
      </div>
      <p className="mt-1 text-center font-mono text-[10px] text-paper-muted">
        {t.composer.noWebLinksNote}
      </p>
      <p className="mt-1 text-center text-[11px] text-paper-muted">
        {t.composer.privacyDisclaimer}
      </p>
    </div>
  );
}
