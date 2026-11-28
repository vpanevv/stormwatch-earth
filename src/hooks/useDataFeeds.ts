"use client";

import { useEffect, useRef, useState } from "react";
import type { AppConfig, LightningHotspot, LiveLightning, RadarIndex, WeatherBundle } from "@/types/weather";
import { clock, LIGHTNING_WINDOW_MS, useAppStore } from "@/store/useAppStore";
import { radar } from "@/lib/radar/manager";
import { MockLightningSource, type LightningSource } from "@/lib/lightning/source";
import { STRIKE_CAPACITY, STRIKE_EPOCH, strikes } from "@/lib/lightning/buffer";
import { bearingDeg, haversineKm } from "@/lib/geo";
import { mockWeather } from "@/lib/mock/weather";

/** Provider config + RainViewer frame index (refreshed every 5 min). */
export function useBootstrap() {
  const setConfig = useAppStore((s) => s.setConfig);
  const setRadar = useAppStore((s) => s.setRadar);
  const bumpRadar = useAppStore((s) => s.bumpRadar);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json() as Promise<AppConfig>)
      .then(setConfig)
      .catch(() => setConfig({ openweather: false, lightningSource: "mock" }));
  }, [setConfig]);

  useEffect(() => {
    const off = radar.onFrame((t) => bumpRadar(t));
    const load = async () => {
      setRadar({ status: "loading", data: useAppStore.getState().radar.data });
      try {
        const idx = (await (await fetch("/api/radar")).json()) as RadarIndex;
        radar.setIndex(idx);
        setRadar({ status: idx.frames.length ? "ready" : "error", data: idx });
      } catch (e) {
        setRadar({ status: "error", data: null, error: String(e) });
      }
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      clearInterval(id);
      off();
    };
  }, [setRadar, bumpRadar]);
}

/** Weather for the selected place, with client-side mock fallback if the API route itself is unreachable. */
export function useWeatherSync() {
  const selection = useAppStore((s) => s.selection);
  const setWeather = useAppStore((s) => s.setWeather);
  const lat = selection?.lat;
  const lon = selection?.lon;

  useEffect(() => {
    if (lat === undefined || lon === undefined) {
      setWeather({ status: "idle", data: null });
      return;
    }
    const ctrl = new AbortController();
    setWeather({ status: "loading", data: null });
    const load = () =>
      fetch(`/api/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<WeatherBundle>) : Promise.reject(new Error(String(r.status)))))
        .then((data) => setWeather({ status: "ready", data }))
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          setWeather({ status: "ready", data: mockWeather({ lat, lon }), error: String(e) });
        });
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, [lat, lon, setWeather]);
}

/**
 * Live strikes around the selected place (Xweather, via /api/lightning: within 100 km, the last 5 minutes).
 * Polled every minute; the server and CDN cache the answer, so polling costs Xweather nothing extra.
 */
export function useLiveLightningSync() {
  const selection = useAppStore((s) => s.selection);
  const setLive = useAppStore((s) => s.setLiveLightning);
  const lat = selection?.lat;
  const lon = selection?.lon;
  useEffect(() => {
    setLive(null);
    if (lat === undefined || lon === undefined) return;
    const ctrl = new AbortController();
    const load = () =>
      fetchLiveLightning(lat, lon, ctrl.signal)
        .then(setLive)
        .catch(() => {
          if (!ctrl.signal.aborted) setLive({ available: false, reason: "unreachable" });
        });
    load();
    const id = setInterval(load, 60_000);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, [lat, lon, setLive]);
}

/** Same rounding as the server, so nearby places share one cached answer. */
export function fetchLiveLightning(lat: number, lon: number, signal?: AbortSignal): Promise<LiveLightning> {
  return fetch(`/api/lightning?lat=${lat.toFixed(1)}&lon=${lon.toFixed(1)}`, { signal }).then((r) => r.json() as Promise<LiveLightning>);
}

/** The most active storm right now and its live strike count (the landing page), polled every minute. */
export function useLightningHotspot() {
  const [hot, setHot] = useState<LightningHotspot | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      fetch("/api/lightning/hotspot", { signal: ctrl.signal })
        .then((r) => r.json() as Promise<LightningHotspot>)
        .then(setHot)
        .catch(() => {
          if (!ctrl.signal.aborted) setHot({ available: false, reason: "unreachable" });
        });
    load();
    const id = setInterval(load, 60_000);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, []);
  return hot;
}

/** Runs the lightning source and publishes strike stats + storm cells at a low rate. */
export function useLightningFeed() {
  const sourceRef = useRef<LightningSource | null>(null);
  const weather = useAppStore((s) => s.weather.data);
  const selection = useAppStore((s) => s.selection);

  useEffect(() => {
    const src = new MockLightningSource();
    sourceRef.current = src;
    src.start();

    let lastStormT = 0;
    const tick = () => {
      const s = useAppStore.getState();
      const t = clock.time;
      const win = LIGHTNING_WINDOW_MS[s.lightningWindow];
      const now = (t - STRIKE_EPOCH) / 1000;
      const from = now - win / 1000;
      const lastMin = now - 60;
      const sel = s.selection;
      let total = 0;
      let nearest = Infinity;
      let nearestIdx = -1;
      let within = 0;
      let rate = 0;
      for (let i = 0; i < Math.min(strikes.count, STRIKE_CAPACITY); i++) {
        const st = strikes.times[i];
        if (st > now || st < from) continue;
        total++;
        if (st >= lastMin) rate++;
        if (sel && Math.abs(strikes.lats[i] - sel.lat) < 20) {
          const d = haversineKm(sel, { lat: strikes.lats[i], lon: strikes.lons[i] });
          if (d < nearest) {
            nearest = d;
            nearestIdx = i;
          }
          if (d <= 100) within++;
        }
      }
      s.setLightning({
        total,
        nearestKm: Number.isFinite(nearest) ? nearest : null,
        nearestBearing:
          nearestIdx >= 0 && sel ? bearingDeg(sel, { lat: strikes.lats[nearestIdx], lon: strikes.lons[nearestIdx] }) : null,
        within100km: within,
        ratePerMin: rate,
      });
      if (Math.abs(t - lastStormT) > 60_000 || s.playing) {
        lastStormT = t;
        s.setStorms(src.stormCells(t));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      src.stop();
    };
  }, []);

  // Feed the forecast's thunder risk back into the simulation.
  useEffect(() => {
    if (!sourceRef.current) return;
    if (!selection || !weather) return sourceRef.current.setFocus(null, 0);
    const next6 = weather.hourly.filter((h) => h.time >= Date.now() - 3_600_000 && h.time <= Date.now() + 6 * 3_600_000);
    const thunder = next6.some((h) => h.weatherCode >= 95) || weather.current.weatherCode >= 95;
    const cape = Math.max(0, ...next6.map((h) => h.cape));
    const risk = thunder ? 0.9 : Math.min(0.7, cape / 2500);
    sourceRef.current.setFocus(selection, risk);
  }, [selection, weather]);
}
