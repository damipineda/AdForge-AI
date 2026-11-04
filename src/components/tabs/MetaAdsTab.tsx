"use client";

import { useState } from "react";
import { Camera, Check, Copy, Users } from "lucide-react";
import type { AudienceSegment, CampaignResult } from "@/lib/schema/campaign";
import type { CutoutMode } from "@/lib/flyer/photo";
import { useI18n } from "@/lib/i18n";

export function MetaAdsTab({
  result,
}: {
  result: CampaignResult | null;
  previewUrl: string | null;
  cutoutMode: CutoutMode;
}) {
  const { t } = useI18n();
  if (!result) {
    return (
      <div className="hatch flex h-[360px] items-center justify-center rounded-lg border border-night-rule">
        <p className="text-sm text-paper-muted">{t.metaAds.empty}</p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-paper-dim">
        {t.metaAds.intro}
      </p>
      {result.legalDisclaimer && (
        <p className="rounded-lg border border-night-rule-strong bg-night px-3 py-2 text-xs leading-relaxed text-paper-muted">
          {t.metaAds.legalPrefix} {result.legalDisclaimer}
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
                <dt className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">{t.metaAds.headline}</dt>
                <dd className="mt-0.5 text-paper">{v.hook}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">{t.metaAds.body}</dt>
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
          {t.metaAds.audiencesTitle}
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
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
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
          {copied ? t.metaAds.copied : t.metaAds.copy}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-paper-dim">{text}</p>
    </div>
  );
}

function AudienceRow({ audience }: { audience: AudienceSegment }) {
  const { t } = useI18n();
  return (
    <li className="rounded-lg border border-night-rule-strong bg-night p-3 text-sm">
      <p className="font-semibold text-paper">{audience.name}</p>
      <p className="mt-1 text-xs leading-relaxed text-paper-dim">
        {audience.ageMin}–{audience.ageMax} {t.metaAds.years}
        {audience.geo.length ? ` · ${audience.geo.join(", ")}` : ""}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-paper-muted">
        {t.metaAds.interests} {audience.interests.join(", ")}
      </p>
    </li>
  );
}
