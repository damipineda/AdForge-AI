"use client";

import { useState } from "react";
import { Camera, Check, Copy, Users } from "lucide-react";
import type { AudienceSegment, CampaignResult } from "@/lib/schema/campaign";
import type { CutoutMode } from "@/lib/flyer/photo";

export function MetaAdsTab({
  result,
}: {
  result: CampaignResult | null;
  previewUrl: string | null;
  cutoutMode: CutoutMode;
}) {
  if (!result) {
    return (
      <div className="hatch flex h-[360px] items-center justify-center rounded-lg border border-night-rule">
        <p className="text-sm text-paper-muted">El copy de Meta Ads aparece acá.</p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-paper-dim">
        El mismo asset 4:5 sirve para Instagram y Facebook: lo que cambia es el copy del post. Copiá cada versión a su red.
      </p>
      {result.legalDisclaimer && (
        <p className="rounded-lg border border-night-rule-strong bg-night px-3 py-2 text-xs leading-relaxed text-paper-muted">
          Micro-línea legal aplicada al pie de los captions: {result.legalDisclaimer}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {result.feedVariants.map((v, i) => (
          <section key={`copy-${i}`} className="flex flex-col gap-3 rounded-xl border border-night-rule bg-night-panel p-4">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-paper-muted">
              Feed V{i + 1} · {v.concept}
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">Titular</dt>
                <dd className="mt-0.5 text-paper">{v.hook}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">Apoyo</dt>
                <dd className="mt-0.5 leading-relaxed text-paper-dim">{v.body}</dd>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">CTA</span>
                <span className="rounded-full border border-mint/40 bg-mint-soft px-2.5 py-0.5 text-xs text-mint">{v.cta}</span>
                {v.featurePills.map((pill) => (
                  <span key={pill} className="rounded-full border border-night-rule-strong bg-night px-2.5 py-0.5 text-xs text-paper-dim">{pill}</span>
                ))}
              </div>
            </dl>
            <CaptionBlock network="instagram" text={v.captionInstagram} />
            <CaptionBlock network="facebook" text={v.captionFacebook} />
          </section>
        ))}
      </div>
      <section className="rounded-xl border border-night-rule bg-night-panel p-4">
        <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-paper-muted">
          <Users className="h-3.5 w-3.5 text-mint" />
          Audiencias sugeridas (borrador para revisar)
        </h3>
        <ul className="mt-3 space-y-3">
          {result.audiences.map((audience) => (
            <AudienceRow key={audience.name} audience={audience} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function CaptionBlock({ network, text }: { network: "instagram" | "facebook"; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* portapapeles no disponible */
    }
  };
  return (
    <div className="rounded-lg border border-night-rule-strong bg-night p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-paper-muted">
          <Camera className="h-3.5 w-3.5 text-mint" />
          {network === "instagram" ? "Post · Instagram" : "Post · Facebook"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded border border-night-rule-strong px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-paper-dim transition-colors hover:border-mint hover:text-mint"
        >
          {copied ? <Check className="h-3 w-3 text-mint" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-paper-dim">{text}</p>
    </div>
  );
}

function AudienceRow({ audience }: { audience: AudienceSegment }) {
  return (
    <li className="rounded-lg border border-night-rule-strong bg-night p-3 text-sm">
      <p className="font-semibold text-paper">{audience.name}</p>
      <p className="mt-1 text-xs leading-relaxed text-paper-dim">
        {audience.ageMin}–{audience.ageMax} años
        {audience.geo.length ? ` · ${audience.geo.join(", ")}` : ""}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-paper-muted">
        Intereses: {audience.interests.join(", ")}
      </p>
    </li>
  );
}
