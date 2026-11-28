import "server-only";
import { File as H5File } from "jsfive";

/**
 * Real lightning from orbit: NOAA's Geostationary Lightning Mapper (GLM) on GOES-19 (GOES-East, 75.2°W) and GOES-18
 * (GOES-West, 137.2°W). Each camera records every flash it sees, day and night, over the Americas and the
 * neighbouring oceans; NOAA publishes a small netCDF file of flashes every 20 seconds, free, on AWS Open Data
 * (s3://noaa-goes19, s3://noaa-goes18, product GLM-L2-LCFA).
 *
 * Here: the last 5 minutes of files from both satellites (≈ 30 files, ≈ 6 MB), read with jsfive, give
 *   - the number of flashes over the region, and
 *   - where they are densest (the busiest 100 km circles), which is where the storm hunt asks Xweather.
 * The two views overlap; each flash is counted once, by the satellite nearer to it (split at 106.2°W).
 */

const WINDOW_MS = 5 * 60_000;
/** Files are 20 s long; a satellite whose newest file is older than this is treated as down. */
const STALE_MS = 15 * 60_000;
/** Within one server instance, a snapshot is reused this long (the API's CDN cache does the rest). */
const MEMO_MS = 4 * 60_000;
const SPLIT_LON = -106.2;
const RADIUS_KM = 100;

type Sat = { name: string; bucket: string; keeps: (lon: number) => boolean };
const SATELLITES: Sat[] = [
  { name: "GOES-19", bucket: process.env.GLM_EAST_BUCKET || "noaa-goes19", keeps: (lon) => lon >= SPLIT_LON && lon <= 0 },
  { name: "GOES-18", bucket: process.env.GLM_WEST_BUCKET || "noaa-goes18", keeps: (lon) => lon < SPLIT_LON || lon > 0 },
];

export type GlmCluster = { lat: number; lon: number; /** flashes within 100 km of the point, in the window */ flashes: number };
export type GlmSnapshot = {
  /** Flashes over the region in the window (both satellites, each flash once). */
  flashes: number;
  windowMin: number;
  /** The window actually covered, from the files' own times (ms). */
  from: number;
  to: number;
  satellites: { name: string; flashes: number; files: number; latest: number | null; error?: string }[];
  /** The busiest 100 km circles, most flashes first, at least 300 km apart. */
  clusters: GlmCluster[];
  fetchedAt: number;
};

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const dayOfYear = (d: Date) => Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
const hourPrefix = (d: Date) => `GLM-L2-LCFA/${d.getUTCFullYear()}/${pad(dayOfYear(d), 3)}/${pad(d.getUTCHours())}/`;

/** OR_GLM-L2-LCFA_G19_s20263321546000_e20263321546200_c….nc → start and end (ms). */
function fileTimes(key: string): { start: number; end: number } | null {
  const t = (s: string) =>
    Date.UTC(+s.slice(0, 4), 0, 1) + (+s.slice(4, 7) - 1) * 86_400_000 + +s.slice(7, 9) * 3_600_000 + +s.slice(9, 11) * 60_000 + +s.slice(11, 13) * 1000 + +s.slice(13, 14) * 100;
  const m = key.match(/_s(\d{14})_e(\d{14})_/);
  return m ? { start: t(m[1]), end: t(m[2]) } : null;
}

async function get(url: string, timeoutMs: number): Promise<Response> {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${r.status} ${new URL(url).host}`);
  return r;
}

async function listKeys(bucket: string, d: Date): Promise<string[]> {
  const xml = await (await get(`https://${bucket}.s3.amazonaws.com/?list-type=2&prefix=${hourPrefix(d)}`, 6000)).text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
}

/** One satellite's flashes (lat, lon pairs) in the last WINDOW_MS of its files. */
async function readSatellite(sat: Sat, now: number) {
  // The window can straddle an hour boundary: list this hour and the one before.
  const lists = await Promise.all([listKeys(sat.bucket, new Date(now - 3_600_000)), listKeys(sat.bucket, new Date(now))]);
  const files = lists
    .flat()
    .map((key) => ({ key, ...fileTimes(key) }))
    .filter((f): f is { key: string; start: number; end: number } => typeof f.start === "number");
  if (!files.length) throw new Error("no files");
  const latest = Math.max(...files.map((f) => f.start));
  if (now - latest > STALE_MS) throw new Error(`newest file is ${Math.round((now - latest) / 60_000)} min old`);
  const recent = files.filter((f) => f.start > latest - WINDOW_MS + 1000);

  const lat: number[] = [];
  const lon: number[] = [];
  let from = Infinity, to = 0, read = 0;
  await Promise.all(
    recent.map(async (f) => {
      try {
        const buf = await (await get(`https://${sat.bucket}.s3.amazonaws.com/${f.key}`, 8000)).arrayBuffer();
        const h5 = new H5File(buf, f.key);
        const la = h5.get("flash_lat")?.value, lo = h5.get("flash_lon")?.value;
        if (!la || !lo) return;
        for (let i = 0; i < la.length; i++) {
          if (!sat.keeps(lo[i])) continue;
          lat.push(la[i]);
          lon.push(lo[i]);
        }
        from = Math.min(from, f.start);
        to = Math.max(to, f.end);
        read++;
      } catch {
        /* one missing 20 s file only makes the count a little low */
      }
    }),
  );
  if (!read) throw new Error("no file could be read");
  return { lat, lon, from, to, files: read, latest };
}

/** The busiest 100 km circles: 1° cells, then the flashes within 100 km of each busy cell's centroid. */
function findClusters(lat: number[], lon: number[]): GlmCluster[] {
  const cells = new Map<string, { n: number; sLat: number; sLon: number }>();
  for (let i = 0; i < lat.length; i++) {
    const k = `${Math.floor(lat[i])},${Math.floor(lon[i])}`;
    const c = cells.get(k) ?? { n: 0, sLat: 0, sLon: 0 };
    c.n++;
    c.sLat += lat[i];
    c.sLon += lon[i];
    cells.set(k, c);
  }
  const seeds = [...cells.values()].sort((a, b) => b.n - a.n).slice(0, 40);
  const kmPerDeg = 111.2;
  const scored = seeds.map((c) => {
    const cLat = c.sLat / c.n, cLon = c.sLon / c.n;
    const cos = Math.cos((cLat * Math.PI) / 180);
    let n = 0;
    for (let i = 0; i < lat.length; i++) {
      const dy = (lat[i] - cLat) * kmPerDeg, dx = (lon[i] - cLon) * kmPerDeg * cos;
      if (dx * dx + dy * dy <= RADIUS_KM * RADIUS_KM) n++;
    }
    return { lat: +cLat.toFixed(2), lon: +cLon.toFixed(2), flashes: n };
  });
  const out: GlmCluster[] = [];
  for (const c of scored.sort((a, b) => b.flashes - a.flashes)) {
    const far = out.every((o) => {
      const dy = (o.lat - c.lat) * kmPerDeg, dx = (o.lon - c.lon) * kmPerDeg * Math.cos((c.lat * Math.PI) / 180);
      return dx * dx + dy * dy > 300 * 300;
    });
    if (far) out.push(c);
    if (out.length >= 5) break;
  }
  return out;
}

export async function glmSnapshot(now = Date.now()): Promise<GlmSnapshot> {
  const results = await Promise.allSettled(SATELLITES.map((s) => readSatellite(s, now)));
  const lat: number[] = [];
  const lon: number[] = [];
  let from = Infinity, to = 0;
  const satellites: GlmSnapshot["satellites"] = results.map((r, i) => {
    if (r.status === "rejected") return { name: SATELLITES[i].name, flashes: 0, files: 0, latest: null, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    for (let j = 0; j < r.value.lat.length; j++) {
      lat.push(r.value.lat[j]);
      lon.push(r.value.lon[j]);
    }
    from = Math.min(from, r.value.from);
    to = Math.max(to, r.value.to);
    return { name: SATELLITES[i].name, flashes: r.value.lat.length, files: r.value.files, latest: r.value.latest };
  });
  if (!satellites.some((s) => !s.error)) throw new Error(`GOES lightning unavailable: ${satellites.map((s) => `${s.name} ${s.error}`).join("; ")}`);
  return { flashes: lat.length, windowMin: Math.round((to - from) / 60_000), from, to, satellites, clusters: findClusters(lat, lon), fetchedAt: Date.now() };
}

let memo: { at: number; value: Promise<GlmSnapshot> } | null = null;
/** glmSnapshot, shared by concurrent and repeated calls in one server instance for MEMO_MS. */
export function cachedGlm(): Promise<GlmSnapshot> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  const value = glmSnapshot();
  memo = { at: Date.now(), value };
  value.catch(() => {
    if (memo?.value === value) memo = null;
  });
  return value;
}
