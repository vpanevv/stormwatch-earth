"use client";

import { create } from "zustand";
import type { AppConfig, LatLon, Place, RadarIndex, StormCell, WeatherBundle } from "@/types/weather";

export type LayerId = "clouds" | "rain" | "snow" | "lightning" | "storms" | "temperature" | "wind";
export type LightningWindow = "15m" | "1h" | "24h";
export type Speed = 1 | 5 | 10;

export const LIGHTNING_WINDOW_MS: Record<LightningWindow, number> = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "24h": 24 * 3_600_000,
};

export const TIMELINE_SPAN_MS = 24 * 3_600_000;
/** Timeline minutes per real second at x1. 24 h plays in 96 s at x1, ~10 s at x10. */
export const BASE_RATE = 15 * 60_000;

type Async<T> = { status: "idle" | "loading" | "ready" | "error"; data: T | null; error?: string };

export type FlyRequest = LatLon & { distance?: number; nonce: number };

export type LightningStats = {
  total: number;
  nearestKm: number | null;
  nearestBearing: number | null;
  within100km: number;
  ratePerMin: number;
};

type State = {
  config: AppConfig;
  selection: Place | null;
  fly: FlyRequest | null;
  hover: LatLon | null;
  cameraAltitudeKm: number;

  layers: Record<LayerId, boolean>;
  lightningWindow: LightningWindow;

  /** Timeline: `live` follows wall-clock. Otherwise `time` is the playback head. */
  live: boolean;
  playing: boolean;
  speed: Speed;
  /** Coarse mirror of the clock for React (≈15 Hz). Render loops read `clock.time` instead. */
  time: number;

  weather: Async<WeatherBundle>;
  radar: Async<RadarIndex>;
  /** Bumped whenever a decoded radar frame becomes available. */
  radarVersion: number;
  radarFrameTime: number | null;

  storms: StormCell[];
  lightning: LightningStats;
  geolocating: boolean;
  sheetOpen: boolean;
  /** True once the Earth textures are on the GPU and the first frame rendered. */
  globeReady: boolean;
  /** The visitor has passed the intro screen. */
  entered: boolean;
  configReady: boolean;
  shareOpen: boolean;
  aboutOpen: boolean;
};

type Actions = {
  setConfig: (c: AppConfig) => void;
  select: (p: Place | null, opts?: { fly?: boolean; distance?: number }) => void;
  flyTo: (p: LatLon, distance?: number) => void;
  setHover: (p: LatLon | null) => void;
  setAltitude: (km: number) => void;
  toggleLayer: (id: LayerId) => void;
  setLightningWindow: (w: LightningWindow) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (s: Speed) => void;
  seek: (t: number) => void;
  rewind: () => void;
  goLive: () => void;
  setTime: (t: number) => void;
  setWeather: (w: Async<WeatherBundle>) => void;
  setRadar: (r: Async<RadarIndex>) => void;
  bumpRadar: (frameTime: number | null) => void;
  setStorms: (s: StormCell[]) => void;
  setLightning: (s: LightningStats) => void;
  setGeolocating: (b: boolean) => void;
  setSheetOpen: (b: boolean) => void;
  setGlobeReady: () => void;
  enter: () => void;
  setShareOpen: (b: boolean) => void;
  setAboutOpen: (b: boolean) => void;
};

export const useAppStore = create<State & Actions>()((set, get) => ({
  config: { openweather: false, lightningSource: "mock" },
  selection: null,
  fly: null,
  hover: null,
  cameraAltitudeKm: 0,
  layers: { clouds: true, rain: true, snow: true, lightning: true, storms: false, temperature: false, wind: false },
  lightningWindow: "1h",
  live: true,
  playing: false,
  speed: 1,
  time: Date.now(),
  weather: { status: "idle", data: null },
  radar: { status: "idle", data: null },
  radarVersion: 0,
  radarFrameTime: null,
  storms: [],
  lightning: { total: 0, nearestKm: null, nearestBearing: null, within100km: 0, ratePerMin: 0 },
  geolocating: false,
  sheetOpen: false,
  globeReady: false,
  entered: false,
  configReady: false,
  shareOpen: false,
  aboutOpen: false,

  setConfig: (config) => set({ config, configReady: true }),
  select: (selection, opts) => {
    set({ selection });
    if (selection && opts?.fly !== false) get().flyTo(selection, opts?.distance);
  },
  flyTo: (p, distance) => set({ fly: { lat: p.lat, lon: p.lon, distance, nonce: Date.now() } }),
  setHover: (hover) => set({ hover }),
  setAltitude: (cameraAltitudeKm) => set({ cameraAltitudeKm }),
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setLightningWindow: (lightningWindow) => set({ lightningWindow }),

  play: () => {
    const s = get();
    // Pressing play while live restarts playback from the beginning of the window.
    if (s.live) {
      clock.time = Date.now() - TIMELINE_SPAN_MS;
      set({ live: false, time: clock.time, playing: true });
    } else {
      clock.time = s.time;
      set({ playing: true });
    }
  },
  pause: () => set({ playing: false }),
  togglePlay: () => (get().playing ? get().pause() : get().play()),
  setSpeed: (speed) => set({ speed }),
  seek: (t) => {
    const now = Date.now();
    const clamped = Math.min(now, Math.max(now - TIMELINE_SPAN_MS, t));
    if (now - clamped < 30_000) {
      clock.time = now;
      set({ live: true, playing: false, time: now });
    } else {
      clock.time = clamped;
      set({ live: false, time: clamped });
    }
  },
  rewind: () => {
    clock.time = Date.now() - TIMELINE_SPAN_MS;
    set({ live: false, playing: false, time: clock.time });
  },
  goLive: () => {
    clock.time = Date.now();
    set({ live: true, playing: false, time: clock.time });
  },
  setTime: (time) => set({ time }),

  setWeather: (weather) => set({ weather }),
  setRadar: (radar) => set({ radar }),
  bumpRadar: (radarFrameTime) => set((s) => ({ radarVersion: s.radarVersion + 1, radarFrameTime })),
  setStorms: (storms) => set({ storms }),
  setLightning: (lightning) => set({ lightning }),
  setGeolocating: (geolocating) => set({ geolocating }),
  setSheetOpen: (sheetOpen) => set({ sheetOpen }),
  setGlobeReady: () => set({ globeReady: true }),
  enter: () => set({ entered: true }),
  setShareOpen: (shareOpen) => set({ shareOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
}));

/**
 * The simulation clock. Mutated every frame by <TimeDriver/>; shaders and
 * particle systems read it directly so React never re-renders at 60 Hz.
 */
export const clock = {
  time: Date.now(),
  /** Timeline milliseconds that pass per real millisecond (1 when live). */
  rate: 1,
};

// Dev-only handle for debugging from the console.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __stormwatch: typeof useAppStore }).__stormwatch = useAppStore;
}
