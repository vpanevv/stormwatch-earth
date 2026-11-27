"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Place } from "@/types/weather";
import { useAppStore } from "@/store/useAppStore";
import { useBootstrap, useLightningFeed, useWeatherSync } from "@/hooks/useDataFeeds";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { TopBar } from "./ui/TopBar";
import { LayerRail } from "./ui/LayerRail";
import { SearchPanel } from "./ui/SearchPanel";
import { Sidebar } from "./ui/Sidebar";
import { TimelinePlayer } from "./ui/TimelinePlayer";
import { Hud } from "./ui/Hud";
import { Landing } from "./ui/Landing";
import { AboutDialog } from "./ui/AboutDialog";
import { ForecastDeck } from "./ui/ForecastDeck";
import { IconClose, IconPanel } from "./ui/icons";
import { MarkerLabel } from "./ui/MarkerLabel";
import { PinCard } from "./ui/PinCard";
import { ShareDialog } from "./ui/ShareDialog";

// WebGL never renders on the server; the globe bundle loads after first paint.
const GlobeCanvas = dynamic(() => import("./globe/GlobeCanvas"), { ssr: false });

const SIDEBAR_W = 384;
const GAP = 16;
const TIMELINE_H = 84;
const DECK_COLLAPSED = 74;
const LAST_PLACE_KEY = "stormwatch:last-place";

function useViewportHeight() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("resize", cb);
      return () => window.removeEventListener("resize", cb);
    },
    () => window.innerHeight,
    () => 800,
  );
}

/** A shared link (?q=lat,lon&n=name) opens that place; otherwise remember the last place across visits. */
function usePersistedPlace() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q")?.split(",").map(Number);
      if (q && q.length === 2 && q.every(Number.isFinite) && Math.abs(q[0]) <= 90 && Math.abs(q[1]) <= 180) {
        const place: Place = {
          id: `link-${q[0]},${q[1]}`,
          name: params.get("n")?.slice(0, 80) || `${q[0].toFixed(2)}, ${q[1].toFixed(2)}`,
          context: params.get("c")?.slice(0, 120) || undefined,
          kind: "city",
          lat: q[0],
          lon: q[1],
        };
        useAppStore.getState().select(place, { fly: false });
        window.history.replaceState(null, "", window.location.pathname);
        return subscribePersist();
      }
      const raw = localStorage.getItem(LAST_PLACE_KEY);
      if (raw && !useAppStore.getState().selection) useAppStore.getState().select(JSON.parse(raw) as Place, { fly: false });
    } catch {
      /* ignore corrupt storage */
    }
    return subscribePersist();
  }, []);
}

function subscribePersist() {
  return useAppStore.subscribe((s, prev) => {
    if (s.selection === prev.selection) return;
    if (s.selection) localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(s.selection));
    else localStorage.removeItem(LAST_PLACE_KEY);
  });
}

const chrome = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

export function StormWatchApp() {
  useBootstrap();
  useWeatherSync();
  useLightningFeed();
  usePersistedPlace();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const vh = useViewportHeight();
  const entered = useAppStore((s) => s.entered);
  const sheetOpen = useAppStore((s) => s.sheetOpen);
  const setSheetOpen = useAppStore((s) => s.setSheetOpen);
  const selection = useAppStore((s) => s.selection);
  const [deckCollapsed, setDeckCollapsed] = useState(false);

  // The forecast deck is the primary surface: ~40% of the viewport, the globe takes what's left.
  const deckH = Math.round(Math.min(desktop ? 400 : 360, Math.max(desktop ? 268 : 240, vh * 0.38)));
  // With no place yet, the deck is a compact picker; with one, it's the full forecast.
  const deckShown = !selection ? (desktop ? 172 : 200) : deckCollapsed ? DECK_COLLAPSED : deckH;
  const bottomOffset = desktop ? TIMELINE_H + GAP * 3 + deckShown : 80 + deckShown + 8;
  const topOffset = desktop ? 100 : 200;
  const sidebarOffset = desktop ? SIDEBAR_W + GAP * 2 : 0;

  // Overlays on the globe (the dropped pin's card) keep clear of these.
  useEffect(() => {
    useAppStore.getState().setUiInsets({ top: desktop ? 150 : 200, right: sidebarOffset, bottom: bottomOffset, left: 0 });
  }, [desktop, sidebarOffset, bottomOffset]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-void">
      <div className="absolute inset-0">
        <GlobeCanvas sidebarOffset={sidebarOffset} bottomOffset={bottomOffset} topOffset={topOffset} />
      </div>
      <div className="tick-grid pointer-events-none absolute inset-0" />
      <MarkerLabel />
      {entered && <PinCard />}

      {entered &&
        (desktop ? (
          <>
            <motion.div {...chrome} transition={{ delay: 0.6 }} className="absolute left-6 top-5">
              <TopBar />
            </motion.div>
            <motion.div
              {...chrome}
              transition={{ delay: 0.75 }}
              className="absolute left-6 top-[98px]"
              style={{ right: SIDEBAR_W + GAP * 3 }}
            >
              <LayerRail />
            </motion.div>
            <motion.aside
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              className="absolute right-4 top-4 flex flex-col gap-3"
              style={{ width: SIDEBAR_W, bottom: TIMELINE_H + GAP * 2 }}
              aria-label="Location details"
            >
              <SearchPanel />
              <Sidebar />
            </motion.aside>
            <motion.div
              {...chrome}
              transition={{ delay: 1.1 }}
              className="pointer-events-none absolute left-6"
              style={{ bottom: TIMELINE_H + GAP * 3 + deckShown + 6, right: SIDEBAR_W + GAP * 3 }}
            >
              <Hud />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 40, height: deckShown }}
              animate={{ opacity: 1, y: 0, height: deckShown }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.2, 0.8, 0.2, 1], height: { duration: 0.35, delay: 0 } }}
              className="absolute left-4"
              style={{ right: SIDEBAR_W + GAP * 2, bottom: TIMELINE_H + GAP * 2 }}
            >
              <ForecastDeck collapsed={deckCollapsed} onToggle={() => setDeckCollapsed((c) => !c)} />
            </motion.div>
            <motion.div {...chrome} transition={{ delay: 0.65 }} className="absolute inset-x-4 bottom-4">
              <TimelinePlayer />
            </motion.div>
          </>
        ) : (
          <>
            <motion.div {...chrome} transition={{ delay: 0.5 }} className="absolute inset-x-3 top-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <TopBar compact />
                <button
                  onClick={() => setSheetOpen(!sheetOpen)}
                  className="panel flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink"
                  aria-expanded={sheetOpen}
                >
                  {sheetOpen ? <IconClose width={14} height={14} /> : <IconPanel width={14} height={14} />}
                  {selection ? "Details" : "Overview"}
                </button>
              </div>
              <SearchPanel />
              <LayerRail scroll />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 40, height: deckShown }}
              animate={{ opacity: 1, y: 0, height: deckShown }}
              transition={{ delay: 0.4, height: { duration: 0.35, delay: 0 } }}
              className="absolute inset-x-2"
              style={{ bottom: 80 }}
            >
              <ForecastDeck compact collapsed={deckCollapsed} onToggle={() => setDeckCollapsed((c) => !c)} />
            </motion.div>
            <motion.div {...chrome} transition={{ delay: 0.6 }} className="absolute inset-x-2 bottom-2">
              <TimelinePlayer compact />
            </motion.div>
            <AnimatePresence>
              {sheetOpen && (
                <motion.aside
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 260 }}
                  className="absolute inset-x-0 bottom-0 z-30 flex h-[72dvh] flex-col"
                  aria-label="Location details"
                >
                  <Sidebar />
                </motion.aside>
              )}
            </AnimatePresence>
          </>
        ))}
      <Landing />
      <ShareDialog />
      <AboutDialog />
    </main>
  );
}
