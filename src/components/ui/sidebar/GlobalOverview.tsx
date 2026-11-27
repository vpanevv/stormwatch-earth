"use client";

import { useAppStore } from "@/store/useAppStore";
import { radar } from "@/lib/radar/manager";
import { QUICK_PICKS } from "@/lib/gazetteer";
import { selectPlace } from "@/lib/actions";
import { fmtInt, fmtTime } from "@/lib/format";
import { Metric, SectionHeader, SourceBadge } from "../primitives";

/** Shown before a place is selected: a planet-wide status board. */
export function GlobalOverview() {
  const storms = useAppStore((s) => s.storms);
  const lightning = useAppStore((s) => s.lightning);
  const win = useAppStore((s) => s.lightningWindow);
  const radarState = useAppStore((s) => s.radar);
  useAppStore((s) => s.radarVersion);
  const cov = radar.coverage;
  const severe = storms.filter((c) => c.kind === "severe").length;

  return (
    <div className="space-y-7">
      <section>
        <SectionHeader index="00" title="Planet status" />
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <Metric label="Thunderstorm cells" value={storms.length} sub={`${severe} severe`} />
          <Metric label={`Strikes · ${win}`} value={fmtInt(lightning.total)} sub={`${fmtInt(lightning.ratePerMin)} / min now`} />
          <Metric
            label="Radar frames"
            value={radarState.data?.frames.length ?? 0}
            sub={cov ? `${fmtTime(cov[0])}–${fmtTime(cov[1])} UTC` : radarState.status === "loading" ? "loading…" : "unavailable"}
          />
          <Metric label="Hottest cell" value={storms.length ? `${Math.max(...storms.map((s) => s.strikesPerMin))}` : "—"} unit="str/min" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <SourceBadge source={radarState.status === "ready" ? "rainviewer" : "mock"} />
          <SourceBadge source="mock" title="Lightning and storm cells are simulated in this MVP" />
        </div>
      </section>

      <section>
        <SectionHeader index="01" title="Select a location" />
        <p className="text-[13px] leading-relaxed text-mute">
          Search above, use your position, or <span className="text-ink">double-click anywhere on the globe</span> to lock
          onto it and load local conditions, radar and forecast.
        </p>
        <ul className="mt-4 space-y-1">
          {QUICK_PICKS.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => selectPlace(p)}
                className="group flex w-full items-center gap-3 bg-white/[0.025] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
              >
                <span className="h-3 w-px bg-white/15 transition-colors group-hover:bg-accent" />
                <span className="flex-1">
                  <span className="block text-[13px] text-ink">{p.name}</span>
                  <span className="block text-[11px] text-mute">{p.context}</span>
                </span>
                <span className="font-mono text-[10px] text-faint">
                  {p.lat.toFixed(2)}, {p.lon.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
