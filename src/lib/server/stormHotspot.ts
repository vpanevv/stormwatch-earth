import "server-only";
import type { Place } from "@/types/weather";
import { PLACE_TILES } from "@/lib/places/tiles.gen";
import { fetchJson } from "./http";
import { reverseGeocode } from "./geocoding";
import { LIGHTNING_REFRESH_S, strikeSummary, type StrikeSummary } from "./xweather";
import { cachedGlm } from "./glm";
import { readShared, writeShared, withTimeout } from "./sharedStore";

/**
 * Where on Earth is lightning striking hardest right now? Xweather's free plan only counts strikes around a point,
 * so we first find the storm:
 *
 *   1. NOAA's GOES lightning cameras (lib/server/glm.ts): the busiest 100 km circles of the last 5 minutes over the
 *      Americas and nearby oceans — real flashes, so these are asked first;
 *   2. for the rest of the world, Open-Meteo's current conditions: a 10° grid over land (≈ 200 points, refreshed every
 *      2 hours), thunderstorm codes (95–99) and convective energy where it rains, refined on a 1.5° grid, and the
 *      known lightning hotspots, ranked by local afternoon;
 *   3. Xweather's strike count within 100 km of each (MAX_XWEATHER_TRIES in all); the most strikes wins.
 *
 * The answer is kept for HOTSPOT_REFRESH_S in a store every server instance shares (Netlify Blobs), so every visitor
 * sees the same storm and it costs Xweather a few requests per refresh, not per visit or per cold instance.
 */
/** One summary call costs Xweather 1 access (measured): 4 tries every 20 min is ≤ ~8,600 a month, worst case. */
export const HOTSPOT_REFRESH_S = Math.max(LIGHTNING_REFRESH_S, Number(process.env.LIGHTNING_HOTSPOT_REFRESH_SECONDS) || 1200);
/** Open-Meteo counts each location as a call (10,000 a day free): ~250 points every 2 h stays far inside it. */
const GRID_REFRESH_S = 7200;
/** Xweather requests per refresh at most (the first storm with strikes ends the search). */
const MAX_XWEATHER_TRIES = 4;

type OMCurrent = { latitude: number; longitude: number; current?: { weather_code?: number; precipitation?: number; cape?: number } };
type Candidate = { lat: number; lon: number; code: number; cape: number; precip: number; score: number };
type From = "satellite" | "thunderstorm" | "hotspot";
/** GOES storms asked per round at most; the other tries go to the rest of the world. */
const MAX_SATELLITE_TRIES = 2;

export type Hotspot = {
  place: Place;
  strikes: StrikeSummary;
  /** Grid points where Open-Meteo reports a thunderstorm right now, out of `sampled`. */
  thunderstormPoints: number;
  sampled: number;
  /** When these strikes were counted. */
  fetchedAt: number;
  /** When the last round ran: later than fetchedAt when a quiet round fell back to the last busy storm. */
  checkedAt: number;
  /** Every place asked this round and what came back: makes an empty answer explainable. */
  tried: { lat: number; lon: number; from: From; code?: number; glmFlashes?: number; strikes?: number; error?: string }[];
  /** Milliseconds each step of the round took (satellite, grid, hotspots, xweather, name). */
  timings?: Record<string, number>;
  /** Which storm-finding sources worked this round (NOAA GOES, Open-Meteo). */
  conditions: { satellite: boolean; grid: boolean; hotspots: boolean; refine: boolean };
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

async function current(points: { lat: number; lon: number }[], timeoutMs = 6000): Promise<Candidate[]> {
  const q = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(2)).join(","),
    longitude: points.map((p) => p.lon.toFixed(2)).join(","),
    current: "weather_code,precipitation,cape",
    timezone: "GMT",
  });
  const d = await fetchJson<OMCurrent | OMCurrent[]>(`https://api.open-meteo.com/v1/forecast?${q}`, { revalidate: GRID_REFRESH_S, timeoutMs });
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
/** A quiet round shows the last busy storm (with the time it was counted) for this long. */
const LIVELY_MAX_AGE_MS = 60 * 60_000;
const LATEST_KEY = "hotspot/latest";
/** One round's time budget; the platform's limit is ~26 s. */
const ROUND_BUDGET_MS = 18_000;
const LIVELY_KEY = "hotspot/lively";

/**
 * The hotspot every visitor sees. Shared by all server instances: the latest round is reused while younger than
 * HOTSPOT_REFRESH_S (one instance's round serves them all, keeping Xweather's count predictable), and a quiet round
 * (every storm asked at zero) shows the last busy storm of the past hour instead, still labelled with the time it
 * was counted, so the landing has a real number to show.
 */
async function sharedHotspot(): Promise<Hotspot> {
  const latest = await readShared<Hotspot>(LATEST_KEY);
  if (latest?.checkedAt && Date.now() - latest.checkedAt < HOTSPOT_REFRESH_S * 1000) return latest;
  let h: Hotspot;
  try {
    // Netlify ends a function after ~26 s: a round that runs long gives way to the last answer we have.
    h = await withTimeout(findHotspot(), ROUND_BUDGET_MS);
  } catch (e) {
    if (latest) {
      console.warn("[lightning/hotspot] round failed, keeping the last answer:", safeMessage(e));
      return latest;
    }
    throw e;
  }
  if (h.strikes.count > 0) await writeShared(LIVELY_KEY, h);
  else {
    const lively = await readShared<Hotspot>(LIVELY_KEY);
    if (lively && Date.now() - lively.fetchedAt < LIVELY_MAX_AGE_MS) h = { ...lively, checkedAt: h.checkedAt, tried: h.tried, conditions: h.conditions };
  }
  await writeShared(LATEST_KEY, h);
  return h;
}

/** sharedHotspot, also shared by concurrent and repeated calls within one server instance. */
export function cachedHotspot(): Promise<Hotspot> {
  if (memo && Date.now() - memo.at < 60_000) return memo.value;
  const value = sharedHotspot();
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
  // Everything that can run at once does: a serverless function has ~25 s, and each source can be slow on a cold
  // start (empty fetch cache). `timings` says where a round spent its time.
  const timings: Record<string, number> = {};
  const timed = async <T>(name: string, p: Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      return await p;
    } finally {
      timings[name] = Date.now() - t0;
    }
  };
  const conditions = { satellite: false, grid: false, hotspots: false, refine: true };

  // 1. Where is it storming? NOAA's lightning satellites, Open-Meteo's land grid and the known hotspots, together.
  const [glmR, gridR, knownR] = await Promise.allSettled([
    timed("satellite", withTimeout(cachedGlm(), 9000)),
    timed("grid", current(LAND_GRID, 8000)),
    timed("hotspots", current(HOTSPOTS, 8000)),
  ]);
  let grid: Candidate[] = [];
  let sampled = 0;
  let thunderstormPoints = 0;
  if (gridR.status === "fulfilled") {
    grid = gridR.value.sort((a, b) => b.score - a.score);
    sampled = grid.length;
    thunderstormPoints = grid.filter((c) => c.code >= 95).length;
    conditions.grid = true;
  } else console.warn("[lightning/hotspot] grid unavailable:", safeMessage(gridR.reason));
  let known: Candidate[];
  if (knownR.status === "fulfilled") {
    known = knownR.value.sort((a, b) => b.score - a.score || fromAfternoon(a.lon) - fromAfternoon(b.lon));
    conditions.hotspots = true;
  } else {
    console.warn("[lightning/hotspot] hotspot conditions unavailable, ranking by local time:", safeMessage(knownR.reason));
    known = HOTSPOTS.map((h) => ({ ...h, code: 0, cape: 0, precip: 0, score: 0 })).sort((a, b) => fromAfternoon(a.lon) - fromAfternoon(b.lon));
  }
  // Real storms first: the busiest GOES lightning circles (over land when one is nearly as busy as the sea's best).
  let satellite: { cell: Candidate; refine: boolean; from: From; glmFlashes?: number }[] = [];
  if (glmR.status === "fulfilled") {
    satellite = glmR.value.clusters
      .filter((c) => c.flashes >= 5)
      .sort((a, b) => b.flashes * (hasTowns(b.lat, b.lon) ? 1 : 0.6) - a.flashes * (hasTowns(a.lat, a.lon) ? 1 : 0.6))
      .slice(0, MAX_SATELLITE_TRIES)
      .map((c) => ({ cell: { lat: c.lat, lon: c.lon, code: -1, cape: 0, precip: 0, score: 0 }, refine: false, from: "satellite" as const, glmFlashes: c.flashes }));
    conditions.satellite = true;
  } else console.warn("[lightning/hotspot] GOES lightning unavailable:", safeMessage(glmR.reason));

  // Real lightning follows the sun: storms peak in the late afternoon, so local time counts most, and the model's
  // thunderstorm code, convective energy and rain add to it. (Ranking by the code alone picked night-time places.)
  const rank = (c: Candidate) => {
    const sun = Math.max(0, 1 - fromAfternoon(c.lon) / 6); // 1 at 16:00 local, 0 beyond ±6 h
    const model = (c.code >= 95 ? 0.6 : c.code >= 80 ? 0.25 : 0) + (Math.min(c.cape, 3000) / 3000) * (c.precip > 0 ? 0.4 : 0.1);
    return sun * 1.2 + model;
  };
  // Where the GOES cameras look (well inside their view), they already found the busiest storms: the remaining
  // tries go to the rest of the world.
  const seenFromGoes = (c: Candidate) => conditions.satellite && c.lon > -150 && c.lon < -20 && Math.abs(c.lat) < 50;
  const pool: { cell: Candidate; refine: boolean; from: From; glmFlashes?: number }[] = [
    ...satellite,
    ...[
      ...grid.filter((c) => c.code >= 95).map((cell) => ({ cell, refine: true, from: "thunderstorm" as const })),
      ...known.map((cell) => ({ cell, refine: false, from: "hotspot" as const })),
    ]
      .filter((q) => !seenFromGoes(q.cell))
      .sort((x, y) => rank(y.cell) - rank(x.cell)),
  ];
  // Never ask twice about the same storm (Xweather counts within 100 km).
  const queue: typeof pool = [];
  for (const q of pool) {
    if (queue.some((o) => Math.abs(o.cell.lat - q.cell.lat) < 3 && Math.abs(o.cell.lon - q.cell.lon) < 3)) continue;
    queue.push(q);
    if (queue.length >= MAX_XWEATHER_TRIES) break;
  }

  // 2. Strikes around each, all at once; a failing candidate never sinks the rest.
  const results = await timed(
    "xweather",
    Promise.all(
      queue.map(async ({ cell, refine: wantRefine, from, glmFlashes }) => {
        let point = cell;
        if (wantRefine) {
          try {
            point = await refine(cell);
          } catch (e) {
            conditions.refine = false;
            console.warn("[lightning/hotspot] refine unavailable:", safeMessage(e));
          }
        }
        const entry: Hotspot["tried"][number] = { lat: +point.lat.toFixed(2), lon: +point.lon.toFixed(2), from, ...(from === "satellite" ? { glmFlashes } : { code: point.code }) };
        try {
          const strikes = await strikeSummary(point.lat, point.lon);
          entry.strikes = strikes.count;
          return { entry, point, strikes, from };
        } catch (e) {
          entry.error = safeMessage(e);
          return { entry, point, strikes: null, from };
        }
      }),
    ),
  );
  const tried = results.map((r) => r.entry);
  // The storm with the most strikes wins; among quiet answers, a named hotspot over a grid cell at sea.
  let best: { point: Candidate; strikes: StrikeSummary; from: From } | null = null;
  for (const r of results) {
    if (!r.strikes) continue;
    if (!best || r.strikes.count > best.strikes.count || (r.strikes.count === 0 && best.strikes.count === 0 && r.from === "hotspot" && best.from !== "hotspot"))
      best = { point: r.point, strikes: r.strikes, from: r.from };
  }
  if (!best) throw new Error(`no lightning answer: ${tried.map((t) => t.error).filter(Boolean).join("; ") || "no candidates"}`);

  const { point, strikes } = best;
  const named = await timed("name", withTimeout(reverseGeocode(point.lat, point.lon), 4000).catch(() => ({ place: null })));
  const place: Place = named.place
    ? { ...named.place, id: `storm-${point.lat.toFixed(2)},${point.lon.toFixed(2)}`, lat: point.lat, lon: point.lon }
    : { id: `storm-${point.lat.toFixed(2)},${point.lon.toFixed(2)}`, name: coordName(point.lat, point.lon), context: "Open sea", kind: "coords", lat: point.lat, lon: point.lon };
  const now = Date.now();
  return { place, strikes, thunderstormPoints, sampled, fetchedAt: now, checkedAt: now, tried, conditions, timings };
}

export { safeMessage };
