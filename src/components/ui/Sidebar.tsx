"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Summary } from "./sidebar/Summary";
import { Events } from "./sidebar/Events";
import { TimelineSection } from "./sidebar/TimelineSection";
import { GlobalOverview } from "./sidebar/GlobalOverview";
import { IconClose, IconShare } from "./icons";

export function Sidebar() {
  const selection = useAppStore((s) => s.selection);
  const select = useAppStore((s) => s.select);
  const owm = useAppStore((s) => s.config.openweather);

  return (
    <div className="panel flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
        <span className="label">{selection ? "Location lock" : "Overview"}</span>
        {selection && (
          <div className="flex items-center gap-4">
          <button
            onClick={() => useAppStore.getState().setShareOpen(true)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent hover:text-accent-soft"
          >
            <IconShare width={12} height={12} /> Share
          </button>
          <button
            onClick={() => select(null)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-mute hover:text-ink"
            aria-label="Clear selection"
          >
            Release <IconClose width={12} height={12} />
          </button>
          </div>
        )}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={selection?.id ?? "global"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="space-y-8"
          >
            {selection ? (
              <>
                <Summary place={selection} />
                <Events place={selection} />
                <TimelineSection />
              </>
            ) : (
              <GlobalOverview />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <footer className="border-t border-line px-5 py-2.5 font-mono text-[9px] leading-relaxed tracking-[0.06em] text-faint">
        Weather: Open-Meteo{owm ? " · OpenWeather" : ""} · Radar: RainViewer ·
        Geocoding: Open-Meteo, Nominatim · Map data © OpenStreetMap contributors · Imagery: NASA GIBS · Earth textures ©
        Solar System Scope (CC BY 4.0), modified · Lightning &amp; storm cells simulated
      </footer>
    </div>
  );
}
