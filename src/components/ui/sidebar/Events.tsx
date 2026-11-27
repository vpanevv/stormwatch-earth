"use client";

import type { Place } from "@/types/weather";
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { radar, dbzToRate } from "@/lib/radar/manager";
import { bearingDeg, compass, haversineKm } from "@/lib/geo";
import { fmtKm, fmtTime } from "@/lib/format";
import { SectionHeader, SourceBadge } from "../primitives";

const RANGE_KM = 1500;

type Row = {
  id: string;
  tone: "red" | "orange" | "amber" | "blue" | "green";
  kind: string;
  title: string;
  detail: string;
  meta?: string;
};

const TONE: Record<Row["tone"], string> = {
  red: "bg-red-500",
  orange: "bg-accent",
  amber: "bg-amber-300",
  blue: "bg-sky-400",
  green: "bg-emerald-400",
};

export function Events({ place: sel }: { place: Place }) {
  const w = useAppStore((s) => s.weather.data);
  const storms = useAppStore((s) => s.storms);
  const lightning = useAppStore((s) => s.lightning);
  const win = useAppStore((s) => s.lightningWindow);
  const radarVersion = useAppStore((s) => s.radarVersion);
  const time = useAppStore((s) => s.time);
  const live = useAppStore((s) => s.live);
  const minute = Math.round(time / 60_000);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const wn of w?.warnings ?? []) {
      out.push({
        id: `w-${wn.id}`,
        tone: wn.level === "warning" ? "red" : wn.level === "watch" ? "orange" : "amber",
        kind: `${wn.level} · derived`,
        title: wn.title,
        detail: wn.detail,
        meta: `${fmtTime(wn.from, w!.utcOffsetSeconds)}–${fmtTime(wn.to, w!.utcOffsetSeconds)}`,
      });
    }
    const near = storms
      .map((c) => ({ c, d: haversineKm(sel, c) }))
      .filter((x) => x.d < RANGE_KM)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    for (const { c, d } of near) {
      out.push({
        id: `s-${c.id}`,
        tone: c.kind === "severe" ? "red" : "orange",
        kind: c.kind === "severe" ? "severe storm" : "thunderstorm cell",
        title: `${fmtKm(d)} km ${compass(bearingDeg(sel, c))}`,
        detail: `${c.strikesPerMin} strikes/min · Ø ${Math.round(c.radiusKm * 2)} km`,
        meta: `→ ${compass(c.headingDeg)} ${Math.round(c.speedKmh)} km/h`,
      });
    }
    const t = live ? Date.now() : time;
    for (const rc of radar.cellsNear(sel, t, 400, 25)) {
      out.push({
        id: `r-${rc.lat.toFixed(2)}-${rc.lon.toFixed(2)}`,
        tone: rc.dbz >= 45 ? "red" : rc.dbz >= 35 ? "amber" : "green",
        kind: rc.snow ? "snow cell" : "rain cell",
        title: `${fmtKm(rc.distanceKm)} km ${compass(rc.bearing)}`,
        detail:
          rc.dbz >= 55
            ? `${Math.round(rc.dbz)} dBZ · hail core likely`
            : `${Math.round(rc.dbz)} dBZ ≈ ${dbzToRate(rc.dbz).toFixed(1)} mm/h`,
        meta: "radar",
      });
    }
    if (lightning.within100km > 0) {
      out.push({
        id: "ltg",
        tone: "amber",
        kind: "lightning",
        title: `${lightning.within100km} strikes within 100 km`,
        detail: `last ${win}`,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, w, storms, lightning.within100km, win, radarVersion, minute, live]);

  return (
    <section>
      <SectionHeader index="02" title="Active events" right={<span className="font-mono text-[10px] text-mute">{rows.length}</span>} />
      {rows.length === 0 ? (
        <div className="border border-dashed border-line px-3 py-4 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          No active events within {RANGE_KM.toLocaleString("en-US")} km
        </div>
      ) : (
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-stretch gap-3 bg-white/[0.025] py-2 pr-2"
              >
                <span className={`w-px shrink-0 ${TONE[r.tone]}`} />
                <div className="min-w-0 flex-1">
                  <div className="label !text-[9px]">{r.kind}</div>
                  <div className="truncate text-[13px] text-ink">{r.title}</div>
                  <div className="truncate font-mono text-[10px] text-mute">{r.detail}</div>
                </div>
                {r.meta && <div className="shrink-0 self-center font-mono text-[10px] text-mute">{r.meta}</div>}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <SourceBadge source="mock" title="Storm cells and lightning are simulated in this MVP" />
        {radar.hasData && <SourceBadge source="rainviewer" />}
        {w && <SourceBadge source={w.sources.forecast} title="Warnings are derived from forecast thresholds, not official bulletins" />}
      </div>
    </section>
  );
}
