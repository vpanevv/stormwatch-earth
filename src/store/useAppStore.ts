"use client";

import { create } from "zustand";
import type { AppConfig, LatLon, LiveLightning, Place, RadarIndex, StormCell, WeatherBundle } from "@/types/weather";

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
  /** Live strikes around the selected place (Xweather); null until the first answer. */
  liveLightning: LiveLightning | null;
  /** A pin dropped by clicking the globe (Watched-style): its card names the nearest town and offers its weather. */
  pin: DroppedPin | null;
  /** Screen space the UI panels cover (CSS px), so overlays on the globe stay clear of them. */
  uiInsets: { top: number; right: number; bottom: number; left: number };
  /** On a phone's landing, the clear band (px from the top) between the header and the hero copy, where the planet sits. */
  landingBand: { top: number; bottom: number } | null;
};

export type DroppedPin = { id: number; lat: number; lon: number };

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
  /** Back to the intro screen (the wordmark link); the place is kept for "↺ last place". */
  leave: () => void;
  setShareOpen: (b: boolean) => void;
  setAboutOpen: (b: boolean) => void;
  setLiveLightning: (l: LiveLightning | null) => void;
  dropPin: (p: LatLon) => void;
  clearPin: () => void;
  setUiInsets: (i: State["uiInsets"]) => void;
  setLandingBand: (b: State["landingBand"]) => void;
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
  liveLightning: null,
  pin: null,
  uiInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  landingBand: null,

  setConfig: (config) => set({ config, configReady: true }),
  select: (selection, opts) => {
    // Choosing a place (search, quick pick, a pin's arrow) ends any dropped pin.
    set({ selection, pin: null });
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
  leave: () => set({ entered: false, pin: null, shareOpen: false, aboutOpen: false, sheetOpen: false }),
  setShareOpen: (shareOpen) => set({ shareOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setLiveLightning: (liveLightning) => set({ liveLightning }),
  dropPin: (p) => set({ pin: { id: Date.now(), lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5 } }),
  clearPin: () => set({ pin: null }),
  setLandingBand: (b) => {
    const c = get().landingBand;
    if (b?.top !== c?.top || b?.bottom !== c?.bottom) set({ landingBand: b });
  },
  setUiInsets: (uiInsets) => {
    const c = get().uiInsets;
    if (c.top !== uiInsets.top || c.right !== uiInsets.right || c.bottom !== uiInsets.bottom || c.left !== uiInsets.left) set({ uiInsets });
  },
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
