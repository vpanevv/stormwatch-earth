"use client";

import type { Place } from "@/types/weather";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { typicalLightning, type TypicalLightning } from "@/lib/lightning/climatology";
import { useAppStore } from "@/store/useAppStore";
import { radar, dbzToRate } from "@/lib/radar/manager";
import { compass, formatLat, formatLon } from "@/lib/geo";
import { codeGlyph, describeCode } from "@/lib/weatherCodes";
import { fmtInt, fmtOffset, fmtTime } from "@/lib/format";
import { precipRGB } from "@/lib/radar/decode";
import { IconArrow } from "../icons";
import { Metric, SectionHeader, Skeleton, SourceBadge } from "../primitives";
import { SunEventLine } from "../SunEvent";

const LocalRadarMap = dynamic(() => import("./LocalRadarMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-44 w-full" />,
});

export function Summary({ place: sel }: { place: Place }) {
  const weather = useAppStore((s) => s.weather);
  const liveL = useAppStore((s) => s.liveLightning);
  // NASA's typical lightning here this month (LIS/OTD satellite climatology), next to the live count.
  const [typ, setTyp] = useState<TypicalLightning | null>(null);
  const offset = weather.data?.utcOffsetSeconds;
  useEffect(() => {
    setTyp(null);
    if (offset === undefined) return;
    let alive = true;
    typicalLightning(sel.lat, sel.lon, offset).then((t) => alive && setTyp(t), () => undefined);
    return () => {
      alive = false;
    };
  }, [sel.lat, sel.lon, offset]);
  const radarVersion = useAppStore((s) => s.radarVersion);
  const time = useAppStore((s) => s.time);
  const live = useAppStore((s) => s.live);
  const w = weather.data;

  const dbz = useMemo(
    () => radar.dbzAt(sel, live ? Date.now() : time),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sel, radarVersion, live, Math.round(time / 60_000)],
  );

  return (
    <section>
      <SectionHeader index="01" title="Summary" right={w && <SourceBadge source={w.sources.current} />} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[22px] font-extralight uppercase tracking-[0.12em] text-ink">{sel.name}</h2>
          {sel.context && <div className="truncate text-[12px] text-mute">{sel.context}</div>}
          <div className="mt-1.5 font-mono text-[10px] tracking-[0.08em] text-accent-soft">
            {formatLat(sel.lat)} · {formatLon(sel.lon)}
          </div>
        </div>
        {w && (
          <div className="shrink-0 text-right font-mono text-[10px] text-mute">
            <div className="tabular-nums text-ink/80">{fmtTime(Date.now(), w.utcOffsetSeconds)}</div>
            <div>{fmtOffset(w.utcOffsetSeconds)}</div>
          </div>
        )}
      </div>

      {!w ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-14 w-40" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-end gap-4">
            <div className="text-[56px] font-extralight leading-none tabular-nums tracking-tight text-ink">
              {Math.round(w.current.temperature)}
              <span className="align-top text-[22px] text-mute">°C</span>
            </div>
            <div className="pb-1.5">
              <div className="text-[14px] text-ink">
                <span className="mr-1.5 text-accent">{codeGlyph(w.current.weatherCode, w.current.isDay)}</span>
                {describeCode(w.current.weatherCode)}
              </div>
              <div className="font-mono text-[10px] text-mute">Feels like {Math.round(w.current.feelsLike)}°</div>
            </div>
          </div>

          <SunEventLine w={w} className="mt-3" />

          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
            <Metric label="Cloud cover" value={Math.round(w.current.cloudCover)} unit="%" bar={w.current.cloudCover} />
            <Metric label="Humidity" value={Math.round(w.current.humidity)} unit="%" bar={w.current.humidity} barColor="bg-sky-300/70" />
            <Metric
              label="Wind"
              value={Math.round(w.current.windSpeed)}
              unit="km/h"
              sub={
                <span className="inline-flex items-center gap-1">
                  <IconArrow deg={w.current.windDirection + 180} width={11} height={11} />
                  from {compass(w.current.windDirection)} · gusts {Math.round(w.current.windGust)}
                </span>
              }
            />
            <Metric
              label="Rain intensity"
              value={w.current.precipitation.toFixed(1)}
              unit="mm/h"
              sub={
                dbz !== null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5" style={{ background: `rgb(${precipRGB(dbz).join(",")})` }} />
                    radar {Math.round(dbz)} dBZ ≈ {dbzToRate(dbz).toFixed(1)} mm/h
                  </span>
                ) : radar.hasData ? (
                  "radar: no echo"
                ) : (
                  "radar: no coverage"
                )
              }
            />
            <Metric
              label={`Lightning · ${liveL?.available ? `${liveL.windowMin} min` : "live"}`}
              value={liveL?.available ? fmtInt(liveL.strikes.count) : "—"}
              unit={liveL?.available ? (liveL.strikes.count === 1 ? "strike" : "strikes") : undefined}
              sub={
                liveL?.available
                  ? `${liveL.strikes.count > 0 ? "within" : "none within"} ${liveL.strikes.radiusKm} km · Xweather`
                  : liveL === null
                    ? "checking…"
                    : "live lightning unavailable"
              }
              note={
                typ && (
                  // Each phrase stays whole; a narrow panel breaks between them, never inside "12 / 5 min".
                  <span
                    className="block [&>span]:whitespace-nowrap"
                    title="NASA LIS/OTD satellite lightning climatology, 1995–2014: average for this month over the same 100 km circle."
                  >
                    <span className="block text-accent-soft">NASA typical · {MONTHS[typ.month]}</span>
                    <span>{fmtTypical(typ.per5min)} / 5 min</span> · <span>{typ.season} month</span>
                    <br />
                    <span>{fmtDensity(typ.perKm2Year)} flashes/km² a year</span>
                  </span>
                )
              }
            />
            <Metric
              label="Snow"
              value={w.current.snowfall > 0 ? w.current.snowfall.toFixed(1) : Math.round(w.current.snowDepth)}
              unit={w.current.snowfall > 0 ? "cm/h" : "cm depth"}
              bar={Math.min(100, w.current.snowDepth)}
              barColor="bg-sky-100/80"
              sub={
                w.current.snowfall > 0
                  ? `falling · ${Math.round(w.current.snowDepth)} cm on ground`
                  : `next 24 h: ${w.hourly
                      .filter((h) => h.time > Date.now() && h.time < Date.now() + 86_400_000)
                      .reduce((s, h) => s + h.snowfall, 0)
                      .toFixed(1)} cm`
              }
            />
            <Metric label="Pressure" value={Math.round(w.current.pressure)} unit="hPa" sub={`updated ${fmtTime(w.fetchedAt, w.utcOffsetSeconds)}`} />
          </div>
        </>
      )}

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="label !text-[9px]">Local radar</span>
          <SourceBadge source={radar.hasData ? "rainviewer" : "mock"} />
        </div>
        <LocalRadarMap lat={sel.lat} lon={sel.lon} />
      </div>
    </section>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Average strikes per 5 min: "<0.1", "0.3", "4.2", "38". */
const fmtTypical = (n: number) => (n < 0.05 ? "<0.1" : n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString("en-US"));
const fmtDensity = (n: number) => (n < 0.1 ? "<0.1" : n < 10 ? n.toFixed(1) : Math.round(n).toString());
