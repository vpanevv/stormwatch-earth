import "server-only";
import type { Place } from "@/types/weather";
import { PLACE_TILES } from "@/lib/places/tiles.gen";
import { fetchJson } from "./http";
import { reverseGeocode } from "./geocoding";
import { LIGHTNING_REFRESH_S, strikeSummary, type StrikeSummary } from "./xweather";

/**
 * Where on Earth is lightning striking hardest right now? Xweather's free plan only counts strikes around a point,
 * so we first find the storm, using Open-Meteo's current conditions:
 *
 *   1. a 10° grid over land (≈ 200 points, one multi-location request, refreshed every 2 hours): thunderstorm weather
 *      codes (95–99) first, then convective energy (CAPE) where it is raining;
 *   2. a 1.5° grid inside the stormiest cell, to put the point on the storm itself;
 *   3. Xweather's strike count within 100 km of that point; if a storm turns out quiet, the next one is asked.
 *
 * The answer is cached for HOTSPOT_REFRESH_S, so every visitor sees the same storm and it costs Xweather a request or
 * two per refresh, not per visit.
 */
export const HOTSPOT_REFRESH_S = Math.max(LIGHTNING_REFRESH_S, Number(process.env.LIGHTNING_HOTSPOT_REFRESH_SECONDS) || 900);
/** Open-Meteo counts each location as a call (10,000 a day free): ~250 points every 2 h stays far inside it. */
const GRID_REFRESH_S = 7200;
const MAX_XWEATHER_TRIES = 2;

type OMCurrent = { latitude: number; longitude: number; current?: { weather_code?: number; precipitation?: number; cape?: number } };
type Candidate = { lat: number; lon: number; code: number; cape: number; precip: number; score: number };

export type Hotspot = {
  place: Place;
  strikes: StrikeSummary;
  /** Grid points where Open-Meteo reports a thunderstorm right now, out of `sampled`. */
  thunderstormPoints: number;
  sampled: number;
  fetchedAt: number;
};

let tileBits: Uint8Array | undefined;
const hasTowns = (lat: number, lon: number) => {
  tileBits ??= Uint8Array.from(Buffer.from(PLACE_TILES, "base64"));
  const row = Math.floor((lat + 90) / 5), col = Math.floor((lon + 180) / 5);
  const i = row * 72 + col;
  return ((tileBits[i >> 3] >> (i & 7)) & 1) === 1;
};

/** Land points of a 10° grid (towns in the 5° tile under the point): where lightning networks see most. */
const LAND_GRID: { lat: number; lon: number }[] = (() => {
  const out: { lat: number; lon: number }[] = [];
  for (let lat = -40; lat <= 60; lat += 10) for (let lon = -175; lon <= 175; lon += 10) if (hasTowns(lat, lon)) out.push({ lat, lon });
  return out;
})();

/** Thunderstorm codes first; then CAPE where it rains (dry CAPE is potential, not a storm). */
const score = (code: number, cape: number, precip: number) =>
  (code >= 95 ? 1e6 : 0) + (precip > 0 ? cape * (0.5 + Math.min(precip, 20)) : cape * 0.02);

async function current(points: { lat: number; lon: number }[]): Promise<Candidate[]> {
  const q = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(2)).join(","),
    longitude: points.map((p) => p.lon.toFixed(2)).join(","),
    current: "weather_code,precipitation,cape",
    timezone: "GMT",
  });
  const d = await fetchJson<OMCurrent | OMCurrent[]>(`https://api.open-meteo.com/v1/forecast?${q}`, { revalidate: GRID_REFRESH_S, timeoutMs: 12_000 });
  const list = Array.isArray(d) ? d : [d];
  return list.map((r, i) => {
    const code = r.current?.weather_code ?? 0, cape = r.current?.cape ?? 0, precip = r.current?.precipitation ?? 0;
    return { lat: points[i].lat, lon: points[i].lon, code, cape, precip, score: score(code, cape, precip) };
  });
}

/** The stormiest point of a 1.5° grid inside a 10° cell. */
async function refine(c: Candidate): Promise<Candidate> {
  const pts: { lat: number; lon: number }[] = [];
  for (let dy = -4.5; dy <= 4.5; dy += 1.5) for (let dx = -4.5; dx <= 4.5; dx += 1.5) pts.push({ lat: c.lat + dy, lon: ((c.lon + dx + 540) % 360) - 180 });
  const fine = await current(pts);
  return fine.sort((a, b) => b.score - a.score)[0] ?? c;
}

let memo: { at: number; value: Promise<Hotspot> } | null = null;

/** findHotspot, shared by concurrent and repeated calls within one server instance for HOTSPOT_REFRESH_S. */
export function cachedHotspot(): Promise<Hotspot> {
  if (memo && Date.now() - memo.at < HOTSPOT_REFRESH_S * 1000) return memo.value;
  const value = findHotspot();
  memo = { at: Date.now(), value };
  value.catch(() => {
    if (memo?.value === value) memo = null;
  });
  return value;
}

export async function findHotspot(): Promise<Hotspot> {
  const coarse = (await current(LAND_GRID)).sort((a, b) => b.score - a.score);
  const thunderstormPoints = coarse.filter((c) => c.code >= 95).length;
  let best: { point: Candidate; strikes: StrikeSummary } | null = null;
  for (const cell of coarse.slice(0, MAX_XWEATHER_TRIES)) {
    const point = await refine(cell).catch(() => cell);
    console.info(`[lightning/hotspot] storm candidate ${point.lat.toFixed(2)},${point.lon.toFixed(2)} code ${point.code} cape ${Math.round(point.cape)} rain ${point.precip}`);
    const strikes = await strikeSummary(point.lat, point.lon);
    if (!best || strikes.count > best.strikes.count) best = { point, strikes };
    if (strikes.count > 0) break;
  }
  if (!best) throw new Error("no storm candidates");
  const { point, strikes } = best;
  const named = await reverseGeocode(point.lat, point.lon).catch(() => ({ place: null }));
  const place: Place = named.place
    ? { ...named.place, id: `storm-${point.lat.toFixed(2)},${point.lon.toFixed(2)}`, lat: point.lat, lon: point.lon }
    : { id: `storm-${point.lat.toFixed(2)},${point.lon.toFixed(2)}`, name: "Open water", context: "Active storm", kind: "coords", lat: point.lat, lon: point.lon };
  return { place, strikes, thunderstormPoints, sampled: coarse.length, fetchedAt: Date.now() };
}
