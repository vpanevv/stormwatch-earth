"use client";

import { useEffect, useState } from "react";
import { radar } from "@/lib/radar/manager";
import { STRIKE_CAPACITY, STRIKE_EPOCH, strikes } from "@/lib/lightning/buffer";
import { TIMELINE_SPAN_MS, type Speed, useAppStore } from "@/store/useAppStore";
import { fmtRelative, fmtTime } from "@/lib/format";
import { IconPause, IconPlay, IconRewind } from "./icons";
import { Segmented } from "./primitives";

const BINS = 96; // 15-minute bins

/** Strike counts per 15 minutes over the last 24 h — drawn above the track. */
function useStrikeHistogram() {
  const [bins, setBins] = useState<number[]>(() => new Array(BINS).fill(0));
  useEffect(() => {
    const compute = () => {
      const now = Date.now();
      const start = now - TIMELINE_SPAN_MS;
      const out = new Array(BINS).fill(0);
      const s0 = (start - STRIKE_EPOCH) / 1000;
      const binSec = TIMELINE_SPAN_MS / BINS / 1000;
      for (let i = 0; i < Math.min(strikes.count, STRIKE_CAPACITY); i++) {
        const b = Math.floor((strikes.times[i] - s0) / binSec);
        if (b >= 0 && b < BINS) out[b]++;
      }
      setBins(out);
    };
    compute();
    const id = setInterval(compute, 5000);
    return () => clearInterval(id);
  }, []);
  return bins;
}

export function TimelinePlayer({ compact = false }: { compact?: boolean }) {
  const live = useAppStore((s) => s.live);
  const playing = useAppStore((s) => s.playing);
  const speed = useAppStore((s) => s.speed);
  const time = useAppStore((s) => s.time);
  const offset = useAppStore((s) => s.weather.data?.utcOffsetSeconds);
  const { togglePlay, rewind, setSpeed, seek, goLive } = useAppStore.getState();
  useAppStore((s) => s.radarVersion); // re-render when radar coverage changes
  const bins = useStrikeHistogram();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = now - TIMELINE_SPAN_MS;
  const head = live ? now : time;
  const frac = Math.min(1, Math.max(0, (head - start) / TIMELINE_SPAN_MS));
  const cov = radar.coverage;
  const covL = cov ? Math.max(0, (cov[0] - start) / TIMELINE_SPAN_MS) : 0;
  const covR = cov ? Math.min(1, (cov[1] + 10 * 60_000 - start) / TIMELINE_SPAN_MS) : 0;
  const maxBin = Math.max(1, ...bins);

  return (
    <div className={`panel corner-brackets ${compact ? "px-3 py-2" : "px-5 py-3"}`}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <button onClick={rewind} aria-label="Rewind to 24 hours ago" className="p-1.5 text-mute transition-colors hover:text-ink">
            <IconRewind width={16} height={16} />
          </button>
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play last 24 hours"}
            className="flex h-9 w-9 items-center justify-center border border-accent/50 bg-accent/10 text-accent transition-colors hover:bg-accent/20"
          >
            {playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}
          </button>
        </div>
        {!compact && (
          <Segmented<Speed>
            label="Playback speed"
            value={speed}
            onChange={setSpeed}
            options={[
              { value: 1, label: "×1" },
              { value: 5, label: "×5" },
              { value: 10, label: "×10" },
            ]}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="relative h-7">
            {/* lightning activity histogram */}
            <div className="absolute inset-x-0 bottom-2 flex h-5 items-end gap-px">
              {bins.map((b, i) => (
                <span
                  key={i}
                  className="flex-1 bg-amber-300/40"
                  style={{ height: `${(b / maxBin) * 100}%`, opacity: i / BINS <= frac ? 0.9 : 0.35 }}
                />
              ))}
            </div>
            {/* radar archive coverage */}
            {cov && (
              <div
                className="absolute bottom-0 h-[3px] bg-sky-400/70"
                style={{ left: `${covL * 100}%`, width: `${(covR - covL) * 100}%` }}
                title="RainViewer radar archive"
              />
            )}
            <div className="absolute inset-x-0 bottom-0 h-px bg-white/15" />
            <div className="absolute bottom-0 h-px bg-accent/80" style={{ width: `${frac * 100}%` }} />
            {/* hour ticks */}
            {Array.from({ length: 25 }, (_, i) => (
              <span
                key={i}
                className={`absolute bottom-0 w-px ${i % 6 === 0 ? "h-2 bg-white/30" : "h-1 bg-white/15"}`}
                style={{ left: `${(i / 24) * 100}%` }}
              />
            ))}
            <input
              type="range"
              className="scrubber absolute inset-x-0 bottom-[-10px] w-full"
              min={0}
              max={1000}
              value={Math.round(frac * 1000)}
              onChange={(e) => seek(start + (Number(e.target.value) / 1000) * TIMELINE_SPAN_MS)}
              aria-label="Timeline position"
              aria-valuetext={live ? "Live" : fmtRelative(head - now)}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9px] tracking-[0.12em] text-faint">
            <span>−24H</span>
            <span>−18H</span>
            <span>−12H</span>
            <span>−6H</span>
            <span>NOW</span>
          </div>
        </div>

        <div className="hidden w-[118px] text-right sm:block">
          <div className="font-mono text-[15px] font-light tabular-nums text-ink">
            {fmtTime(head, offset ?? 0)}
            <span className="ml-1 text-[9px] text-mute">{offset !== undefined ? "LOCAL" : "UTC"}</span>
          </div>
          <div className="font-mono text-[10px] tabular-nums text-mute">{live ? "real time" : fmtRelative(head - now)}</div>
        </div>
        <button
          onClick={goLive}
          aria-pressed={live}
          className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.16em] transition-colors ${
            live ? "border-emerald-400/40 text-emerald-300" : "border-line text-mute hover:text-ink"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "live-dot bg-emerald-400" : "bg-white/30"}`} />
          LIVE
        </button>
      </div>
      {!compact && (
        <div className="mt-1 hidden items-center gap-4 font-mono text-[9px] tracking-[0.1em] text-faint xl:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-3 bg-sky-400/70" /> RADAR ARCHIVE (RAINVIEWER, LAST {cov ? Math.round((cov[1] - cov[0]) / 3_600_000 + 0.17) : 0}H)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-1 bg-amber-300/60" /> STRIKES / 15 MIN
          </span>
          <span>OUTSIDE THE RADAR ARCHIVE, PRECIPITATION IS SIMULATED</span>
        </div>
      )}
    </div>
  );
}
