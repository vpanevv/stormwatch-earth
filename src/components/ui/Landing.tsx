"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Place } from "@/types/weather";
import { useAppStore } from "@/store/useAppStore";
import { usePlaceSearch } from "@/hooks/usePlaceSearch";
import { selectCoordinates, selectPlace, useMyLocation } from "@/lib/actions";
import { GAZETTEER } from "@/lib/gazetteer";
import { subsolarPoint } from "@/lib/sun";
import { fmtInt } from "@/lib/format";
import { IconCrosshair, IconSearch } from "./icons";
import { KIND_LABEL } from "./SearchPanel";
import { Brand, Divider } from "./Brand";
import { LightningHero } from "./LiveLightning";
import { useLightningHotspot, useSatelliteLightning } from "@/hooks/useDataFeeds";

/**
 * The welcome page: an editorial hero over a slowly turning planet (layout and motion language after
 * Watched's landing, MIT). Choosing a place — search, "Use my location", a chip, "Surprise me" or a click
 * on the globe — enters the observatory and dives to it. "Explore the globe" enters without a place.
 */

/** The landing's quick picks, after "↺ last place". */
const TRY: Place[] = [
  ...["New York", "London", "Sydney"].map((n) => GAZETTEER.find((p) => p.name === n)!),
  { ...GAZETTEER.find((p) => p.name === "Sahara")!, id: "try-sahara", name: "Sahara Desert" },
];

/** Places with weather worth seeing; "Surprise me" also considers the live storm cells. */
const SURPRISES: Place[] = [
  { id: "s-maracaibo", name: "Lake Maracaibo", context: "Catatumbo lightning, Venezuela", kind: "region", lat: 9.6, lon: -71.6 },
  { id: "s-tromso", name: "Tromsø", context: "Troms, Norway", kind: "city", lat: 69.6492, lon: 18.9553 },
  { id: "s-oymyakon", name: "Oymyakon", context: "Sakha, Russia", kind: "city", lat: 63.4608, lon: 142.7858 },
  { id: "s-cherrapunji", name: "Cherrapunji", context: "Meghalaya, India", kind: "city", lat: 25.2702, lon: 91.7323 },
  { id: "s-washington", name: "Mount Washington", context: "New Hampshire, United States", kind: "place", lat: 44.2706, lon: -71.3033 },
  { id: "s-ushuaia", name: "Ushuaia", context: "Tierra del Fuego, Argentina", kind: "city", lat: -54.8019, lon: -68.303 },
  { id: "s-darwin", name: "Darwin", context: "Northern Territory, Australia", kind: "city", lat: -12.4634, lon: 130.8456 },
  { id: "s-deathvalley", name: "Death Valley", context: "California, United States", kind: "place", lat: 36.5054, lon: -117.0794 },
  { id: "s-reunion", name: "Cilaos", context: "La Réunion", kind: "place", lat: -21.1342, lon: 55.4712 },
];

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function windowLabel(now: number) {
  const a = new Date(now);
  const b = new Date(now + 6 * 86_400_000);
  const end = `${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  const start = a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}` : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  return `NEXT 7 DAYS · ${start} → ${end} UTC`;
}

/** Text that resolves out of random glyphs once, like an instrument settling. */
function useScramble(text: string, start: boolean, ms = 900) {
  const [out, setOut] = useState(() => text.replace(/\S/g, " "));
  useEffect(() => {
    if (!start) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setOut(text);
    const glyphs = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ/·→";
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      const fixed = Math.floor(p * text.length);
      setOut(
        text
          .split("")
          .map((ch, i) => (i < fixed || ch === " " ? ch : glyphs[(Math.random() * glyphs.length) | 0]))
          .join(""),
      );
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, start, ms]);
  return out;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const ease = [0.2, 0.8, 0.2, 1] as const;

export function Landing() {
  const entered = useAppStore((s) => s.entered);
  return <AnimatePresence>{!entered && <LandingView key="landing" />}</AnimatePresence>;
}

function LandingView() {
  const enter = useAppStore((s) => s.enter);
  const globeReady = useAppStore((s) => s.globeReady);
  const radarIdx = useAppStore((s) => s.radar.data);
  const hot = useLightningHotspot();
  const storm = hot?.available ? hot : null;
  const sat = useSatelliteLightning();
  const satLive = sat?.available && sat.flashes > 0 ? sat : null;
  /** The busiest storm NOAA's satellites see right now, as a place to fly to. */
  const watchSat = () => {
    const c = satLive?.clusters[0];
    if (!c) return;
    const ns = `${Math.abs(c.lat).toFixed(1)}°${c.lat >= 0 ? "N" : "S"} ${Math.abs(c.lon).toFixed(1)}°${c.lon >= 0 ? "E" : "W"}`;
    go({ id: `glm-${c.lat},${c.lon}`, name: ns, context: "Busiest storm seen by NOAA's satellites", kind: "coords", lat: c.lat, lon: c.lon });
  };
  const resume = useAppStore((s) => s.selection);
  const geolocating = useAppStore((s) => s.geolocating);
  const now = useNow();
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const listId = useId();
  const locate = useMyLocation();

  useEffect(() => {
    const id = setTimeout(() => setShown(true), 250);
    return () => clearTimeout(id);
  }, []);

  // On phones the planet sits whole in the clear band between the header and the hero copy (CameraRig frames it).
  useEffect(() => {
    const header = headerRef.current, hero = heroRef.current;
    if (!header || !hero) return;
    const phone = window.matchMedia("(max-width: 1023px)");
    const measure = () => {
      if (!phone.matches) return useAppStore.getState().setLandingBand(null);
      const top = Math.round(header.getBoundingClientRect().bottom + 6);
      const bottom = Math.round(hero.getBoundingClientRect().top - 6);
      useAppStore.getState().setLandingBand({ top, bottom: Math.max(top + 80, bottom) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hero);
    ro.observe(header);
    window.addEventListener("resize", measure);
    phone.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      phone.removeEventListener("change", measure);
    };
  }, []);

  /** Pick → dive. Selection first, so the entry flight targets it. */
  const go = useCallback(
    (p: Place) => {
      if (p.kind === "coords") selectCoordinates(p);
      else selectPlace(p);
      enter();
    },
    [enter],
  );
  const search = usePlaceSearch(go);
  const { q, setQ, items, active, setActive, busy, choose } = search;
  const showList = open && q.trim().length > 0;

  // "/" focuses the field, like the reference.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const surprise = () => {
    // The live storm (Xweather) joins the pool when lightning is hitting it.
    const pool = storm && storm.strikes.count > 0 ? [...SURPRISES, storm.place, storm.place] : SURPRISES;
    go(pool[(Math.random() * pool.length) | 0]);
  };

  const onLocate = async () => {
    setLocNote(null);
    try {
      await locate();
      enter();
    } catch (e) {
      const code = (e as GeolocationPositionError)?.code;
      setLocNote(code === 1 ? "Location permission denied" : "Couldn’t get your position");
    }
  };

  const kicker = useScramble(windowLabel(now - (now % 86_400_000)), shown);
  const sun = subsolarPoint(now);
  const d = new Date(now);
  const latest = radarIdx?.frames.at(-1)?.time;
  const lines: React.ReactNode[] = [
    "Every storm,",
    <>
      watched <span className="font-serif italic font-normal tracking-normal text-accent">live</span>
    </>,
    "from orbit.",
  ];

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-40"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, x: -24, filter: "blur(4px)" }}
      transition={{ duration: 0.7, ease }}
    >
      {/* ink behind the text column on wide screens; on phones the planet has its own band above the copy */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block lg:bg-[linear-gradient(90deg,#020306_30%,rgba(2,3,6,0.75)_45%,transparent_62%)]" />
      <Bezel />

      {/* top bar */}
      <header ref={headerRef} className="pointer-events-auto absolute inset-x-6 top-5 flex items-start justify-between lg:inset-x-12 lg:top-7">
        <Brand>
          <Divider />
          <button onClick={enter} disabled={!globeReady} className="uppercase transition-colors hover:text-accent disabled:opacity-40">
            <span className="sm:hidden">Explore ↗</span>
            <span className="hidden sm:inline">Explore the globe ↗</span>
          </button>
        </Brand>
        <div className="hidden font-mono text-[13px] tracking-[0.1em] text-mute sm:block">
          {d.toISOString().slice(0, 10)} <span className="text-ink">{d.toISOString().slice(11, 19)}</span> UTC
        </div>
      </header>

      {/* the live lightning count: the page's headline number */}
      <div className="pointer-events-auto absolute right-12 top-[15vh] hidden lg:block">
        <LightningHero hot={hot} sat={sat} now={now} onWatch={() => storm && go(storm.place)} onWatchSat={watchSat} />
      </div>

      {/* hero column */}
      <section ref={heroRef} className="pointer-events-auto absolute inset-x-6 bottom-6 lg:bottom-auto lg:left-12 lg:right-auto lg:top-[13vh] lg:w-[min(780px,52vw)]">
        <div className="hidden items-center gap-4 font-mono text-[12px] tracking-[0.16em] text-mute sm:flex">
          <span className="h-px w-8 bg-white/25" />
          <span className="whitespace-pre">{kicker}</span>
        </div>

        <h1 className="font-display text-[clamp(34px,min(8.4vw,11.5vh),120px)] sm:mt-6 font-semibold leading-[0.9] tracking-[-0.01em] text-[#ece8e0] [font-stretch:78%] lg:mt-[3.4vh]">
          {lines.map((line, i) => (
            <span key={i} className="block overflow-hidden pb-[0.06em]">
              <motion.span
                className="block"
                initial={{ y: "108%" }}
                animate={shown ? { y: "0%" } : undefined}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.9, ease }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={shown ? { opacity: 1, y: 0 } : undefined}
          transition={{ delay: 0.55, duration: 0.7 }}
          className="mt-3 hidden max-w-[620px] font-display text-[14px] [@media(min-height:820px)]:block lg:block leading-snug sm:mt-5 sm:text-[17px] sm:leading-relaxed text-[#a4acb6] lg:mt-[3vh] lg:text-[clamp(16px,2.4vh,21px)]"
        >
          {storm && storm.strikes.count > 0 ? (
            <span className="text-ink">
              Right now, lightning has struck <span className="font-semibold text-accent">{fmtInt(storm.strikes.count)}&nbsp;times</span> in{" "}
              {storm.windowMin}&nbsp;minutes near {storm.place.name}.{" "}
            </span>
          ) : satLive ? (
            <span className="text-ink">
              In the last {satLive.windowMin}&nbsp;minutes, NOAA&apos;s satellites saw{" "}
              <span className="font-semibold text-accent">{fmtInt(satLive.flashes)}&nbsp;lightning flashes</span> over the Americas.{" "}
            </span>
          ) : null}
          Enter any place on Earth. See its clouds, radar, snow and lightning on a live planet, and the forecast for the
          next&nbsp;7&nbsp;days.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={shown ? { opacity: 1, y: 0 } : undefined}
          transition={{ delay: 0.7, duration: 0.7 }}
          className="relative mt-5 sm:mt-8 lg:mt-[5vh]"
        >
          <div className="font-mono text-[12px] tracking-[0.16em] text-mute">01 / PLACE</div>
          <div className="mt-3 flex items-center gap-3 border-b border-white/20 pb-3 focus-within:border-accent/70">
            <IconSearch width={20} height={20} className="shrink-0 text-mute" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
                search.setNote(null);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={(e) => search.onKeyDown(e, () => inputRef.current?.blur())}
              placeholder="Search a place"
              aria-label="Search a place"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
              className="min-w-0 flex-1 bg-transparent font-mono text-[20px] tracking-[0.04em] text-ink placeholder:text-mute focus:outline-none lg:text-[26px]"
            />
            {busy ? (
              <span className="font-mono text-[11px] tracking-[0.16em] text-accent">SEARCHING</span>
            ) : (
              <kbd className="hidden h-7 w-7 items-center justify-center border border-white/25 font-mono text-[13px] text-mute sm:flex">/</kbd>
            )}
            <span className="h-9 w-px bg-white/15" />
            <button
              onClick={onLocate}
              disabled={geolocating}
              className="flex shrink-0 items-center gap-2 font-mono text-[12px] uppercase tracking-[0.16em] text-ink transition-colors hover:text-accent disabled:opacity-60"
            >
              <IconCrosshair width={15} height={15} className={geolocating ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{geolocating ? "Locating…" : "Use my location"}</span>
            </button>
          </div>

          <AnimatePresence>
            {showList && (
              <motion.ul
                id={listId}
                role="listbox"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="scroll-thin absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-auto border border-line bg-[#07090c]/95 backdrop-blur"
              >
                {items.length === 0 && (
                  <li className="px-4 py-3 font-mono text-[12px] text-mute">Press Enter to search OpenStreetMap</li>
                )}
                {items.map((p, i) => (
                  <li
                    key={p.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(p);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex cursor-pointer items-center gap-4 px-4 py-2.5 ${i === active ? "bg-white/[0.06]" : ""}`}
                  >
                    <span className={`h-4 w-px ${i === active ? "bg-accent" : "bg-white/15"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink">{p.name}</span>
                      {p.context && <span className="block truncate text-[12px] text-mute">{p.context}</span>}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{KIND_LABEL[p.kind]}</span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
          {(search.note || locNote) && <div className="mt-2 font-mono text-[11px] text-amber-300/90">{search.note ?? locNote}</div>}
        </motion.div>

        {/* phones: the live lightning count, under the search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={shown ? { opacity: 1, y: 0 } : undefined}
          transition={{ delay: 0.76, duration: 0.7 }}
          className="mt-4 lg:hidden"
        >
          <LightningHero compact hot={hot} sat={sat} now={now} onWatch={() => storm && go(storm.place)} onWatchSat={watchSat} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={shown ? { opacity: 1, y: 0 } : undefined}
          transition={{ delay: 0.82, duration: 0.7 }}
          className="mt-5 sm:mt-7 lg:mt-[3.6vh]"
        >
          <div className="flex items-center justify-between gap-4 font-mono text-[12px] tracking-[0.16em] text-mute">
            <span>02 / OR TRY</span>
            <span className="hidden items-center gap-2 sm:flex">
              <IconCrosshair width={13} height={13} /> OR CLICK THE GLOBE TO DROP A PIN
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2 sm:mt-3">
            {(resume ? [resume, ...TRY.filter((p) => p.name !== resume.name && !(p.lat === resume.lat && p.lon === resume.lon))] : TRY).map((p, i) => (
              <button
                key={p.id}
                onClick={() => (resume && i === 0 ? enter() : go(p))}
                className="border border-white/20 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink transition-colors hover:border-white/50 sm:px-3.5 sm:py-2.5 sm:text-[12px] sm:tracking-[0.16em]"
              >
                {resume && i === 0 ? `↺ ${p.name}` : p.name}
              </button>
            ))}
            <button
              onClick={surprise}
              className="border border-accent/50 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent/10 sm:px-3.5 sm:py-2.5 sm:text-[12px] sm:tracking-[0.16em]"
            >
              Surprise me
            </button>
          </div>
          <div className="mt-[2.6vh] hidden font-mono text-[11px] uppercase tracking-[0.16em] text-faint lg:block [@media(max-height:860px)]:!hidden">
            Live data · Open-Meteo · RainViewer · NASA GIBS · OpenStreetMap
          </div>
        </motion.div>
      </section>

      {/* corner readouts */}
      <footer className="absolute inset-x-6 bottom-5 hidden items-end justify-between font-mono text-[11px] tracking-[0.14em] lg:inset-x-12 lg:bottom-7 lg:flex lg:text-[12px]">
        <div className="leading-relaxed">
          {globeReady ? (
            <>
              <div className="text-ink">
                {radarIdx?.frames.length ?? 0} RADAR FRAMES <span className="text-mute">· RAINVIEWER</span>
              </div>
              <div className="text-mute">
                {latest ? `LATEST ${new Date(latest).toISOString().slice(11, 16)}Z · ${Math.max(0, Math.round((now - latest) / 60_000))} MIN AGO` : "RADAR CONNECTING"}
                {storm && (
                  <span className="hidden sm:inline">
                    {" "}
                    · <span className="text-accent">⚡ {fmtInt(storm.strikes.count)}</span> STRIKES / {storm.windowMin} MIN · XWEATHER
                  </span>
                )}
              </div>
            </>
          ) : (
            <StreamingReadout />
          )}
        </div>
        <div className="text-right leading-relaxed">
          <div className="text-ink">
            SUN {Math.abs(sun.lat).toFixed(1)}°{sun.lat >= 0 ? "N" : "S"} {String(Math.abs(sun.lon).toFixed(1)).padStart(5, "0")}°{sun.lon >= 0 ? "E" : "W"}
          </div>
          <div className="text-mute">SUB-SOLAR POINT</div>
        </div>
      </footer>
    </motion.div>
  );
}

function StreamingReadout() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    // drei's loader progress is unreliable with cache hits; show a calm, monotonic estimate instead.
    const id = setInterval(() => setPct((p) => Math.min(96, p + (100 - p) * 0.08)), 120);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <div className="text-ink">STREAMING PLANET {Math.round(pct)}%</div>
      <div className="text-mute">8K SURFACE · RADAR · LIGHTNING</div>
    </>
  );
}

/** Instrument frame: hairline border with tick marks along the top and bottom edges. */
function Bezel() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-2 border border-white/[0.07]">
      <div className="absolute inset-x-0 top-0 h-2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0_1px,transparent_1px_80px)]" />
      <div className="absolute inset-x-0 bottom-0 h-2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0_1px,transparent_1px_80px)]" />
    </div>
  );
}
