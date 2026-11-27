"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { fmtDate, fmtRelative, fmtTime } from "@/lib/format";

export function TopBar({ compact = false }: { compact?: boolean }) {
  const live = useAppStore((s) => s.live);
  const time = useAppStore((s) => s.time);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const shown = live ? now : time;

  return (
    <header className="pointer-events-none select-none">
      <div className="flex items-center gap-3">
        <svg width={compact ? 22 : 28} height={compact ? 22 : 28} viewBox="0 0 32 32" aria-hidden className="text-accent">
          <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="1" />
          <ellipse cx="16" cy="16" rx="11" ry="4.2" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <path d="M16 5v22" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <path d="M17.5 9.5 13.5 17h3.5l-1.5 6 4.5-8h-3.5l1-5.5Z" fill="currentColor" />
        </svg>
        <div className="pointer-events-auto">
          <div className={`${compact ? "text-[12px] tracking-[0.28em]" : "text-[15px] tracking-[0.42em]"} whitespace-nowrap font-light uppercase text-ink`}>
            StormWatch<span className="text-accent"> / </span>Earth
          </div>
          {!compact && (
            <button
              onClick={() => useAppStore.getState().setAboutOpen(true)}
              className="label mt-0.5 flex items-center gap-1.5 !text-[9px] hover:!text-ink"
            >
              How this works
              <kbd className="flex h-3.5 w-3.5 items-center justify-center border border-white/25 text-[8px]">?</kbd>
            </button>
          )}
        </div>
      </div>
      {!compact && (
        <div className="mt-4 flex items-center gap-4 font-mono text-[11px] tracking-[0.08em]">
          <span className="tabular-nums text-ink/90">{shown ? `${fmtTime(shown, 0, true)} UTC` : "--:--:-- UTC"}</span>
          <span className="text-mute">{shown ? fmtDate(shown) : ""}</span>
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-300/90">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-accent">
              <span className="h-1.5 w-1.5 bg-accent" /> PLAYBACK {now ? fmtRelative(time - now) : ""}
            </span>
          )}
        </div>
      )}
    </header>
  );
}
