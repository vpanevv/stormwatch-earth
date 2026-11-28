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

/**
 * The landing's headline number: live lightning strikes in the last 5 minutes around the most active storm right now
 * (Xweather; the storm found with NOAA's GOES lightning cameras and Open-Meteo). When that storm comes back quiet or
 * Xweather is out, the flashes NOAA's satellites saw over the Americas in the same 5 minutes lead instead. Both are
 * observations; the worldwide figure under them is the one estimate, and says so. `onWatch` flies into the storm,
 * `onWatchSat` into the busiest storm the satellites see.
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
  // The storm leads when it has strikes, or when there's nothing better to show than its zero.
  const storm = hot?.available && (hot.strikes.count > 0 || !satLive) ? hot : null;

  if (compact) {
    if (!storm && !satLive) return hot === null && sat === null ? null : <WorldEstimate now={now} compact />;
    return (
      <button onClick={storm ? onWatch : onWatchSat} className="flex items-center gap-3 text-left">
        <Bolt className="h-7 w-7 shrink-0 text-accent drop-shadow-[0_0_10px_rgba(255,122,26,0.7)]" />
        <span>
          <span className="block font-display text-[34px] font-semibold leading-none text-[#ece8e0] [font-stretch:80%]">
            <TickingNumber value={storm ? storm.strikes.count : satLive!.flashes} />
          </span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot align-middle" />
            {storm
              ? `strikes · last ${storm.windowMin} min · near ${storm.place.name}`
              : `flashes · last ${satLive!.windowMin} min`}
          </span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-ink/80">
            {storm && satLive ? `${fmtInt(satLive.flashes)} flashes · Americas · NOAA satellites` : !storm ? "over the Americas · NOAA satellites" : null}
          </span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            ≈ {fmtInt(globalStrikeEstimate(now))} worldwide · estimated
          </span>
        </span>
      </button>
    );
  }

  if (!storm && !satLive) {
    if (!hot && !sat)
      return (
        <div className="flex flex-col items-end text-right font-mono text-[12px] uppercase tracking-[0.16em] text-mute">
          <span className="animate-pulse">Finding the most active storm…</span>
          <WorldEstimate now={now} />
        </div>
      );
    return (
      <div className="flex flex-col items-end text-right font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
        Live lightning offline
        {process.env.NODE_ENV === "development" && hot && !hot.available && hot.reason === "not-configured" && (
          <div className="mt-1 normal-case tracking-normal">Set XWEATHER_CLIENT_ID and XWEATHER_CLIENT_SECRET</div>
        )}
        <WorldEstimate now={now} />
      </div>
    );
  }

  const header = storm ? (
    <>
      Live lightning <span className="text-mute">· Xweather</span>
    </>
  ) : (
    <>
      Live lightning <span className="text-mute">· NOAA GOES satellites</span>
    </>
  );
  const value = storm ? storm.strikes.count : satLive!.flashes;
  const caption = storm
    ? storm.strikes.count > 0
      ? `strikes in the last ${storm.windowMin} minutes`
      : `no strikes in the last ${storm.windowMin} minutes`
    : `lightning flashes in the last ${satLive!.windowMin} minutes`;
  const where = storm ? [storm.place.name, storm.place.context?.split(", ").pop()].filter(Boolean).join(", ") : "";
  const updated = ago(now - (storm ? storm.fetchedAt : satLive!.to));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative flex flex-col items-end text-right before:pointer-events-none before:absolute before:-inset-x-16 before:-inset-y-10 before:-z-10 before:bg-[radial-gradient(closest-side,rgba(2,3,6,0.82),rgba(2,3,6,0.5)_60%,transparent)]"
    >
      <div className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-ink">
        <span className="live-dot h-2 w-2 rounded-full bg-emerald-400" />
        {header}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Bolt className="h-[clamp(40px,7vh,72px)] w-[clamp(40px,7vh,72px)] text-accent drop-shadow-[0_0_18px_rgba(255,122,26,0.75)]" />
        <span className="font-display text-[clamp(64px,12vh,132px)] font-semibold leading-[0.85] tracking-[-0.02em] text-[#ece8e0] [font-stretch:78%] [text-shadow:0_2px_30px_rgba(0,0,0,0.6)]">
          <TickingNumber value={value} />
        </span>
      </div>
      <div className="mt-3 font-mono text-[12px] uppercase tracking-[0.16em] text-ink/90">{caption}</div>
      <div className="mt-1 max-w-[340px] text-[15px] leading-snug text-[#a4acb6]">
        {storm ? (
          <>
            within {storm.strikes.radiusKm} km of <span className="text-ink">{where}</span>, the most active storm we found
          </>
        ) : (
          <>
            over <span className="text-ink">the Americas</span> and nearby oceans, seen from orbit by NOAA&apos;s GOES-19 and GOES-18
            lightning cameras
          </>
        )}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <span className="font-mono text-[11px] tracking-[0.12em] text-faint">UPDATED {updated.toUpperCase()}</span>
        <button
          onClick={storm ? onWatch : onWatchSat}
          className="border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-accent transition-colors hover:bg-accent/20"
        >
          {storm ? "Watch this storm →" : "Watch the busiest storm →"}
        </button>
      </div>
      {storm && satLive && <SatelliteLine sat={satLive} />}
      <WorldEstimate now={now} />
    </motion.div>
  );
}

/** Under the storm: everything NOAA's GOES cameras saw over the Americas in the same 5 minutes. Observed, not estimated. */
function SatelliteLine({ sat }: { sat: SatLive }) {
  const names = sat.satellites.filter((s) => !s.error).map((s) => s.name);
  return (
    <div
      className="mt-4 w-[400px] max-w-[40vw] border-t border-white/15 pt-3 text-right normal-case tracking-normal"
      title={`Every lightning flash NOAA's Geostationary Lightning Mappers (${names.join(", ")}) recorded over the Americas and nearby oceans in the last ${sat.windowMin} minutes.`}
    >
      <div className="flex items-baseline justify-end gap-2.5">
        <span className="whitespace-nowrap font-display text-[clamp(26px,4vh,36px)] font-semibold leading-none text-[#ece8e0] [font-stretch:80%]">
          <TickingNumber value={sat.flashes} />
        </span>
        <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] text-ink/90">flashes over the Americas · last {sat.windowMin} min</span>
      </div>
      <div className="mt-1.5 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
        <span className="text-emerald-300/90">Live</span> · seen from orbit by NOAA {names.join(" & ")}
      </div>
    </div>
  );
}

/**
 * The whole planet's lightning in the same window, estimated from NASA's satellite record (lib/lightning/
 * globalEstimate.ts). Always labelled as an estimate: unlike the storm count above, nothing observes it live.
 */
function WorldEstimate({ now, compact = false }: { now: number; compact?: boolean }) {
  const est = globalStrikeEstimate(now);
  const rate = Math.round(globalFlashRate(now));
  if (compact) {
    return (
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/85">
        ⚡ ≈ {fmtInt(est)} strikes worldwide · last 5 min · estimated
      </div>
    );
  }
  return (
    <div
      className="mt-4 w-[400px] max-w-[40vw] border-t border-white/15 pt-3 text-right normal-case tracking-normal"
      title={`Estimated from NASA's LIS/OTD satellite lightning record: about ${rate} flashes a second at this time of day and year.`}
    >
      <div className="flex items-baseline justify-end gap-2.5">
        <span className="whitespace-nowrap font-display text-[clamp(26px,4vh,36px)] font-semibold leading-none text-[#ece8e0] [font-stretch:80%]">
          ≈ <TickingNumber value={est} />
        </span>
        <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] text-ink/90">strikes worldwide · last 5 min</span>
      </div>
      <div className="mt-1.5 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
        Estimated · NASA satellite average · ≈ {rate} per second
      </div>
    </div>
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
