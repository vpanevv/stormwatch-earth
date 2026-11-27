"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { DataSource } from "@/types/weather";
import { type LayerId, type LightningWindow, useAppStore } from "@/store/useAppStore";
import { IconBolt, IconCloud, IconRain, IconSnow, IconStorm, IconThermo, IconWind } from "./icons";
import { Segmented } from "./primitives";

type Def = { id: LayerId; label: string; Icon: typeof IconCloud };

const LAYERS: Def[] = [
  { id: "clouds", label: "Clouds", Icon: IconCloud },
  { id: "rain", label: "Rain", Icon: IconRain },
  { id: "snow", label: "Snow", Icon: IconSnow },
  { id: "lightning", label: "Lightning", Icon: IconBolt },
  { id: "storms", label: "Storms", Icon: IconStorm },
  { id: "temperature", label: "Temp", Icon: IconThermo },
  { id: "wind", label: "Wind", Icon: IconWind },
];

export function useLayerSources(): Record<LayerId, DataSource> {
  const owm = useAppStore((s) => s.config.openweather);
  const radarLive = useAppStore((s) => s.radar.status === "ready");
  return {
    clouds: owm ? "openweather" : "model",
    rain: radarLive ? "rainviewer" : "mock",
    snow: "model",
    lightning: "mock",
    storms: "mock",
    temperature: owm ? "openweather" : "model",
    wind: "model",
  };
}

/** Horizontal layer toolbar (Windy-style chips). Lightning exposes its time window inline. */
export function LayerRail({ scroll = false }: { scroll?: boolean }) {
  const layers = useAppStore((s) => s.layers);
  const toggle = useAppStore((s) => s.toggleLayer);
  const win = useAppStore((s) => s.lightningWindow);
  const setWin = useAppStore((s) => s.setLightningWindow);
  const sources = useLayerSources();

  return (
    <nav aria-label="Weather layers" className={`flex items-center gap-1.5 ${scroll ? "scroll-thin overflow-x-auto pb-1" : "flex-wrap"}`}>
      {LAYERS.map(({ id, label, Icon }) => {
        const on = layers[id];
        const live = !["mock", "model"].includes(sources[id]);
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            aria-pressed={on}
            title={`${label} · ${live ? "live" : sources[id] === "model" ? "modelled" : "simulated"}`}
            className={`panel relative flex shrink-0 items-center gap-2 py-1.5 pl-2.5 pr-3 transition-colors ${
              on ? "!border-accent/50 text-ink" : "text-mute hover:text-ink"
            }`}
          >
            <Icon width={16} height={16} className={on ? "text-accent" : ""} />
            <span className="text-[12px] font-light tracking-wide">{label}</span>
            <span
              className={`absolute right-1 top-1 h-1 w-1 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"} ${
                on ? "opacity-90" : "opacity-25"
              }`}
            />
          </button>
        );
      })}
      <AnimatePresence initial={false}>
        {layers.lightning && (
          <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} className="panel shrink-0">
            <Segmented<LightningWindow>
              label="Lightning window"
              value={win}
              onChange={setWin}
              options={[
                { value: "15m", label: "15M" },
                { value: "1h", label: "1H" },
                { value: "24h", label: "24H" },
              ]}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
