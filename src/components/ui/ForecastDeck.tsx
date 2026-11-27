"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as THREE from "three";
import type { HourlyPoint, WeatherBundle } from "@/types/weather";
import { useAppStore } from "@/store/useAppStore";
import { codeGlyph, describeCode } from "@/lib/weatherCodes";
import { compass, formatLat, formatLon, latLonToVec3 } from "@/lib/geo";
import { sunDirection } from "@/lib/sun";
import { fmtDate, fmtDay, fmtTime } from "@/lib/format";
import { QUICK_PICKS } from "@/lib/gazetteer";
import { selectPlace, useMyLocation } from "@/lib/actions";
import { IconChevron, IconCrosshair, IconShare, IconDroplet, IconSnow, IconWind } from "./icons";
import { Skeleton, SourceBadge } from "./primitives";
import { SnowOverlay } from "./SnowOverlay";

type Tab = "48h" | "7d";
const HOUR = 3_600_000;

/** The forecast is the centre of the app: a wide deck under the globe. */
export function ForecastDeck({ collapsed, onToggle, compact = false }: { collapsed: boolean; onToggle: () => void; compact?: boolean }) {
  const selection = useAppStore((s) => s.selection);
  const weather = useAppStore((s) => s.weather);
  const w = weather.data;
  const [tab, setTab] = useState<Tab>("48h");

  const snowIntensity = useMemo(() => {
    if (!w) return 0;
    const soon = w.hourly.filter((h) => h.time >= Date.now() - HOUR && h.time <= Date.now() + 6 * HOUR);
    const peak = Math.max(w.current.snowfall, ...soon.map((h) => h.snowfall));
    const snowyCode = w.current.weatherCode >= 71 && w.current.weatherCode <= 86;
    return peak > 0 || snowyCode ? THREE.MathUtils.clamp(0.3 + peak / 2, 0.3, 1) : 0;
  }, [w]);

  return (
    <section aria-label="Forecast" className="panel corner-brackets relative flex h-full min-h-0 flex-col overflow-hidden">
      {snowIntensity > 0 && <SnowOverlay intensity={snowIntensity} className="opacity-70" />}
      {!selection ? (
        <EmptyDeck compact={compact} />
      ) : (
        <>
          <DeckHeader w={w} tab={tab} setTab={setTab} collapsed={collapsed} onToggle={onToggle} compact={compact} />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="body"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative min-h-0 flex-1 px-4 pb-3 md:px-5"
              >
                {!w ? (
                  <div className="flex h-full gap-2 pt-2">
                    {Array.from({ length: 8 }, (_, i) => (
                      <Skeleton key={i} className="h-full flex-1" />
                    ))}
                  </div>
                ) : tab === "48h" ? (
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    <HourlyStrip w={w} />
                    <Chart48 w={w} />
                  </div>
                ) : (
                  <DailyCards w={w} compact={compact} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </section>
  );
}

function DeckHeader({
  w,
  tab,
  setTab,
  collapsed,
  onToggle,
  compact,
}: {
  w: WeatherBundle | null;
  tab: Tab;
  setTab: (t: Tab) => void;
  collapsed: boolean;
  onToggle: () => void;
  compact: boolean;
}) {
  const sel = useAppStore((s) => s.selection)!;
  const today = w?.daily[0];
  return (
    <header className={`relative flex items-center gap-x-5 border-b border-line px-4 py-2.5 md:px-5 ${compact ? "flex-wrap gap-y-1" : ""}`}>
      <div className={`min-w-0 ${compact ? "w-full" : "min-w-[120px] flex-1 basis-0"}`}>
        <div className="label !text-[9px] !text-accent">Forecast</div>
        <h2 className="truncate text-[18px] font-light uppercase tracking-[0.12em] text-ink md:text-[22px]">{sel.name}</h2>
        {!compact && (
          <div className="truncate font-mono text-[10px] text-mute">
            {sel.context ? `${sel.context} · ` : ""}
            {formatLat(sel.lat, 2)} {formatLon(sel.lon, 2)}
          </div>
        )}
      </div>

      {w ? (
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-[40px] font-extralight leading-none tabular-nums tracking-tight text-ink md:text-[48px]">
            {Math.round(w.current.temperature)}
            <span className="align-top text-[18px] text-mute">°</span>
          </div>
          <div>
            <div className="flex items-center gap-2 text-[14px] text-ink">
              <span className="text-[20px] text-accent">{codeGlyph(w.current.weatherCode, w.current.isDay)}</span>
              {describeCode(w.current.weatherCode)}
            </div>
            <div className="font-mono text-[10px] text-mute">
              Feels {Math.round(w.current.feelsLike)}°
              {today && ` · H ${Math.round(today.tMax)}° L ${Math.round(today.tMin)}°`}
            </div>
          </div>
        </div>
      ) : (
        <Skeleton className="h-12 w-44" />
      )}

      {w && !compact && (
        <div className="hidden shrink-0 flex-col gap-1 font-mono text-[11px] text-ink/80 2xl:flex">
          <Chip icon={<IconWind width={14} height={14} />} text={`${Math.round(w.current.windSpeed)} km/h ${compass(w.current.windDirection)}`} />
          <Chip icon={<IconDroplet width={14} height={14} />} text={`${w.current.precipitation.toFixed(1)} mm/h · ${Math.round(w.current.humidity)}%`} />
          <Chip
            icon={<IconSnow width={14} height={14} className={w.current.snowDepth > 0 || w.current.snowfall > 0 ? "text-sky-200" : ""} />}
            text={
              w.current.snowfall > 0
                ? `${w.current.snowfall.toFixed(1)} cm/h · ${Math.round(w.current.snowDepth)} cm`
                : w.current.snowDepth > 0
                  ? `${Math.round(w.current.snowDepth)} cm on ground`
                  : "no snow"
            }
          />
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ShareButton compact={compact} disabled={!w} />
        {w && !compact && (
          <span className="hidden xl:inline">
            <SourceBadge source={w.sources.forecast} />
          </span>
        )}
        <div role="tablist" aria-label="Forecast range" className="flex border border-line">
          {(["48h", "7d"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                if (collapsed) onToggle();
              }}
              className={`px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] transition-colors ${
                tab === t ? "bg-accent/15 text-accent" : "text-mute hover:text-ink"
              }`}
            >
              <span className="xl:hidden">{t === "48h" ? "48H" : "7D"}</span>
              <span className="hidden xl:inline">{t === "48h" ? "48 HOURS" : "7 DAYS"}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand forecast" : "Collapse forecast"}
          className="border border-line p-1.5 text-mute transition-colors hover:text-ink"
        >
          <IconChevron up={collapsed} width={14} height={14} />
        </button>
      </div>
    </header>
  );
}

function Chip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-mute">{icon}</span>
      {text}
    </span>
  );
}

function upcoming(w: WeatherBundle, n: number) {
  const from = Date.now() - HOUR;
  return w.hourly.filter((h) => h.time >= from).slice(0, n);
}

function HourlyStrip({ w }: { w: WeatherBundle }) {
  const hrs = upcoming(w, 24);
  return (
    <div className="scroll-thin -mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 pt-2">
      {hrs.map((h, i) => {
        const snow = h.snowfall > 0;
        return (
          <div
            key={h.time}
            className={`flex min-w-[58px] flex-1 flex-col items-center gap-0.5 py-1.5 ${
              i === 0 ? "bg-accent/10 ring-1 ring-accent/30" : "bg-white/[0.03]"
            }`}
          >
            <span className={`font-mono text-[10px] ${i === 0 ? "text-accent" : "text-mute"}`}>
              {i === 0 ? "NOW" : fmtTime(h.time, w.utcOffsetSeconds)}
            </span>
            <span className={`text-[20px] leading-none ${snow ? "text-sky-100" : "text-accent-soft"}`} title={describeCode(h.weatherCode)}>
              {codeGlyph(h.weatherCode, isDayAt(w, h.time))}
            </span>
            <span className="text-[18px] font-light tabular-nums text-ink">{Math.round(h.temperature)}°</span>
            {snow ? (
              <span className="font-mono text-[10px] text-sky-200">❄ {h.snowfall.toFixed(1)}</span>
            ) : (
              <span className={`font-mono text-[10px] ${h.precipProbability >= 50 ? "text-sky-300" : "text-faint"}`}>
                {Math.round(h.precipProbability)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function isDayAt(w: WeatherBundle, t: number) {
  const n = latLonToVec3(w.location.lat, w.location.lon).normalize();
  return n.dot(sunDirection(t)) > -0.01;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

/** 48-hour chart: temperature, rain + snow bars, cloud band, night shading, now/playhead markers, hover read-out. */
function Chart48({ w }: { w: WeatherBundle }) {
  const { ref, width, height } = useSize<HTMLDivElement>();
  const live = useAppStore((s) => s.live);
  const time = useAppStore((s) => s.time);
  const [hover, setHover] = useState<number | null>(null);
  const hrs = useMemo(() => upcoming(w, 48), [w]);
  const night = useMemo(() => hrs.map((h) => !isDayAt(w, h.time + HOUR / 2)), [hrs, w]);
  if (hrs.length < 2) return null;

  // Scales with the deck: everything is laid out as fractions of the measured height.
  const H = Math.max(96, height), padL = 30, padR = 8, cloudH = 8;
  const pBot = H - 18, tTop = 34, tBot = tTop + (pBot - tTop) * 0.62;
  const W = Math.max(200, width);
  const step = (W - padL - padR) / hrs.length;
  const x = (i: number) => padL + i * step;
  const xt = (t: number) => padL + ((t - hrs[0].time) / HOUR) * step;
  const temps = hrs.map((h) => h.temperature);
  const tMin = Math.floor(Math.min(...temps) - 1), tMax = Math.ceil(Math.max(...temps) + 1);
  const yT = (t: number) => tBot - ((t - tMin) / Math.max(1, tMax - tMin)) * (tBot - tTop);
  const pMax = Math.max(2, ...hrs.map((h) => h.precipitation), ...hrs.map((h) => h.snowfall));
  const bar = (v: number) => (v / pMax) * (pBot - tBot - 6);
  const line = hrs.map((h, i) => `${i ? "L" : "M"}${(x(i) + step / 2).toFixed(1)},${yT(h.temperature).toFixed(1)}`).join("");
  const area = `${line}L${(x(hrs.length - 1) + step / 2).toFixed(1)},${tBot}L${(x(0) + step / 2).toFixed(1)},${tBot}Z`;
  const iMax = temps.indexOf(Math.max(...temps)), iMin = temps.indexOf(Math.min(...temps));
  const h = hover !== null ? hrs[hover] : null;
  const playhead = !live && time >= hrs[0].time && time <= hrs[hrs.length - 1].time + HOUR ? xt(time) : null;

  return (
    <div ref={ref} className="relative min-h-0 flex-1">
      <svg
        width={W}
        height={H}
        className="block"
        role="img"
        aria-label="48 hour temperature, rain and snow forecast"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((e.clientX - r.left - padL) / step);
          setHover(i >= 0 && i < hrs.length ? i : null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="tempFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ff7a1a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ff7a1a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* night */}
        {night.map((n, i) => (n ? <rect key={i} x={x(i)} y={0} width={step + 0.5} height={pBot} fill="rgba(70,90,150,0.10)" /> : null))}
        {/* cloud band */}
        {hrs.map((hh, i) => (
          <rect key={`c${i}`} x={x(i)} y={14} width={step - 1} height={cloudH} fill="#dfe7f5" opacity={(hh.cloudCover / 100) * 0.55} />
        ))}
        {/* day boundaries + labels */}
        {hrs.map((hh, i) => {
          const local = new Date(hh.time + w.utcOffsetSeconds * 1000).getUTCHours();
          if (local % 6 !== 0) return null;
          const strong = local === 0;
          return (
            <g key={`t${i}`}>
              <line x1={x(i)} x2={x(i)} y1={cloudH + 16} y2={pBot} stroke={strong ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)"} />
              <text x={x(i) + 3} y={H - 4} fill={strong ? "#e6ecf2" : "#7c8794"} fontSize="10" fontFamily="var(--font-mono)">
                {strong ? fmtDay(hh.time, w.utcOffsetSeconds).toUpperCase() : fmtTime(hh.time, w.utcOffsetSeconds)}
              </text>
            </g>
          );
        })}
        {/* temperature axis */}
        {[tMin, Math.round((tMin + tMax) / 2), tMax].map((t) => (
          <text key={t} x={2} y={yT(t) + 3} fill="#47505b" fontSize="9" fontFamily="var(--font-mono)">
            {t}°
          </text>
        ))}
        {/* precipitation: rain then snow stacked */}
        {hrs.map((hh, i) => {
          // ~1 cm of snow ≈ 1 mm of water: draw only the liquid part as rain.
          const r = bar(hh.precipitation - Math.min(hh.precipitation, hh.snowfall));
          const s = bar(hh.snowfall);
          return (
            <g key={`p${i}`}>
              {r > 0.3 && <rect x={x(i) + 1} y={pBot - r} width={step - 2} height={r} fill="rgba(80,160,255,0.75)" />}
              {s > 0.3 && <rect x={x(i) + 1} y={pBot - r - s} width={step - 2} height={s} fill="rgba(225,232,255,0.9)" />}
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={pBot} y2={pBot} stroke="rgba(255,255,255,0.12)" />
        <path d={area} fill="url(#tempFill)" />
        <path d={line} fill="none" stroke="#ff7a1a" strokeWidth="1.6" />
        <text x={x(iMax) + step / 2} y={yT(temps[iMax]) - 6} fill="#e6ecf2" fontSize="11" textAnchor="middle">
          {Math.round(temps[iMax])}°
        </text>
        <text x={x(iMin) + step / 2} y={yT(temps[iMin]) + 14} fill="#9aa6b4" fontSize="11" textAnchor="middle">
          {Math.round(temps[iMin])}°
        </text>
        {/* now + playhead */}
        <line x1={xt(Date.now())} x2={xt(Date.now())} y1={0} y2={pBot} stroke="#34d399" strokeDasharray="2 3" />
        {playhead !== null && <line x1={playhead} x2={playhead} y1={0} y2={pBot} stroke="#ff7a1a" strokeWidth="1.5" />}
        {hover !== null && <rect x={x(hover)} y={0} width={step} height={pBot} fill="rgba(255,255,255,0.06)" />}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[150px] border border-line bg-[#0b0f15]/95 px-3 py-2 font-mono text-[10px] text-mute"
          style={{ left: Math.min(Math.max(0, x(hover) + step + 8), W - 170) }}
        >
          <div className="text-ink">{fmtDate(h.time, w.utcOffsetSeconds)} · {fmtTime(h.time, w.utcOffsetSeconds)}</div>
          <div className="mt-1 text-[12px] text-ink">
            {codeGlyph(h.weatherCode)} {Math.round(h.temperature)}° · {describeCode(h.weatherCode)}
          </div>
          <div className="mt-1">Rain {h.precipitation.toFixed(1)} mm · {Math.round(h.precipProbability)}%</div>
          <div className={h.snowfall > 0 ? "text-sky-200" : ""}>
            Snow {h.snowfall.toFixed(1)} cm{h.snowDepth > 0 ? ` · depth ${Math.round(h.snowDepth)} cm` : ""}
          </div>
          <div>Cloud {Math.round(h.cloudCover)}% · Wind {Math.round(h.windSpeed)} km/h</div>
        </div>
      )}
      <div className="absolute right-0 top-[-2px] flex gap-3 font-mono text-[9px] tracking-[0.1em] text-faint">
        <span><span className="mr-1 inline-block h-px w-3 bg-accent align-middle" />TEMP</span>
        <span><span className="mr-1 inline-block h-2 w-1.5 bg-sky-400/80 align-middle" />RAIN</span>
        <span><span className="mr-1 inline-block h-2 w-1.5 bg-[#e1e8ff] align-middle" />SNOW</span>
        <span><span className="mr-1 inline-block h-2 w-3 bg-white/30 align-middle" />CLOUD</span>
        <span className="text-emerald-300/80">┆ NOW</span>
      </div>
    </div>
  );
}

function DailyCards({ w, compact }: { w: WeatherBundle; compact: boolean }) {
  const lo = Math.min(...w.daily.map((d) => d.tMin));
  const hi = Math.max(...w.daily.map((d) => d.tMax));
  const span = Math.max(1, hi - lo);
  return (
    <div className={`grid h-full gap-1.5 pt-2 ${compact ? "scroll-thin auto-cols-[112px] grid-flow-col overflow-x-auto" : "grid-cols-7"}`}>
      {w.daily.map((d, i) => {
        const mid = d.time + 12 * HOUR;
        return (
          <div key={d.time} className={`flex min-w-0 flex-col items-center justify-between gap-0.5 px-2 py-2 ${i === 0 ? "bg-accent/10 ring-1 ring-accent/30" : "bg-white/[0.03]"}`}>
            <div className="text-center">
              <div className={`font-mono text-[11px] uppercase tracking-[0.14em] ${i === 0 ? "text-accent" : "text-ink/80"}`}>
                {i === 0 ? "Today" : fmtDay(mid, w.utcOffsetSeconds)}
              </div>
              <div className="font-mono text-[9px] text-faint">{fmtDate(mid, w.utcOffsetSeconds).split(" ").slice(1).join(" ")}</div>
            </div>
            <div className={`text-[28px] leading-none ${d.snowfallSum > 0 ? "text-sky-100" : "text-accent-soft"}`} title={describeCode(d.weatherCode)}>
              {codeGlyph(d.weatherCode)}
            </div>
            <div className="hidden w-full truncate text-center text-[10px] text-mute xl:block">{describeCode(d.weatherCode)}</div>
            <div className="text-center tabular-nums">
              <span className="text-[22px] font-light text-ink">{Math.round(d.tMax)}°</span>
              <span className="ml-1 text-[14px] text-mute">{Math.round(d.tMin)}°</span>
            </div>
            <div className="relative h-[3px] w-full bg-white/10">
              <span
                className="absolute h-[3px] bg-gradient-to-r from-sky-300 to-accent"
                style={{ left: `${((d.tMin - lo) / span) * 100}%`, width: `${Math.max(4, ((d.tMax - d.tMin) / span) * 100)}%` }}
              />
            </div>
            <div className="w-full space-y-0.5 font-mono text-[10px]">
              <div className={`flex justify-between gap-1 ${d.precipProbMax >= 50 ? "text-sky-300" : "text-mute"}`}>
                <span>☂{Math.round(d.precipProbMax)}%</span>
                <span className="truncate">{d.precipSum.toFixed(1)}</span>
              </div>
              <div className={`flex justify-between gap-1 ${d.snowfallSum > 0 ? "text-sky-100" : "text-faint"}`}>
                <span>❄</span>
                <span className="truncate">{d.snowfallSum > 0 ? `${d.snowfallSum.toFixed(1)}cm` : "—"}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyDeck({ compact }: { compact: boolean }) {
  const locate = useMyLocation();
  return (
    <div className="flex h-full flex-col justify-center gap-3 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="label !text-accent">Forecast</div>
        <h2 className="text-[22px] font-extralight uppercase tracking-[0.14em] text-ink md:text-[26px]">Where to?</h2>
        {!compact && (
          <p className="hidden text-[12px] text-mute xl:block">
            Pick a place, search, or double-click the globe — the 48-hour and 7-day forecast opens here.
          </p>
        )}
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-5"}`}>
        <button
          onClick={() => locate().catch(() => undefined)}
          className="inline-flex items-center justify-center gap-2 border border-accent/50 bg-accent/10 px-3 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-accent hover:bg-accent/20"
        >
          <IconCrosshair width={14} height={14} /> My location
        </button>
        {QUICK_PICKS.map((p) => (
          <button
            key={p.id}
            onClick={() => selectPlace(p)}
            className="group min-w-0 border border-line bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-white/25"
          >
            <div className="truncate text-[15px] font-light text-ink">{p.name}</div>
            <div className="truncate font-mono text-[9px] text-faint group-hover:text-mute">
              {p.lat.toFixed(2)}, {p.lon.toFixed(2)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ShareButton({ compact, disabled }: { compact: boolean; disabled: boolean }) {
  const setShareOpen = useAppStore((s) => s.setShareOpen);
  return (
    <button
      onClick={() => setShareOpen(true)}
      disabled={disabled}
      aria-label="Share this forecast"
      className="inline-flex items-center gap-1.5 border border-accent/50 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
    >
      <IconShare width={14} height={14} />
      {!compact && <span className="hidden xl:inline">Share</span>}
    </button>
  );
}
