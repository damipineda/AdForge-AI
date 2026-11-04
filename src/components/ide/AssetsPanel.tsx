"use client";

import { useRef, useState } from "react";
import { BrainCircuit, Check, ChevronDown, ChevronRight, Download, Eye, EyeOff, FileDown, ImagePlus, Images, KeyRound, Loader2, Palette, Trash2, Upload, X } from "lucide-react";
import { assetMeta, store, type ApiKeySettings, type Asset, type BrandKit, type SkillRule } from "@/lib/store/client";
import { useI18n } from "@/lib/i18n";

type SectionKey = "apiKey" | "brandKit" | "sources" | "generated" | "skill";

type AssetsPanelProps = {
  sources: Asset[];
  flyers: Asset[];
  collapsed: boolean;
  saving: boolean;
  onToggleCollapse: () => void;
  onReuseSource: (asset: Asset) => void;
  skills: SkillRule[];
  skillThreshold: number;
  learningsTotal: number;
  brandKit: BrandKit | null;
  brandLogoUrl: string | null;
  onSaveBrand: (kit: { name: string; primaryColor: string; secondaryColor: string; accentColor: string; logoAssetId: string | null; logoPosition: "auto" | "left" | "right" }) => Promise<void>;
  onUploadLogo: (file: File) => Promise<Asset | null>;
  apiKeySettings?: ApiKeySettings | null;
  onSaveApiKey?: (key: string) => Promise<ApiKeySettings>;
  onClearApiKey?: () => Promise<ApiKeySettings>;
};

function SectionTitle({
  children,
  count,
  open = true,
  onToggle,
  statusDot,
}: {
  children: string;
  count?: number;
  open?: boolean;
  onToggle?: () => void;
  statusDot?: "mint" | "amber" | null;
}) {
  const { t } = useI18n();
  if (!onToggle) {
    return (
      <p className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-paper-muted">
        <span>{children}</span>
        {typeof count === "number" && <span>{count}</span>}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={t.assetsPanel.toggleSectionAria(children)}
      className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left font-mono text-[11px] uppercase tracking-widest text-paper-muted transition-colors hover:bg-night hover:text-paper"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-mint" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-paper-muted" />
        )}
        <span className="truncate">{children}</span>
        {statusDot && (
          <span
            className={
              statusDot === "mint"
                ? "h-1.5 w-1.5 shrink-0 rounded-full bg-mint"
                : "h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
            }
          />
        )}
      </span>
      {typeof count === "number" && (
        <span className="shrink-0 rounded-full bg-night px-1.5 py-0.5 text-[10px] text-paper-muted">
          {count}
        </span>
      )}
    </button>
  );
}

export function AssetsPanel({
  sources,
  flyers,
  collapsed,
  saving,
  onToggleCollapse,
  onReuseSource,
  skills,
  skillThreshold,
  learningsTotal,
  brandKit,
  brandLogoUrl,
  onSaveBrand,
  onUploadLogo,
  apiKeySettings,
  onSaveApiKey,
  onClearApiKey,
}: AssetsPanelProps) {
  const { t } = useI18n();
  const [exporting, setExporting] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    apiKey: true,
    brandKit: true,
    sources: true,
    generated: true,
    skill: true,
  });

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const anyOpen = Object.values(openSections).some(Boolean);
  const toggleAllSections = () => {
    const next = !anyOpen;
    setOpenSections({
      apiKey: next,
      brandKit: next,
      sources: next,
      generated: next,
      skill: next,
    });
  };
  const byCategory = new Map<string, SkillRule[]>();
  for (const rule of skills) {
    const list = byCategory.get(rule.category) ?? [];
    list.push(rule);
    byCategory.set(rule.category, list);
  }
  const activeCount = skills.filter((s) => s.status === "active").length;

  const downloadSkill = async (category: string) => {
    setExporting(category);
    try {
      const exported = await store.exportSkill(category);
      const blob = new Blob([exported.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exported.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  if (collapsed) {
    return (
      <div
        data-tour="assets-library"
        className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-l border-night-rule bg-night-panel py-3"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-md p-2 text-paper-muted transition-colors hover:bg-night hover:text-paper"
          aria-label={t.assetsPanel.expandAria}
          title={t.assetsPanel.expandTitle}
        >
          <Images className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside
      data-tour="assets-library"
      className="flex h-full w-72 shrink-0 flex-col border-l border-night-rule bg-night-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-night-rule px-3 py-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-paper-muted">
          {t.assetsPanel.title}
          {saving && <Loader2 className="h-3 w-3 animate-spin text-mint" />}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleAllSections}
            className="rounded-md px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-paper-muted transition-colors hover:bg-night hover:text-paper"
            title={anyOpen ? t.assetsPanel.collapseAllSections : t.assetsPanel.expandAllSections}
          >
            {anyOpen ? t.assetsPanel.collapseAllSections : t.assetsPanel.expandAllSections}
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-md p-1.5 font-mono text-xs text-paper-muted transition-colors hover:bg-night hover:text-paper"
            aria-label={t.projectsPanel.collapseAria}
            title={t.projectsPanel.collapseTitle}
          >
            »
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {onSaveApiKey && (
          <MetaApiKeySection
            settings={apiKeySettings ?? null}
            onSaveApiKey={onSaveApiKey}
            onClearApiKey={onClearApiKey}
            open={openSections.apiKey}
            onToggle={() => toggleSection("apiKey")}
          />
        )}
        <BrandKitSection
          key={brandKit ? `${brandKit.id}:${brandKit.updatedAt}` : "none"}
          brandKit={brandKit}
          brandLogoUrl={brandLogoUrl}
          onSaveBrand={onSaveBrand}
          onUploadLogo={onUploadLogo}
          open={openSections.brandKit}
          onToggle={() => toggleSection("brandKit")}
        />
        <section className="min-w-0 border-t border-night-rule/60 pt-2">
          <SectionTitle
            count={sources.length}
            open={openSections.sources}
            onToggle={() => toggleSection("sources")}
          >
            {t.assetsPanel.sourcesTitle}
          </SectionTitle>
          {openSections.sources && (
            <div className="mt-1.5">
              <p className="mb-2 text-[11px] leading-relaxed text-paper-muted">
                {t.assetsPanel.sourcesDesc}
              </p>
              {sources.length === 0 && (
                <p className="rounded-md border border-dashed border-night-rule-strong px-2 py-3 text-center text-[11px] text-paper-muted">
                  {t.assetsPanel.sourcesEmpty}
                </p>
              )}
              <ul className="grid grid-cols-2 gap-2">
                {sources.map((asset) => {
                  const meta = assetMeta(asset);
                  return (
                    <li key={asset.id} className="group relative min-w-0 overflow-hidden rounded-lg border border-night-rule-strong bg-night">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.url} alt={meta.filename ?? "Source"} className="h-24 w-full object-cover" loading="lazy" />
                      <button
                        type="button"
                        onClick={() => onReuseSource(asset)}
                        className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-night/85 px-1 py-1 font-mono text-[10px] uppercase tracking-wider text-mint opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
                        title={t.assetsPanel.toCanvasTitle}
                      >
                        <ImagePlus className="h-3 w-3" />
                        {t.assetsPanel.toCanvas}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="min-w-0 border-t border-night-rule/60 pt-2">
          <SectionTitle
            count={flyers.length}
            open={openSections.generated}
            onToggle={() => toggleSection("generated")}
          >
            {t.assetsPanel.generatedTitle}
          </SectionTitle>
          {openSections.generated && (
            <div className="mt-1.5">
              <p className="mb-2 text-[11px] leading-relaxed text-paper-muted">
                {t.assetsPanel.generatedDesc}
              </p>
              {flyers.length === 0 && (
                <p className="rounded-md border border-dashed border-night-rule-strong px-2 py-3 text-center text-[11px] text-paper-muted">
                  {t.assetsPanel.generatedEmpty}
                </p>
              )}
              <ul className="space-y-2">
                {flyers.map((asset) => {
                  const meta = assetMeta(asset);
                  const filename = meta.filename ?? `${asset.type}.png`;
                  return (
                    <li key={asset.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-night-rule bg-night p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.url} alt={filename} className="h-14 w-11 shrink-0 rounded border border-night-rule-strong object-cover" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[11px] text-paper-dim">{filename}</p>
                        <p className="font-mono text-[10px] uppercase tracking-wider text-paper-muted">
                          {asset.type}{meta.slot ? ` · ${meta.slot}` : ""}
                        </p>
                      </div>
                      <a
                        href={asset.url}
                        download={filename}
                        className="shrink-0 rounded-md border border-mint/40 bg-mint-soft p-1.5 text-mint transition-colors hover:bg-mint hover:text-ink"
                        aria-label={t.assetsPanel.downloadTitle(filename)}
                        title={t.assetsPanel.downloadTitle(filename)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="min-w-0 border-t border-night-rule/60 pt-2">
          <SectionTitle
            count={activeCount}
            open={openSections.skill}
            onToggle={() => toggleSection("skill")}
          >
            {t.assetsPanel.skillTitle}
          </SectionTitle>
          {openSections.skill && (
            <div className="mt-1.5">
              <p className="mb-2 text-[11px] leading-relaxed text-paper-muted">
                {t.assetsPanel.skillDesc(learningsTotal, skillThreshold)}
              </p>
              {skills.length === 0 && (
                <p className="rounded-md border border-dashed border-night-rule-strong px-2 py-3 text-center text-[11px] text-paper-muted">
                  {t.assetsPanel.skillEmpty}
                </p>
              )}
              <ul className="space-y-2">
                {[...byCategory.entries()].map(([category, rules]) => (
                  <li key={category} className="min-w-0 rounded-lg border border-night-rule bg-night p-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-mint" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-paper-dim">
                        adforge-{category}
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadSkill(category)}
                        disabled={exporting === category}
                        className="flex shrink-0 items-center gap-1 rounded-md border border-mint/40 bg-mint-soft px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-mint transition-colors hover:bg-mint hover:text-ink disabled:opacity-50"
                        title={t.assetsPanel.downloadSkillTitle(category)}
                      >
                        {exporting === category ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                        .md
                      </button>
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {rules.map((rule) => (
                        <li key={rule.id} className="break-words text-[11px] leading-relaxed text-paper-dim">
                          <span className={rule.status === "active" ? "text-mint" : "text-signal"}>
                            {rule.status === "active" ? "●" : "○"}
                          </span>{" "}
                          {rule.rule}{" "}
                          <span className="font-mono text-[10px] text-paper-muted">×{rule.evidenceCount}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}

function MetaApiKeySection({
  settings,
  onSaveApiKey,
  onClearApiKey,
  open = true,
  onToggle,
}: {
  settings: ApiKeySettings | null;
  onSaveApiKey: (key: string) => Promise<ApiKeySettings>;
  onClearApiKey?: () => Promise<ApiKeySettings>;
  open?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const configured = Boolean(settings?.configured);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await onSaveApiKey(draft.trim());
      setDraft("");
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
    <section className="min-w-0">
      <SectionTitle
        count={configured ? 1 : 0}
        open={open}
        onToggle={onToggle}
        statusDot={configured ? "mint" : "amber"}
      >
        {t.apiKey.title}
      </SectionTitle>
      {open && (
        <div className="mt-1.5">
          <p className="mb-2 text-[11px] leading-relaxed text-paper-muted">
            {t.apiKey.subtitle}
          </p>
          <form onSubmit={handleSave} className="space-y-2 rounded-lg border border-night-rule bg-night p-2.5">
            <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
              <span className={configured ? "text-mint" : "text-amber-300"}>
                ●{" "}
                {settings?.source === "ui"
                  ? t.apiKey.statusActiveUi
                  : settings?.source === "env"
                    ? t.apiKey.statusActiveEnv
                    : t.apiKey.statusMissing}
              </span>
              {settings?.maskedKey && (
                <span className="truncate text-paper-dim">{settings.maskedKey}</span>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                type={show ? "text" : "password"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t.apiKey.placeholder}
                autoComplete="off"
                spellCheck={false}
                aria-label={t.apiKey.inputLabel}
                className="w-full rounded-md border border-night-rule-strong bg-night-panel py-1.5 pl-2 pr-8 font-mono text-[11px] text-paper placeholder:text-paper-muted focus:border-mint focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-1.5 rounded p-1 text-paper-muted hover:text-paper"
                aria-label={show ? t.apiKey.hideKey : t.apiKey.showKey}
                title={show ? t.apiKey.hideKey : t.apiKey.showKey}
              >
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-[11px] text-danger">
                {error}
              </p>
            )}
            {feedback && (
              <p role="status" className="flex items-center gap-1 text-[11px] text-mint">
                <Check className="h-3 w-3 shrink-0" />
                <span className="truncate">{feedback}</span>
              </p>
            )}
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-mint/40 bg-mint-soft px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-mint transition-colors hover:bg-mint hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                {busy ? t.apiKey.savingButton : t.apiKey.saveButton}
              </button>
              {settings?.source === "ui" && onClearApiKey && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={busy}
                  title={t.apiKey.clearButton}
                  aria-label={t.apiKey.clearButton}
                  className="shrink-0 rounded-md border border-danger-dark/40 bg-danger/10 px-2 py-1.5 text-danger transition-colors hover:bg-danger hover:text-paper disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

const DEFAULT_COLORS = { primaryColor: "#8D7B6A", secondaryColor: "#2A2421", accentColor: "#8D7B6A" };

function BrandKitSection({
  brandKit,
  brandLogoUrl,
  onSaveBrand,
  onUploadLogo,
  open = true,
  onToggle,
}: {
  brandKit: BrandKit | null;
  brandLogoUrl: string | null;
  onSaveBrand: (kit: { name: string; primaryColor: string; secondaryColor: string; accentColor: string; logoAssetId: string | null; logoPosition: "auto" | "left" | "right" }) => Promise<void>;
  onUploadLogo: (file: File) => Promise<Asset | null>;
  open?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(brandKit?.name ?? "");
  const [primary, setPrimary] = useState(brandKit?.primaryColor ?? DEFAULT_COLORS.primaryColor);
  const [secondary, setSecondary] = useState(brandKit?.secondaryColor ?? DEFAULT_COLORS.secondaryColor);
  const [accent, setAccent] = useState(brandKit?.accentColor ?? DEFAULT_COLORS.accentColor);
  const [logoAssetId, setLogoAssetId] = useState<string | null>(brandKit?.logoAssetId ?? null);
  const [logoPreview, setLogoPreview] = useState<string | null>(brandLogoUrl);
  const [logoPosition, setLogoPosition] = useState<"auto" | "left" | "right">(
    brandKit?.logoPosition === "left" || brandKit?.logoPosition === "right" ? brandKit.logoPosition : "auto",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== (brandKit?.name ?? "") ||
    primary !== (brandKit?.primaryColor ?? DEFAULT_COLORS.primaryColor) ||
    secondary !== (brandKit?.secondaryColor ?? DEFAULT_COLORS.secondaryColor) ||
    accent !== (brandKit?.accentColor ?? DEFAULT_COLORS.accentColor) ||
    logoAssetId !== (brandKit?.logoAssetId ?? null) ||
    logoPosition !== (brandKit?.logoPosition === "left" || brandKit?.logoPosition === "right" ? brandKit.logoPosition : "auto");

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      await onSaveBrand({
        name: name.trim().slice(0, 80),
        primaryColor: primary,
        secondaryColor: secondary,
        accentColor: accent,
        logoAssetId,
        logoPosition,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.assetsPanel.errSaveKit);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(t.assetsPanel.errLogoMime);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(t.assetsPanel.errLogoSize);
      return;
    }
    setBusy(true);
    try {
      const asset = await onUploadLogo(file);
      if (asset) {
        setLogoAssetId(asset.id);
        setLogoPreview(asset.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.assetsPanel.errLogoUpload);
    } finally {
      setBusy(false);
    }
  };

  const colors: Array<{ label: string; value: string; set: (v: string) => void }> = [
    { label: t.assetsPanel.colorPrimary, value: primary, set: setPrimary },
    { label: t.assetsPanel.colorSecondary, value: secondary, set: setSecondary },
    { label: t.assetsPanel.colorAccent, value: accent, set: setAccent },
  ];

  return (
    <section data-tour="brand-kit" className="min-w-0 border-t border-night-rule/60 pt-2">
      <SectionTitle
        count={logoAssetId || name.trim() ? 1 : 0}
        open={open}
        onToggle={onToggle}
      >
        {t.assetsPanel.brandKitTitle}
      </SectionTitle>
      {open && (
        <div className="mt-1.5">
          <p className="mb-2 text-[11px] leading-relaxed text-paper-muted">
            {t.assetsPanel.brandKitDesc}
          </p>
          <div className="space-y-2 rounded-lg border border-night-rule bg-night p-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-night-rule-strong bg-night-panel text-paper-muted transition-colors hover:border-mint/60 hover:text-paper disabled:opacity-50"
                aria-label={t.assetsPanel.uploadLogoAria}
                title={t.assetsPanel.uploadLogoTitle}
              >
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Logo" className="h-full w-full object-contain p-1" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <label className="block font-mono text-[10px] uppercase tracking-widest text-paper-muted">
                  {t.assetsPanel.businessLabel}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.assetsPanel.businessPlaceholder}
                  maxLength={80}
                  className="mt-1 w-full min-w-0 rounded-md border border-night-rule-strong bg-night-panel px-2 py-1.5 text-xs text-paper placeholder:text-paper-muted focus:border-mint focus:outline-none"
                />
              </div>
              {logoAssetId && (
                <button
                  type="button"
                  onClick={() => { setLogoAssetId(null); setLogoPreview(null); }}
                  className="shrink-0 rounded-md p-1.5 text-paper-muted transition-colors hover:text-danger"
                  aria-label={t.assetsPanel.removeLogoTitle}
                  title={t.assetsPanel.removeLogoTitle}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <label className="block text-[11px] text-paper-dim">
              <span className="font-mono text-[10px] uppercase tracking-wider text-paper-muted">{t.assetsPanel.logoPositionLabel}</span>
              <select
                value={logoPosition}
                onChange={(e) => setLogoPosition(e.target.value as "auto" | "left" | "right")}
                className="mt-1 w-full rounded-md border border-night-rule-strong bg-night-panel px-2 py-1.5 text-xs text-paper focus:border-mint focus:outline-none"
                aria-label={t.assetsPanel.logoPositionLabel}
              >
                <option value="auto">{t.assetsPanel.logoPosAuto}</option>
                <option value="left">{t.assetsPanel.logoPosLeft}</option>
                <option value="right">{t.assetsPanel.logoPosRight}</option>
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {colors.map(({ label, value, set }) => (
                <label key={label} className="min-w-0 text-[11px] text-paper-dim">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-paper-muted">{label}</span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => set(e.target.value.toUpperCase())}
                      className="h-7 w-8 shrink-0 cursor-pointer rounded border border-night-rule-strong bg-night-panel p-0.5"
                      aria-label={`Color ${label}`}
                    />
                    <span className="truncate font-mono text-[10px] text-paper-muted">{value}</span>
                  </span>
                </label>
              ))}
            </div>
            {error && (
              <p role="alert" className="text-[11px] text-danger">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!dirty || busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-mint/40 bg-mint-soft px-2 py-1.5 font-mono text-[11px] uppercase tracking-widest text-mint transition-colors hover:bg-mint hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Palette className="h-3 w-3" />}
              {brandKit ? t.assetsPanel.saveKit : t.assetsPanel.activateKit}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
