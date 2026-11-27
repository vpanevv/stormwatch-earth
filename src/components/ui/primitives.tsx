"use client";

import type { ReactNode } from "react";
import type { DataSource } from "@/types/weather";

const SOURCE_LABEL: Record<DataSource, { text: string; live: boolean }> = {
  openweather: { text: "OpenWeather", live: true },
  "open-meteo": { text: "Open-Meteo", live: true },
  rainviewer: { text: "RainViewer", live: true },
  nominatim: { text: "OSM Nominatim", live: true },
  blitzortung: { text: "Blitzortung", live: true },
  mock: { text: "Simulated", live: false },
  model: { text: "Model", live: false },
};

/** Every data block says where it came from — live feeds in green, synthetic in amber. */
export function SourceBadge({ source, title }: { source: DataSource; title?: string }) {
  const s = SOURCE_LABEL[source];
  return (
    <span
      title={title ?? (s.live ? `Live data from ${s.text}` : "Synthetic data — not an observation")}
      className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-mute"
    >
      <span className={`h-1 w-1 rounded-full ${s.live ? "bg-emerald-400" : "bg-amber-400"}`} />
      {s.text}
    </span>
  );
}

export function SectionHeader({ index, title, right }: { index: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="font-mono text-[10px] tracking-[0.18em] text-accent">{index}</span>
      <span className="label !text-ink/80">{title}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      {right}
    </div>
  );
}

export function Metric({
  label,
  value,
  unit,
  sub,
  bar,
  barColor = "bg-white/60",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  bar?: number;
  barColor?: string;
}) {
  return (
    <div className="min-w-0 border-t border-line pt-2.5">
      <div className="label !text-[9px]">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[20px] font-extralight tabular-nums text-ink">{value}</span>
        {unit && <span className="font-mono text-[10px] text-mute">{unit}</span>}
      </div>
      {bar !== undefined && (
        <div className="mt-1.5 h-px w-full bg-white/10">
          <div className={`h-px ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
      {sub && <div className="mt-1 truncate font-mono text-[10px] text-mute">{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex border border-line">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`px-2 py-1 font-mono text-[10px] tracking-[0.12em] transition-colors ${
            o.value === value ? "bg-accent/15 text-accent" : "text-mute hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.06] ${className}`} />;
}
