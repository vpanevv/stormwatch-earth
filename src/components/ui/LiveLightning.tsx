"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion } from "framer-motion";
import type { LightningHotspot, LiveLightning } from "@/types/weather";
import { fmtInt } from "@/lib/format";

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

/**
 * The landing's headline number: live lightning strikes in the last 5 minutes around the most active storm right now
 * (Xweather, located with Open-Meteo). `onWatch` flies into that storm.
 */
export function LightningHero({ hot, now, onWatch, compact = false }: { hot: LightningHotspot | null; now: number; onWatch: () => void; compact?: boolean }) {
  if (!hot) {
    return compact ? null : (
      <div className="text-right font-mono text-[12px] uppercase tracking-[0.16em] text-mute">
        <span className="animate-pulse">Finding the most active storm…</span>
      </div>
    );
  }
  if (!hot.available) {
    return compact ? null : (
      <div className="text-right font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
        Live lightning offline
        {process.env.NODE_ENV === "development" && hot.reason === "not-configured" && (
          <div className="mt-1 normal-case tracking-normal">Set XWEATHER_CLIENT_ID and XWEATHER_CLIENT_SECRET</div>
        )}
      </div>
    );
  }
  const where = [hot.place.name, hot.place.context?.split(", ").pop()].filter(Boolean).join(", ");
  const updated = ago(now - hot.fetchedAt);

  if (compact) {
    return (
      <button onClick={onWatch} className="flex items-center gap-3 bg-[#020306]/75 py-2 pl-2 pr-4 text-left backdrop-blur-sm">
        <Bolt className="h-7 w-7 shrink-0 text-accent drop-shadow-[0_0_10px_rgba(255,122,26,0.7)]" />
        <span>
          <span className="block font-display text-[34px] font-semibold leading-none text-[#ece8e0] [font-stretch:80%]">
            <TickingNumber value={hot.strikes.count} />
          </span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot align-middle" />
            strikes · last {hot.windowMin} min · near {hot.place.name}
          </span>
        </span>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative flex flex-col items-end text-right before:pointer-events-none before:absolute before:-inset-x-16 before:-inset-y-10 before:-z-10 before:bg-[radial-gradient(closest-side,rgba(2,3,6,0.82),rgba(2,3,6,0.5)_60%,transparent)]"
    >
      <div className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-ink">
        <span className="live-dot h-2 w-2 rounded-full bg-emerald-400" />
        Live lightning <span className="text-mute">· Xweather</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Bolt className="h-[clamp(40px,7vh,72px)] w-[clamp(40px,7vh,72px)] text-accent drop-shadow-[0_0_18px_rgba(255,122,26,0.75)]" />
        <span className="font-display text-[clamp(64px,12vh,132px)] font-semibold leading-[0.85] tracking-[-0.02em] text-[#ece8e0] [font-stretch:78%] [text-shadow:0_2px_30px_rgba(0,0,0,0.6)]">
          <TickingNumber value={hot.strikes.count} />
        </span>
      </div>
      <div className="mt-3 font-mono text-[12px] uppercase tracking-[0.16em] text-ink/90">
        {hot.strikes.count > 0 ? `strikes in the last ${hot.windowMin} minutes` : `no strikes in the last ${hot.windowMin} minutes`}
      </div>
      <div className="mt-1 max-w-[340px] text-[15px] leading-snug text-[#a4acb6]">
        within {hot.strikes.radiusKm} km of <span className="text-ink">{where}</span>, the most active storm we found
      </div>
      <div className="mt-3 flex items-center gap-4">
        <span className="font-mono text-[11px] tracking-[0.12em] text-faint">UPDATED {updated.toUpperCase()}</span>
        <button
          onClick={onWatch}
          className="border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-accent transition-colors hover:bg-accent/20"
        >
          Watch this storm →
        </button>
      </div>
    </motion.div>
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
