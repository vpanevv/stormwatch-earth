"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

/**
 * "How this works": a full-height reading overlay (after Watched's About page, MIT): an ink curtain drops in,
 * a section index on the left tracks the reading position, Esc or Close leaves and focus returns.
 */

const SECTIONS = [
  { id: "short", index: "00", title: "The short version" },
  { id: "data", index: "01", title: "Where the data comes from" },
  { id: "globe", index: "02", title: "Reading the globe" },
  { id: "time", index: "03", title: "Timeline and forecast" },
  { id: "limits", index: "04", title: "What we can’t see" },
  { id: "privacy", index: "05", title: "Privacy" },
  { id: "credits", index: "06", title: "Credits" },
  { id: "keys", index: "07", title: "Keyboard" },
] as const;

const ease = [0.65, 0, 0.35, 1] as const;

export function AboutDialog() {
  const open = useAppStore((s) => s.aboutOpen);
  const setOpen = useAppStore((s) => s.setAboutOpen);

  // "?" opens / closes from anywhere (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA"].includes((document.activeElement?.tagName ?? "").toUpperCase());
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setOpen(!useAppStore.getState().aboutOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return <AnimatePresence>{open && <AboutView key="about" onClose={() => setOpen(false)} />}</AnimatePresence>;
}

function AboutView({ onClose }: { onClose: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const [current, setCurrent] = useState<string>("short");

  useEffect(() => {
    returnFocus.current = document.activeElement;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && scroller.current) {
        // Minimal focus trap.
        const f = scroller.current.closest("[role=dialog]")!.querySelectorAll<HTMLElement>("button, a[href]");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      (returnFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  // Index follows the reading position.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setCurrent(vis[0].target.id);
      },
      { root, rootMargin: "-20% 0px -65% 0px" },
    );
    root.querySelectorAll("section[id]").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const jump = (id: string) => scroller.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      className="fixed inset-0 z-[70] flex flex-col bg-[#050608]"
      initial={{ clipPath: "inset(0 0 100% 0)" }}
      animate={{ clipPath: "inset(0 0 0% 0)" }}
      exit={{ clipPath: "inset(100% 0 0 0)" }}
      transition={{ duration: 0.45, ease }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 lg:px-12">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-[24px] leading-none text-ink">
            StormWatch<span className="text-accent">.</span>
          </span>
          <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute">/ About</span>
        </div>
        <button
          ref={closeBtn}
          onClick={onClose}
          className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.16em] text-ink hover:text-accent"
        >
          Close <kbd className="border border-white/25 px-1.5 py-0.5 text-[10px] text-mute">ESC</kbd>
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Sections" className="hidden w-[280px] shrink-0 border-r border-white/10 px-12 py-12 lg:block">
          <ol className="space-y-3 font-mono text-[12px] uppercase tracking-[0.14em]">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => jump(s.id)}
                  className={`flex gap-3 text-left uppercase transition-colors ${current === s.id ? "text-ink" : "text-faint hover:text-mute"}`}
                >
                  <span className={current === s.id ? "text-accent" : ""}>{s.index}</span>
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <article className="mx-auto max-w-[760px] px-6 pb-32 pt-10 lg:px-12 lg:pt-16">
            <motion.h1
              id="about-title"
              className="font-display text-[clamp(56px,9vw,112px)] font-semibold leading-[0.9] text-[#ece8e0] [font-stretch:78%]"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.7 }}
            >
              How this
              <br />
              <span className="font-serif font-normal italic text-accent">works</span>.
            </motion.h1>
            <p className="mt-8 font-display text-[21px] leading-relaxed text-[#a4acb6]">
              Pick a spot on Earth. We pull its live conditions and 7-day forecast, paint the radar, clouds and snow onto a
              rendered planet, and show yesterday’s satellite view of it. Everything is public data, labelled with where it
              came from.
            </p>

            <Section id="short" index="00" title="The short version">
              <Facts
                items={[
                  ["What is it?", "A weather observatory on a 3D Earth: search any place, lock onto it, read its forecast, and watch the last 24 hours play back."],
                  ["Is it live?", "The forecast, current conditions and radar are live. Some global layers are modelled or simulated, and every panel says which (green dot: live, amber: modelled or simulated)."],
                  ["Does it cost anything?", "No accounts, no keys needed. It runs on free public data services."],
                ]}
              />
            </Section>

            <Section id="data" index="01" title="Where the data comes from">
              <SourceTable
                rows={[
                  ["Current weather, 48-hour and 7-day forecast, snowfall, snow depth", "Open-Meteo (OpenWeather when a key is set)", "live"],
                  ["Radar precipitation, last ~2 hours", "RainViewer", "live"],
                  ["Satellite view on the share card, HD ground near your place", "NASA GIBS (VIIRS, Blue Marble)", "live"],
                  ["Place search and names", "Open-Meteo geocoder, OpenStreetMap Nominatim", "live"],
                  ["Local map", "OpenStreetMap", "live"],
                  ["Global clouds, temperature and wind fields", "A climate model (OpenWeather tiles with a key)", "model"],
                  ["Snow cover and snowfall away from radar", "The same climate model", "model"],
                  ["Lightning strikes and storm cells", "A simulation of real storm climatology", "sim"],
                ]}
              />
              <P>
                Weather warnings are worked out from forecast thresholds (gusts, rainfall, snowfall, heat, cold, thunder
                risk). They are not official bulletins.
              </P>
            </Section>

            <Section id="globe" index="02" title="Reading the globe">
              <Facts
                items={[
                  ["Rain", "Radar reflectivity, decoded and recoloured: blue light, green moderate, yellow heavy, red extreme."],
                  ["Snow", "White ground is seasonal snow and sea ice. The pale wash with drifting flakes is falling snow."],
                  ["Lightning", "Each strike flashes, then ages from white through orange to deep red until it leaves the 15-minute, 1-hour or 24-hour window."],
                  ["Storms", "Rotating rings mark storm cells. Severe ones get spiral arms, and the dashed line is their next two hours of track."],
                  ["The marker", "The orange lock is your place. Close up, a sharper NASA image is blended in around it."],
                ]}
              />
            </Section>

            <Section id="time" index="03" title="Timeline and forecast">
              <P>
                The bar at the bottom plays the last 24 hours at ×1, ×5 or ×10. The sun, clouds, radar and lightning move with
                it. Real radar only goes back about two hours (the blue strip on the bar); before that, precipitation is
                simulated. The forecast deck shows the next 48 hours by hour and the next 7 days, with rain and snow
                amounts.
              </P>
            </Section>

            <Section id="limits" index="04" title="What we can’t see">
              <Facts
                items={[
                  ["Radar gaps", "Many oceans and countries have no public radar. There the rain layer stays empty in live mode."],
                  ["Lightning", "There is no free public lightning feed, so strikes are simulated from where storms usually form. Swapping in a licensed feed is one interface away."],
                  ["Global fields", "Without an OpenWeather key, the worldwide clouds, temperature, wind and snow are a model. The numbers for your selected place are real."],
                  ["Resolution", "From orbit the globe is about 5 km per pixel. Near your place it sharpens to about 0.5 km."],
                ]}
              />
            </Section>

            <Section id="privacy" index="05" title="Privacy">
              <P>
                Your position is only read when you press “Use my location”, and only to look up its weather. There are no
                accounts or trackers. Your last place is kept in this browser so the forecast is ready next time. Searches
                and weather requests go through this app’s server to the providers above; map and satellite tiles load
                straight from them.
              </P>
            </Section>

            <Section id="credits" index="06" title="Credits">
              <ul className="space-y-2 text-[15px] leading-relaxed text-[#a4acb6]">
                <li>Earth textures © Solar System Scope, CC BY 4.0 (from NASA Blue Marble / Black Marble), modified.</li>
                <li>Globe shading and page design adapted from Watched by Armaan Gupta (MIT).</li>
                <li>Imagery: NASA GIBS / EOSDIS. Radar: RainViewer. Weather: Open-Meteo.</li>
                <li>Map data © OpenStreetMap contributors. Geocoding: Nominatim, Open-Meteo.</li>
                <li>Type: Instrument Sans and Instrument Serif (SIL OFL), Geist.</li>
              </ul>
            </Section>

            <Section id="keys" index="07" title="Keyboard">
              <dl className="grid grid-cols-[96px_1fr] gap-y-3 text-[15px] text-[#a4acb6]">
                {[
                  ["/", "Search a place"],
                  ["↑ ↓ ↵", "Move through suggestions, choose"],
                  ["?", "Open or close this page"],
                  ["Esc", "Close"],
                  ["Drag · scroll", "Turn and zoom the globe; double-click to drop a pin"],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt>
                      <kbd className="border border-white/25 px-2 py-0.5 font-mono text-[12px] text-ink">{k}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          </article>
        </div>
      </div>
    </motion.div>
  );
}

function Section({ id, index, title, children }: { id: string; index: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-8 border-t border-white/10 pt-8">
      <div className="font-mono text-[12px] tracking-[0.16em] text-accent">{index}</div>
      <h2 className="mt-2 font-display text-[34px] font-semibold leading-tight text-[#ece8e0] [font-stretch:85%]">{title}</h2>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-[16px] leading-relaxed text-[#a4acb6]">{children}</p>;
}

function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="divide-y divide-white/10 border-y border-white/10">
      {items.map(([t, d]) => (
        <div key={t} className="grid gap-1 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
          <dt className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink">{t}</dt>
          <dd className="text-[15px] leading-relaxed text-[#a4acb6]">{d}</dd>
        </div>
      ))}
    </dl>
  );
}

function SourceTable({ rows }: { rows: [string, string, "live" | "model" | "sim"][] }) {
  const badge = { live: ["bg-emerald-400", "Live"], model: ["bg-amber-400", "Model"], sim: ["bg-amber-400", "Simulated"] } as const;
  return (
    <div className="border-y border-white/10">
      {rows.map(([what, src, kind]) => (
        <div key={what} className="grid gap-1 border-b border-white/10 py-3 last:border-0 sm:grid-cols-[1fr_220px_92px] sm:gap-4">
          <div className="text-[15px] text-ink/90">{what}</div>
          <div className="text-[13px] text-mute">{src}</div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            <span className={`h-1.5 w-1.5 rounded-full ${badge[kind][0]}`} />
            {badge[kind][1]}
          </div>
        </div>
      ))}
    </div>
  );
}
