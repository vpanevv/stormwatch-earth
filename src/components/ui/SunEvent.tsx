"use client";

import type { WeatherBundle } from "@/types/weather";
import { nextSunEvent, untilLabel } from "@/lib/sun";
import { fmtTime } from "@/lib/format";
import { IconSunrise, IconSunset } from "./icons";

/**
 * The next sun event at the place, in its local time: sunset while the sun is up, sunrise while it is down
 * (Open-Meteo's daily sunrise/sunset). Polar day and night say so.
 */
export function SunEventLine({ w, className = "" }: { w: WeatherBundle; className?: string }) {
  const ev = nextSunEvent(w.daily, w.current.isDay);
  if (!ev) return null;
  const rise = ev.kind === "sunrise" || ev.kind === "polar-night";
  const Icon = rise ? IconSunrise : IconSunset;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Icon width={20} height={20} className={rise ? "text-amber-200" : "text-accent"} />
      {ev.kind === "sunrise" || ev.kind === "sunset" ? (
        <span className="font-mono text-[12px] tracking-[0.06em] text-ink">
          <span className="uppercase tracking-[0.14em]">{ev.kind}</span>{" "}
          <span className="text-[14px] tabular-nums">{fmtTime(ev.time, w.utcOffsetSeconds)}</span>
          <span className="text-ink/70"> · {untilLabel(ev.time - Date.now())}</span>
        </span>
      ) : (
        <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink">
          {ev.kind === "polar-day" ? "Midnight sun · no sunset" : "Polar night · no sunrise"}
        </span>
      )}
    </div>
  );
}
