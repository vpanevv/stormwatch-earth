"use client";

import { useEffect, useState } from "react";
import type { HourlyPoint } from "@/types/weather";
import { TIMELINE_SPAN_MS, useAppStore } from "@/store/useAppStore";
import { radar } from "@/lib/radar/manager";
import { fmtRelative, fmtTime } from "@/lib/format";
import { codeGlyph, describeCode } from "@/lib/weatherCodes";
import { IconPause, IconPlay, IconStepBack, IconStepFwd } from "../icons";
import { SectionHeader } from "../primitives";

function hourlyAt(hourly: HourlyPoint[], t: number) {
  let best: HourlyPoint | null = null;
  for (const h of hourly) if (h.time <= t) best = h;
  return best;
}

export function TimelineSection() {
  const live = useAppStore((s) => s.live);
  const playing = useAppStore((s) => s.playing);
  const time = useAppStore((s) => s.time);
  const w = useAppStore((s) => s.weather.data);
  const frameTime = useAppStore((s) => s.radarFrameTime);
  const { togglePlay, seek } = useAppStore.getState();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const head = live ? now : time;
  const step = (ms: number) => seek(head + ms);
  const at = w ? hourlyAt(w.hourly, head) : null;
  const cov = radar.coverage;
  const inRadar = cov && head >= cov[0] - 5 * 60_000 && head <= cov[1] + 15 * 60_000;
  void frameTime;

  return (
    <section>
      <SectionHeader index="03" title="Timeline" />
      <div className="flex items-center gap-2">
        <button onClick={() => step(-3_600_000)} className="border border-line px-1.5 py-1 font-mono text-[10px] text-mute hover:text-ink" aria-label="Back one hour">
          −1H
        </button>
        <button onClick={() => step(-10 * 60_000)} className="border border-line p-1 text-mute hover:text-ink" aria-label="Back 10 minutes">
          <IconStepBack width={14} height={14} />
        </button>
        <button
          onClick={togglePlay}
          className="flex h-7 w-7 items-center justify-center border border-accent/50 text-accent hover:bg-accent/10"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <IconPause width={13} height={13} /> : <IconPlay width={13} height={13} />}
        </button>
        <button onClick={() => step(10 * 60_000)} className="border border-line p-1 text-mute hover:text-ink" aria-label="Forward 10 minutes">
          <IconStepFwd width={14} height={14} />
        </button>
        <button onClick={() => step(3_600_000)} className="border border-line px-1.5 py-1 font-mono text-[10px] text-mute hover:text-ink" aria-label="Forward one hour">
          +1H
        </button>
        <div className="ml-auto text-right font-mono">
          <div className="text-[13px] tabular-nums text-ink">{fmtTime(head, w?.utcOffsetSeconds ?? 0)}</div>
          <div className="text-[9px] tracking-[0.12em] text-mute">{live ? "LIVE" : fmtRelative(head - now)}</div>
        </div>
      </div>
      <input
        type="range"
        className="scrubber mt-2 w-full"
        min={now - TIMELINE_SPAN_MS}
        max={now}
        step={60_000}
        value={head}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Timeline position"
      />
      <div className="mt-1 h-px w-full bg-white/10" />
      {at && (
        <div className="mt-3 grid grid-cols-5 gap-2 font-mono text-[10px] text-mute">
          <div>
            <div className="text-faint">SKY</div>
            <div className="text-ink" title={describeCode(at.weatherCode)}>
              {codeGlyph(at.weatherCode)} {at.cloudCover}%
            </div>
          </div>
          <div>
            <div className="text-faint">TEMP</div>
            <div className="text-ink">{Math.round(at.temperature)}°</div>
          </div>
          <div>
            <div className="text-faint">RAIN</div>
            <div className="text-ink">{at.precipitation.toFixed(1)} mm</div>
          </div>
          <div>
            <div className="text-faint">SNOW</div>
            <div className={at.snowfall > 0 ? "text-sky-200" : "text-ink"}>{at.snowfall.toFixed(1)} cm</div>
          </div>
          <div>
            <div className="text-faint">WIND</div>
            <div className="text-ink">{Math.round(at.windSpeed)} km/h</div>
          </div>
        </div>
      )}
      <div className="mt-2 font-mono text-[9px] leading-relaxed tracking-[0.06em] text-faint">
        {inRadar ? "RADAR · RAINVIEWER OBSERVED FRAME" : "RADAR · OUTSIDE ARCHIVE — PRECIPITATION SIMULATED"}
        {" · "}HOURLY VALUES · {w?.sources.forecast === "mock" ? "SIMULATED" : "OPEN-METEO"}
      </div>
    </section>
  );
}
