"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { formatLat, formatLon } from "@/lib/geo";
import { fmtInt } from "@/lib/format";
import { SourceBadge } from "./primitives";
import { useLayerSources } from "./LayerRail";

/** Cursor read-out, altitude and legends for the active layers. */
export function Hud() {
  const hover = useAppStore((s) => s.hover);
  const alt = useAppStore((s) => s.cameraAltitudeKm);
  const layers = useAppStore((s) => s.layers);
  const sources = useLayerSources();

  return (
    <div className="pointer-events-none flex flex-col gap-3 select-none">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
      <AnimatePresence>
        {layers.rain && (
          <Legend key="rain" title="Precipitation" source={sources.rain}>
            <div className="flex h-1.5 w-36">
              <span className="flex-1 bg-rain-light" />
              <span className="flex-1 bg-rain-mod" />
              <span className="flex-1 bg-rain-heavy" />
              <span className="flex-1 bg-rain-extreme" />
            </div>
            <div className="mt-1 grid w-36 grid-cols-4 font-mono text-[9px] uppercase tracking-[0.02em] text-mute">
              <span>Light</span>
              <span>Mod</span>
              <span>Heavy</span>
              <span>Extr</span>
            </div>
          </Legend>
        )}
        {layers.snow && (
          <Legend key="snow" title="Snowfall · cover" source={sources.snow}>
            <div className="h-1.5 w-32" style={{ background: "linear-gradient(90deg,#8cc2ff,#f5f9ff 45%,#ccb3ff)" }} />
            <div className="mt-1 flex w-32 justify-between font-mono text-[9px] uppercase text-mute">
              <span>Light</span>
              <span>Heavy</span>
            </div>
          </Legend>
        )}
        {layers.temperature && (
          <Legend key="temp" title="Temperature" source={sources.temperature}>
            <div
              className="h-1.5 w-32"
              style={{
                background:
                  "linear-gradient(90deg,#6b33bf,#3359f2 20%,#4dccf2 38%,#4dd973 52%,#ffd940 68%,#ff7326 82%,#d91426)",
              }}
            />
            <div className="mt-1 flex w-32 justify-between font-mono text-[9px] text-mute">
              <span>−40°</span>
              <span>0°</span>
              <span>+20°</span>
              <span>+40°</span>
            </div>
          </Legend>
        )}
        {layers.lightning && (
          <Legend key="ltg" title="Lightning age" source={sources.lightning}>
            <div className="h-1.5 w-32" style={{ background: "linear-gradient(90deg,#fff7cc,#ffc733 12%,#ff730f 40%,#bf140f)" }} />
            <div className="mt-1 flex w-32 justify-between font-mono text-[9px] uppercase text-mute">
              <span>Now</span>
              <span>Old</span>
            </div>
          </Legend>
        )}
        {layers.wind && (
          <Legend key="wind" title="Wind flow" source={sources.wind}>
            <div className="h-1.5 w-32" style={{ background: "linear-gradient(90deg,#5a8ce6,#a6f0ff 45%,#ffd27a 80%,#ff9a3d)" }} />
            <div className="mt-1 flex w-32 justify-between font-mono text-[9px] text-mute">
              <span>0</span>
              <span>40</span>
              <span>80 km/h</span>
            </div>
          </Legend>
        )}
      </AnimatePresence>
      </div>

      <div className="flex items-center gap-5 font-mono text-[10px] tracking-[0.12em] text-mute">
        <span className="tabular-nums">
          <span className="text-faint">CURSOR </span>
          <span className="text-ink/80">{hover ? `${formatLat(hover.lat, 3)}  ${formatLon(hover.lon, 3)}` : "—"}</span>
        </span>
        <span className="tabular-nums">
          <span className="text-faint">ALT </span>
          <span className="text-ink/80">{alt ? `${fmtInt(alt)} km` : "—"}</span>
        </span>
      </div>
    </div>
  );
}

function Legend({ title, source, children }: { title: string; source: Parameters<typeof SourceBadge>[0]["source"]; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mb-1.5 flex items-center gap-3">
        <span className="label !text-[9px] !text-ink/70">{title}</span>
        <SourceBadge source={source} />
      </div>
      {children}
    </motion.div>
  );
}
