"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Plus, Send, SlidersHorizontal, Square, X } from "lucide-react";
import { clsx } from "clsx";
import type { Locale, Placement } from "@/lib/schema/campaign";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 4;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

export type MerchantInput = { price: string };

type ComposerBarProps = {
  files: File[];
  previewUrls: string[];
  locale: Locale;
  placements: Placement[];
  merchant: MerchantInput;
  groupMode: boolean;
  isRunning: boolean;
  error: string | null;
  onFilesChange: (files: File[]) => void;
  onLocaleChange: (locale: Locale) => void;
  onPlacementsChange: (placements: Placement[]) => void;
  onMerchantChange: (merchant: MerchantInput) => void;
  onGroupModeChange: (group: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

/**
 * Barra flotante de entrada estilo chat, fija al fondo del panel central:
 * adjuntar (+) a la izquierda, enviar a la derecha y ajustes (mercado,
 * piezas, precio, agrupar) en un popover compacto. Sin formularios largos.
 */
export function ComposerBar({
  files,
  previewUrls,
  locale,
  placements,
  merchant,
  groupMode,
  isRunning,
  error,
  onFilesChange,
  onLocaleChange,
  onPlacementsChange,
  onMerchantChange,
  onGroupModeChange,
  onSubmit,
  onCancel,
}: ComposerBarProps) {
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
          setLocalError(`Máximo ${MAX_FILES} fotos por campaña.`);
          break;
        }
        if (!ALLOWED_MIME.includes(candidate.type)) {
          setLocalError("Solo imágenes: JPG, PNG o WEBP.");
          continue;
        }
        if (candidate.size > MAX_BYTES) {
          setLocalError(`Cada foto hasta ${MAX_BYTES / 1024 / 1024} MB.`);
          continue;
        }
        next.push(candidate);
      }
      onFilesChange(next);
    },
    [files, onFilesChange],
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
                <img src={url} alt={`Producto ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onFilesChange(files.filter((_, j) => j !== i))}
                  disabled={isRunning}
                  className="absolute right-0.5 top-0.5 rounded-full bg-night/85 p-0.5 text-paper-dim backdrop-blur transition-colors hover:text-danger disabled:opacity-40"
                  aria-label={`Quitar foto ${i + 1}`}
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">Mercado</span>
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
              <legend className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">Piezas</legend>
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
                    {p === "story" ? "Story 9:16" : "Carrusel ×4"}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2.5">
              <label className="block text-xs text-paper-dim">
                <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">Precio (opcional)</span>
                <input
                  type="text"
                  value={merchant.price}
                  onChange={(e) => onMerchantChange({ price: e.target.value })}
                  placeholder="Gs. 35.000"
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
                  Flyer conjunto ({files.length})
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

        <div
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
            aria-label="Adjuntar fotos de producto"
            title="Adjuntar fotos (JPG · PNG · WEBP)"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isRunning}
            className="min-w-0 flex-1 truncate rounded-full px-2 py-2 text-left text-sm text-paper-muted transition-colors hover:text-paper-dim"
          >
            {isRunning
              ? "Generando campaña…"
              : files.length === 0
                ? "Adjuntá fotos del producto o arrastralas aquí…"
                : `${files.length}/${MAX_FILES} foto(s) lista(s) · Enter para generar`}
          </button>
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
            aria-label="Ajustes de campaña"
            title="Mercado, piezas y precio"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          {isRunning ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger transition-colors hover:bg-danger hover:text-paper"
              aria-label="Cancelar generación"
              title="Cancelar"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSend}
              className={clsx(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all",
                canSend
                  ? "bg-mint text-ink hover:bg-mint-dark hover:text-paper"
                  : "cursor-not-allowed bg-night-rule text-paper-muted",
              )}
              aria-label="Generar campaña"
              title="Generar campaña"
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
        </div>
      </div>
      <p className="mt-1 text-center font-mono text-[10px] text-paper-muted">
        La imagen final no lleva links ni botones web.
      </p>
      <p className="mt-1 text-center text-[11px] text-paper-muted">
        La foto original se envía al proveedor de IA. Antes de subirla, ocultá patentes, documentos y otros datos que no quieras compartir.
      </p>
    </div>
  );
}
