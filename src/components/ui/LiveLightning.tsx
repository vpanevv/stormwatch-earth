"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion } from "framer-motion";
import type { LightningHotspot, LiveLightning, SatelliteLightning } from "@/types/weather";
import { fmtInt } from "@/lib/format";
import { globalFlashRate, globalStrikeEstimate } from "@/lib/lightning/globalEstimate";

/** A number that counts to its new value when it changes, and flashes, so a live update reads as one. */
export function TickingNumber({ value, className = "" }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState(false);
  const from = useRef(value);
  useEffect(() => {
    if (from.current === value) return;
    const c = animate(from.current, value, { duration: 1.1, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => setShown(Math.round(v)) });
    from.current = value;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => {
      c.stop();
      clearTimeout(t);
    };
  }, [value]);
  return (
    <span className={`tabular-nums transition-[color,text-shadow] duration-700 ${flash ? "text-[#ffd2a8] [text-shadow:0_0_28px_rgba(255,122,26,0.65)]" : ""} ${className}`}>
      {fmtInt(shown)}
    </span>
  );
}

export function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

const Bolt = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M13.5 2 4.8 13.6h5.9L9 22l9.2-12.4h-6L13.5 2Z" fill="currentColor" />
  </svg>
);

type Sat = SatelliteLightning | null;
type SatLive = Extract<SatelliteLightning, { available: true }>;
type HotLive = Extract<LightningHotspot, { available: true }>;

const coordLabel = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
const utcTime = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The landing's live lightning, in one reading order:
 *   1. one big number, observed: every flash NOAA's GOES satellites saw over the Americas in the last 5 minutes
 *      (or, when they're out, Xweather's strikes around the most active storm);
 *   2. one line for the most active storm (Xweather strikes near a named place, else the satellites' busiest circle),
 *      with "Watch" to fly there;
 *   3. a small footnote: the worldwide total, an estimate, labelled as one.
 * `onWatch` flies into the Xweather storm, `onWatchSat` into the satellites' busiest storm.
 */
export function LightningHero({
  hot,
  sat = null,
  now,
  onWatch,
  onWatchSat = () => {},
  compact = false,
}: {
  hot: LightningHotspot | null;
  sat?: Sat;
  now: number;
  onWatch: () => void;
  onWatchSat?: () => void;
  compact?: boolean;
}) {
  const satLive: SatLive | null = sat?.available && sat.flashes > 0 ? sat : null;
  const storm: HotLive | null = hot?.available ? hot : null;
  const stormLive = storm && storm.strikes.count > 0 ? storm : null;
  const cluster = satLive?.clusters[0];

  // What leads: the satellites' count, else the storm's (even at zero), else nothing yet.
  const lead = satLive
    ? { value: satLive.flashes, unit: "flashes", source: "NOAA satellites", where: "over the Americas", at: satLive.to, windowMin: satLive.windowMin }
    : storm
      ? { value: storm.strikes.count, unit: storm.strikes.count === 1 ? "strike" : "strikes", source: "Xweather", where: `near ${storm.place.name}`, at: storm.fetchedAt, windowMin: storm.windowMin }
      : null;
  // The storm line under it (only when the satellites lead; otherwise the storm is the lead).
  // Xweather's storm (a named place) when it's really striking; otherwise the satellites' busiest storm.
  const stormLine = !satLive
    ? null
    : stormLive && (stormLive.strikes.count >= 10 || !cluster)
      ? { n: stormLive.strikes.count, unit: stormLive.strikes.count === 1 ? "strike" : "strikes", place: [stormLive.place.name, stormLive.place.context?.split(", ").pop()].filter(Boolean).join(", "), watch: onWatch }
      : cluster
        ? { n: cluster.flashes, unit: "flashes", place: cluster.name ?? coordLabel(cluster.lat, cluster.lon), watch: onWatchSat }
        : null;
  const world = fmtInt(globalStrikeEstimate(now));

  if (compact) {
    if (!lead) return hot === null && sat === null ? null : <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">≈ {world} strikes worldwide · last 5 min · estimated</div>;
    return (
      <button onClick={stormLine ? stormLine.watch : onWatch} className="flex items-center gap-3 text-left">
        <Bolt className="h-7 w-7 shrink-0 text-accent drop-shadow-[0_0_10px_rgba(255,122,26,0.7)]" />
        <span>
          <span className="block font-display text-[34px] font-semibold leading-none text-[#ece8e0] [font-stretch:80%]">
            <TickingNumber value={lead.value} />
          </span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-ink/90">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot align-middle" />
            {lead.unit} · last {lead.windowMin} min · {satLive ? "Americas" : lead.where}
          </span>
          {stormLine && (
            <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Top storm <span className="text-accent">{fmtInt(stormLine.n)}</span> · {short(stormLine.place.split(",")[0], 18)}
            </span>
          )}
        </span>
      </button>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-end gap-2 text-right font-mono text-[12px] uppercase tracking-[0.16em] text-mute">
        {hot === null && sat === null ? <span className="animate-pulse">Finding live lightning…</span> : <span className="text-faint">Live lightning offline</span>}
        {process.env.NODE_ENV === "development" && hot && !hot.available && hot.reason === "not-configured" && (
          <span className="normal-case tracking-normal text-faint">Set XWEATHER_CLIENT_ID and XWEATHER_CLIENT_SECRET</span>
        )}
        <WorldLine world={world} now={now} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative flex w-[400px] max-w-[38vw] flex-col items-end text-right before:pointer-events-none before:absolute before:-inset-x-16 before:-inset-y-10 before:-z-10 before:bg-[radial-gradient(closest-side,rgba(2,3,6,0.85),rgba(2,3,6,0.55)_60%,transparent)]"
    >
      {/* 1. the number */}
      <div className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-ink">
        <span className="live-dot h-2 w-2 rounded-full bg-emerald-400" />
        Live lightning <span className="text-mute">· {lead.source}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Bolt className="h-[clamp(40px,7vh,68px)] w-[clamp(40px,7vh,68px)] text-accent drop-shadow-[0_0_18px_rgba(255,122,26,0.75)]" />
        <span className="font-display text-[clamp(64px,11vh,124px)] font-semibold leading-[0.85] tracking-[-0.02em] text-[#ece8e0] [font-stretch:78%] [text-shadow:0_2px_30px_rgba(0,0,0,0.6)]">
          <TickingNumber value={lead.value} />
        </span>
      </div>
      <div className="mt-3 text-[17px] leading-snug text-[#d4d9df]">
        lightning {lead.unit} in the last {lead.windowMin} minutes
        <br />
        <span className="text-mute">{lead.where}</span>
      </div>

      {/* 2. the most active storm */}
      {stormLine ? (
        <div className="mt-5 flex w-full items-center justify-end gap-4 border-t border-white/12 pt-4">
          <div className="min-w-0 text-right">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-mute">Most active storm</div>
            <div className="mt-1 text-[15px] leading-snug text-[#d4d9df]">
              <span className="font-semibold text-accent">
                {fmtInt(stormLine.n)} {stormLine.unit}
              </span>{" "}
              near <span className="text-ink">{stormLine.place}</span>
            </div>
          </div>
          <button
            onClick={stormLine.watch}
            className="shrink-0 border border-accent/50 bg-accent/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-accent transition-colors hover:bg-accent/20"
          >
            Watch →
          </button>
        </div>
      ) : (
        !satLive &&
        storm && (
          <button
            onClick={onWatch}
            className="mt-4 border border-accent/50 bg-accent/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-accent transition-colors hover:bg-accent/20"
          >
            Watch this storm →
          </button>
        )
      )}

      {/* 3. the footnote */}
      <div className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mute">
        As of {utcTime(lead.at)} UTC · <WorldLine world={world} now={now} inline />
      </div>
    </motion.div>
  );
}

/**
 * The whole planet's lightning in the same window, estimated from NASA's satellite record (lib/lightning/
 * globalEstimate.ts). Always labelled as an estimate: unlike the numbers above it, nothing observes it live.
 */
function WorldLine({ world, now, inline = false }: { world: string; now: number; inline?: boolean }) {
  const rate = Math.round(globalFlashRate(now));
  const text = `≈ ${world} worldwide (estimate)`;
  const title = `Estimated from NASA's LIS/OTD satellite lightning record: about ${rate} flashes a second at this time of day and year.`;
  return inline ? (
    <span title={title}>{text}</span>
  ) : (
    <span title={title} className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">
      {text}
    </span>
  );
}

/** "⚡ 132 strikes in the last 5 min within 100 km" — or null when there's no storm (or no feed). */
export function strikeLine(live: LiveLightning | null | undefined, short = false): string | null {
  if (!live || !live.available || live.strikes.count <= 0) return null;
  const n = fmtInt(live.strikes.count);
  const word = live.strikes.count === 1 ? "strike" : "strikes";
  return short ? `⚡ ${n} ${word} · ${live.windowMin} min` : `⚡ ${n} lightning ${word} in the last ${live.windowMin} min within ${live.strikes.radiusKm} km`;
}

export { Bolt };

/** The app icon: the real planet with a lightning strike (scripts/build-icons.mjs). */
export function AppIcon({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/icon-192.png" alt="" aria-hidden width={192} height={192} className={`rounded-[22%] ${className}`} />;
}
