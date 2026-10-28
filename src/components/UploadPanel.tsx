"use client";

import { useCallback, useRef, useState } from "react";
import { Image as ImageIcon, Upload, X, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import type { Locale } from "@/lib/schema/campaign";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

type UploadPanelProps = {
  file: File | null;
  previewUrl: string | null;
  locale: Locale;
  isRunning: boolean;
  error: string | null;
  onFileChange: (file: File | null) => void;
  onLocaleChange: (locale: Locale) => void;
  onSubmit: () => void;
};

export function UploadPanel({
  file,
  previewUrl,
  locale,
  isRunning,
  error,
  onFileChange,
  onLocaleChange,
  onSubmit,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const acceptFile = useCallback(
    (candidate: File | null | undefined) => {
      setLocalError(null);
      if (!candidate) {
        onFileChange(null);
        return;
      }
      if (!ALLOWED_MIME.includes(candidate.type)) {
        setLocalError("Formato no soportado. Usa JPG, PNG o WEBP.");
        return;
      }
      if (candidate.size > MAX_BYTES) {
        setLocalError(`Máximo ${MAX_BYTES / 1024 / 1024} MB.`);
        return;
      }
      onFileChange(candidate);
    },
    [onFileChange],
  );

  const showError = localError ?? error;

  return (
    <aside className="flex h-full flex-col gap-4 rounded-xl border border-night-rule bg-night-panel p-5">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-paper">
          1 · Foto cruda del producto
        </h2>
        <p className="mt-1 text-sm text-paper-muted">
          Arrastra la foto que le sacaste al producto. Nada de estudio todavía.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          acceptFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={clsx(
          "relative flex min-h-[220px] cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors",
          dragging
            ? "border-mint bg-mint-soft"
            : "border-night-rule-strong bg-night hover:border-mint/60",
        )}
      >
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Preview de la subida"
              className="h-full w-full object-contain"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                acceptFile(null);
              }}
              className="absolute right-2 top-2 rounded-full bg-night/70 p-1.5 text-paper-dim backdrop-blur transition-colors hover:bg-night-panel hover:text-danger"
              aria-label="Quitar imagen"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <ImageIcon className="h-8 w-8 text-mint" />
            <p className="text-sm text-paper-dim">
              Arrastra o haz click
              <br />
              <span className="text-xs text-paper-muted">JPG · PNG · WEBP hasta 8 MB</span>
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_MIME.join(",")}
          className="hidden"
          onChange={(e) => acceptFile(e.target.files?.[0])}
        />
      </div>

      {showError && (
        <p role="alert" className="text-sm text-danger">
          {showError}
        </p>
      )}

      <div className="mt-2">
        <label
          htmlFor="locale"
          className="block font-mono text-[11px] uppercase tracking-widest text-paper-muted"
        >
          2 · Mercado destino
        </label>
        <select
          id="locale"
          value={locale}
          onChange={(e) => onLocaleChange(e.target.value as Locale)}
          disabled={isRunning}
          className="mt-2 w-full rounded-md border border-night-rule-strong bg-night px-3 py-2 text-sm text-paper focus:border-mint focus:outline-none disabled:opacity-50"
        >
          <option value="es">Español LATAM</option>
          <option value="pt">Português (Brasil)</option>
          <option value="en">English (US)</option>
        </select>
      </div>

      <p className="text-xs leading-relaxed text-paper-muted">Generamos la campaña con posts, historias y, cuando ayude a explicar el producto, un carrusel.</p>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!file || isRunning}
        className={clsx(
          "mt-auto inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-all",
          file && !isRunning
            ? "bg-mint text-ink hover:bg-mint-dark hover:text-paper"
            : "cursor-not-allowed bg-night-rule text-paper-muted",
        )}
      >
        {isRunning ? (
          <>
            <Sparkles className="h-4 w-4 animate-spin" />
            Generando campaña…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Generar campaña
          </>
        )}
      </button>
    </aside>
  );
}
