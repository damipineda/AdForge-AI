import type { Provider } from "@/lib/pipeline";

type TopBarProps = {
  provider: Provider;
};

const BADGE: Record<Provider, { tone: "mint" | "signal"; label: string }> = {
  demo: { tone: "mint", label: "DEMO_MODE ON" },
  meta: { tone: "signal", label: "LIVE: META API" },
};

export function TopBar({ provider }: TopBarProps) {
  const badge = BADGE[provider];
  return (
    <header className="border-b border-night-rule/70 bg-night/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-2xl font-semibold tracking-tight text-paper">
            AdForge<span className="text-mint"> AI</span>
          </span>
          <span className="hidden text-sm text-paper-muted sm:inline">
            Autonomous Product-to-Campaign Pipeline
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={badge.tone} label={badge.label} dot />
          <span className="hidden font-mono text-xs text-paper-muted md:inline">
            muse-spark-1.3 · muse-image-1.0
          </span>
        </div>
      </div>
    </header>
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
