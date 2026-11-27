"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { fmtDate, fmtRelative, fmtTime } from "@/lib/format";
import { Brand } from "./Brand";

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
      <Brand compact={compact} />
      {!compact && (
        <div className="mt-3 flex items-center gap-4 font-mono text-[11px] tracking-[0.08em]">
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
