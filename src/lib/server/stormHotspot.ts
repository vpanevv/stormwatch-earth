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
/** One summary call costs Xweather 1 access (measured): 4 tries every 20 min is ≤ ~8,600 a month, worst case. */
export const HOTSPOT_REFRESH_S = Math.max(LIGHTNING_REFRESH_S, Number(process.env.LIGHTNING_HOTSPOT_REFRESH_SECONDS) || 1200);
/** Open-Meteo counts each location as a call (10,000 a day free): ~250 points every 2 h stays far inside it. */
const GRID_REFRESH_S = 7200;
/** Xweather requests per refresh at most (the first storm with strikes ends the search). */
const MAX_XWEATHER_TRIES = 4;

type OMCurrent = { latitude: number; longitude: number; current?: { weather_code?: number; precipitation?: number; cape?: number } };
type Candidate = { lat: number; lon: number; code: number; cape: number; precip: number; score: number };

export type Hotspot = {
  place: Place;
  strikes: StrikeSummary;
  /** Grid points where Open-Meteo reports a thunderstorm right now, out of `sampled`. */
  thunderstormPoints: number;
  sampled: number;
  fetchedAt: number;
  /** Every place asked this round and what came back: makes an empty answer explainable. */
  tried: { lat: number; lon: number; from: "thunderstorm" | "hotspot"; code: number; strikes?: number; error?: string }[];
  /** Which Open-Meteo requests worked this round. */
  conditions: { grid: boolean; hotspots: boolean; refine: boolean };
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
/** The last answer that had strikes: shown, with its own time, when a whole round comes back quiet. */
let lastLively: Hotspot | null = null;
const LIVELY_MAX_AGE_MS = 60 * 60_000;

/**
 * findHotspot, shared by concurrent and repeated calls within one server instance for HOTSPOT_REFRESH_S. A quiet
 * round (every storm asked at zero) falls back to the last lively one from the past hour, still labelled with the
 * time it was measured, so the landing always has a real number to show.
 */
export function cachedHotspot(): Promise<Hotspot> {
  if (memo && Date.now() - memo.at < HOTSPOT_REFRESH_S * 1000) return memo.value;
  const value = findHotspot().then((h) => {
    if (h.strikes.count > 0) lastLively = h;
    else if (lastLively && Date.now() - lastLively.fetchedAt < LIVELY_MAX_AGE_MS) return { ...lastLively, tried: h.tried, conditions: h.conditions };
    return h;
  });
  memo = { at: Date.now(), value };
  value.catch(() => {
    if (memo?.value === value) memo = null;
  });
  return value;
}

/** "Storm at 10.0°N 145.0°E": a storm over the sea, where no geocoder has a name. */
function coordName(lat: number, lon: number) {
  return `Storm at ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
}

/**
 * Places where thunderstorms are most frequent (NASA LIS/OTD lightning climatology): the fallback candidates when the
 * global grid can't be fetched, ranked by Open-Meteo's current conditions or, failing that, by local afternoon.
 */
const HOTSPOTS: { lat: number; lon: number }[] = [
  { lat: 9.6, lon: -71.6 }, // Lake Maracaibo
  { lat: -2.5, lon: 28.9 }, // Kivu, DR Congo
  { lat: -1.0, lon: 23.0 }, // Congo basin
  { lat: 0.3, lon: 32.6 }, // Lake Victoria
  { lat: 9.1, lon: 7.5 }, // central Nigeria
  { lat: -18.9, lon: 47.5 }, // Madagascar
  { lat: -26.2, lon: 28.0 }, // Highveld
  { lat: 23.8, lon: 90.4 }, // Bangladesh
  { lat: 25.6, lon: 91.9 }, // Meghalaya
  { lat: 34.0, lon: 71.5 }, // north Pakistan
  { lat: 23.1, lon: 113.3 }, // south China
  { lat: 14.6, lon: 121.0 }, // Luzon
  { lat: 0.0, lon: 109.3 }, // west Borneo
  { lat: 1.5, lon: 112.0 }, // Sarawak
  { lat: -3.0, lon: 104.7 }, // Sumatra
  { lat: 1.35, lon: 103.8 }, // Singapore strait
  { lat: -4.0, lon: 138.0 }, // New Guinea
  { lat: -12.5, lon: 130.8 }, // Top End
  { lat: 28.0, lon: -81.5 }, // Florida
  { lat: 29.8, lon: -95.4 }, // Gulf coast
  { lat: 38.5, lon: -98.0 }, // Great Plains
  { lat: 19.4, lon: -99.1 }, // central Mexico
  { lat: 8.0, lon: -77.5 }, // Darién
  { lat: 6.2, lon: -75.6 }, // Antioquia
  { lat: -3.1, lon: -60.0 }, // Amazon
  { lat: -25.3, lon: -57.6 }, // Paraguay
  { lat: -27.5, lon: -58.8 }, // Corrientes
  { lat: -23.5, lon: -46.6 }, // São Paulo
  { lat: 45.4, lon: 10.9 }, // Po valley
  { lat: 9.0, lon: 38.7 }, // Ethiopian highlands
  { lat: -15.4, lon: 28.3 }, // Zambia
  { lat: -12.0, lon: 17.0 }, // Angola
  { lat: -6.8, lon: 37.0 }, // Tanzania
  { lat: 4.0, lon: 11.5 }, // Cameroon
  { lat: 7.0, lon: -1.6 }, // Ghana
  { lat: 7.0, lon: 80.7 }, // Sri Lanka
  { lat: 19.7, lon: 96.0 }, // Myanmar
  { lat: 14.0, lon: 100.5 }, // Thailand
  { lat: 22.6, lon: 88.4 }, // west Bengal
  { lat: -16.0, lon: 145.0 }, // Queensland
  { lat: -9.4, lon: 160.0 }, // Solomon Islands
  { lat: -17.8, lon: 178.0 }, // Fiji
  { lat: 14.6, lon: -90.5 }, // Guatemala
  { lat: 9.9, lon: -84.0 }, // Costa Rica
  { lat: 18.5, lon: -69.9 }, // Hispaniola
  { lat: -15.8, lon: -47.9 }, // Brazilian highlands
];

/** Storms peak in the late afternoon: hours from 16:00 local solar time, 0 (best) … 12. */
const fromAfternoon = (lon: number, now = Date.now()) => {
  const solar = ((now / 3_600_000 + lon / 15) % 24 + 24) % 24;
  return Math.min(Math.abs(solar - 16), 24 - Math.abs(solar - 16));
};

const safeMessage = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/client_(id|secret)=[^&\s]+/g, "client_$1=…").slice(0, 160);

export async function findHotspot(): Promise<Hotspot> {
  // 1. Where is it storming? Grid cells with a thunderstorm code (refined onto the storm when Open-Meteo allows),
  //    then the known hotspots, ranked by their own conditions (one small request) or by local afternoon.
  let sampled = 0;
  let thunderstormPoints = 0;
  let grid: Candidate[] = [];
  const conditions = { grid: false, hotspots: false, refine: true };
  try {
    grid = (await current(LAND_GRID)).sort((a, b) => b.score - a.score);
    sampled = grid.length;
    thunderstormPoints = grid.filter((c) => c.code >= 95).length;
    conditions.grid = true;
  } catch (e) {
    console.warn("[lightning/hotspot] grid unavailable:", safeMessage(e));
  }
  let known: Candidate[];
  try {
    known = (await current(HOTSPOTS)).sort((a, b) => b.score - a.score || fromAfternoon(a.lon) - fromAfternoon(b.lon));
    conditions.hotspots = true;
  } catch (e) {
    console.warn("[lightning/hotspot] hotspot conditions unavailable, ranking by local time:", safeMessage(e));
    known = HOTSPOTS.map((h) => ({ ...h, code: 0, cape: 0, precip: 0, score: 0 })).sort((a, b) => fromAfternoon(a.lon) - fromAfternoon(b.lon));
  }
  // Rank everything together. Real lightning follows the sun: storms peak in the late afternoon, so local time
  // counts most, and the model's thunderstorm code, convective energy and rain add to it. (Ranking by the code alone
  // picked night-time places: at 09:24 UTC it tried Maracaibo at 04:36 and the Amazon at 05:24, all quiet.)
  const rank = (c: Candidate) => {
    const sun = Math.max(0, 1 - fromAfternoon(c.lon) / 6); // 1 at 16:00 local, 0 beyond ±6 h
    const model = (c.code >= 95 ? 0.6 : c.code >= 80 ? 0.25 : 0) + (Math.min(c.cape, 3000) / 3000) * (c.precip > 0 ? 0.4 : 0.1);
    return sun * 1.2 + model;
  };
  const pool = [
    ...grid.filter((c) => c.code >= 95).map((cell) => ({ cell, refine: true, from: "thunderstorm" as const })),
    ...known.map((cell) => ({ cell, refine: false, from: "hotspot" as const })),
  ].sort((x, y) => rank(y.cell) - rank(x.cell));
  // Never ask twice about the same storm (Xweather counts within 100 km).
  const queue: typeof pool = [];
  for (const q of pool) {
    if (queue.some((o) => Math.abs(o.cell.lat - q.cell.lat) < 3 && Math.abs(o.cell.lon - q.cell.lon) < 3)) continue;
    queue.push(q);
    if (queue.length >= MAX_XWEATHER_TRIES) break;
  }
  const tried: Hotspot["tried"] = [];

  // 2. Strikes around each, in turn, until one has lightning; a failing candidate never sinks the rest.
  let best: { point: Candidate; strikes: StrikeSummary; from: "thunderstorm" | "hotspot" } | null = null;
  const errors: string[] = [];
  let refineOk = true;
  for (const { cell, refine: wantRefine, from } of queue) {
    let point = cell;
    if (wantRefine && refineOk) {
      try {
        point = await refine(cell);
      } catch (e) {
        refineOk = false; // Open-Meteo is refusing big requests: don't ask again this round
        conditions.refine = false;
        console.warn("[lightning/hotspot] refine unavailable:", safeMessage(e));
      }
    }
    console.info(`[lightning/hotspot] storm candidate ${point.lat.toFixed(2)},${point.lon.toFixed(2)} code ${point.code} cape ${Math.round(point.cape)} rain ${point.precip}`);
    const entry: Hotspot["tried"][number] = { lat: +point.lat.toFixed(2), lon: +point.lon.toFixed(2), from, code: point.code };
    tried.push(entry);
    try {
      const strikes = await strikeSummary(point.lat, point.lon);
      entry.strikes = strikes.count;
      // With every answer at zero, keep the best-ranked hotspot (a named place), not a grid cell over the sea.
      // The storm with the most strikes wins; among quiet answers, a named hotspot over a grid cell at sea.
      if (!best || strikes.count > best.strikes.count || (strikes.count === 0 && best.strikes.count === 0 && from === "hotspot" && best.from !== "hotspot"))
        best = { point, strikes, from };
    } catch (e) {
      entry.error = safeMessage(e);
      errors.push(entry.error);
    }
  }
  if (!best) throw new Error(`no lightning answer: ${errors.join("; ") || "no candidates"}`);

  const { point, strikes } = best;
  const named = await reverseGeocode(point.lat, point.lon).catch(() => ({ place: null }));
  const place: Place = named.place
    ? { ...named.place, id: `storm-${point.lat.toFixed(2)},${point.lon.toFixed(2)}`, lat: point.lat, lon: point.lon }
    : { id: `storm-${point.lat.toFixed(2)},${point.lon.toFixed(2)}`, name: coordName(point.lat, point.lon), context: "Open sea", kind: "coords", lat: point.lat, lon: point.lon };
  return { place, strikes, thunderstormPoints, sampled, fetchedAt: Date.now(), tried, conditions };
}

export { safeMessage };
