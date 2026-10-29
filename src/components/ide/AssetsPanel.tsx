"use client";

import { useState } from "react";
import { BrainCircuit, Download, FileDown, ImagePlus, Images, Loader2 } from "lucide-react";
import { assetMeta, store, type Asset, type SkillRule } from "@/lib/store/client";

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
};

function SectionTitle({ children, count }: { children: string; count: number }) {
  return (
    <p className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-paper-muted">
      <span>{children}</span>
      <span>{count}</span>
    </p>
  );
}

export function AssetsPanel({ sources, flyers, collapsed, saving, onToggleCollapse, onReuseSource, skills, skillThreshold, learningsTotal }: AssetsPanelProps) {
  const [exporting, setExporting] = useState<string | null>(null);
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
      <div className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-l border-night-rule bg-night-panel py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-md p-2 text-paper-muted transition-colors hover:bg-night hover:text-paper"
          aria-label="Expandir biblioteca"
          title="Biblioteca de assets"
        >
          <Images className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-night-rule bg-night-panel">
      <div className="flex items-center justify-between gap-2 border-b border-night-rule px-3 py-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-paper-muted">
          Biblioteca
          {saving && <Loader2 className="h-3 w-3 animate-spin text-mint" />}
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-md p-1.5 font-mono text-xs text-paper-muted transition-colors hover:bg-night hover:text-paper"
          aria-label="Colapsar panel"
          title="Colapsar"
        >
          »
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section className="min-w-0">
          <SectionTitle count={sources.length}>Fuentes</SectionTitle>
          <p className="mb-2 mt-1 text-[11px] leading-relaxed text-paper-muted">
            Fotos de producto subidas al proyecto.
          </p>
          {sources.length === 0 && (
            <p className="rounded-md border border-dashed border-night-rule-strong px-2 py-3 text-center text-[11px] text-paper-muted">
              Sin fuentes. Subí fotos desde el lienzo.
            </p>
          )}
          <ul className="grid grid-cols-2 gap-2">
            {sources.map((asset) => {
              const meta = assetMeta(asset);
              return (
                <li key={asset.id} className="group relative min-w-0 overflow-hidden rounded-lg border border-night-rule-strong bg-night">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt={meta.filename ?? "Fuente"} className="h-24 w-full object-cover" loading="lazy" />
                  <button
                    type="button"
                    onClick={() => onReuseSource(asset)}
                    className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-night/85 px-1 py-1 font-mono text-[10px] uppercase tracking-wider text-mint opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
                    title="Cargar esta foto en el lienzo"
                  >
                    <ImagePlus className="h-3 w-3" />
                    Al lienzo
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="min-w-0">
          <SectionTitle count={flyers.length}>Generados</SectionTitle>
          <p className="mb-2 mt-1 text-[11px] leading-relaxed text-paper-muted">
            Flyers finales listos para descargar.
          </p>
          {flyers.length === 0 && (
            <p className="rounded-md border border-dashed border-night-rule-strong px-2 py-3 text-center text-[11px] text-paper-muted">
              Todavía no generaste piezas en este proyecto.
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
                    aria-label={`Descargar ${filename}`}
                    title={`Descargar ${filename}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="min-w-0">
          <SectionTitle count={activeCount}>Skill aprendido</SectionTitle>
          <p className="mb-2 mt-1 text-[11px] leading-relaxed text-paper-muted">
            {learningsTotal} piezas analizadas · umbral {skillThreshold} evidencias · las reglas activas ya alimentan los prompts.
          </p>
          {skills.length === 0 && (
            <p className="rounded-md border border-dashed border-night-rule-strong px-2 py-3 text-center text-[11px] text-paper-muted">
              Todavía sin patrones. Generá campañas y el skill emerge solo.
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
                    title={`Descargar ${category} como SKILL.md`}
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
        </section>
      </div>
    </aside>
  );
}
