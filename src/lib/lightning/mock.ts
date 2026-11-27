import type { LatLon, StormCell } from "@/types/weather";
import { destination } from "@/lib/geo";
import { gaussian, hash, mulberry32 } from "@/lib/random";
import { subsolarPoint } from "@/lib/sun";

/**
 * Synthetic thunderstorm climatology. Storm systems are born in convective hot spots,
 * drift with the prevailing flow, peak in the local afternoon and decay.
 * Everything is seeded by the hour so the picture is stable across reloads.
 */

const HOUR = 3_600_000;

type Region = { name: string; lat: number; lon: number; sLat: number; sLon: number; w: number };

const REGIONS: Region[] = [
  { name: "Congo Basin", lat: -2, lon: 22, sLat: 6, sLon: 9, w: 3 },
  { name: "Amazon", lat: -6, lon: -60, sLat: 7, sLon: 10, w: 3 },
  { name: "Maritime Continent", lat: 0, lon: 112, sLat: 6, sLon: 16, w: 3 },
  { name: "Northern Australia", lat: -15, lon: 132, sLat: 5, sLon: 12, w: 1.6 },
  { name: "La Plata Basin", lat: -29, lon: -59, sLat: 5, sLon: 6, w: 2.2 },
  { name: "Southern Africa", lat: -24, lon: 28, sLat: 5, sLon: 7, w: 1.6 },
  { name: "Lake Maracaibo", lat: 9.8, lon: -71.6, sLat: 1.5, sLon: 1.5, w: 1 },
  { name: "Central America", lat: 12, lon: -86, sLat: 4, sLon: 6, w: 1.2 },
  { name: "Gulf of Mexico", lat: 26, lon: -88, sLat: 4, sLon: 8, w: 1 },
  { name: "Great Plains", lat: 35, lon: -97, sLat: 5, sLon: 7, w: 0.8 },
  { name: "Mediterranean", lat: 38, lon: 16, sLat: 4, sLon: 12, w: 1.3 },
  { name: "Balkans", lat: 42, lon: 23, sLat: 3, sLon: 5, w: 0.7 },
  { name: "Bay of Bengal", lat: 16, lon: 88, sLat: 5, sLon: 6, w: 1.2 },
  { name: "South China Sea", lat: 12, lon: 115, sLat: 5, sLon: 6, w: 1.2 },
  { name: "Sea of Japan", lat: 38, lon: 135, sLat: 3, sLon: 5, w: 0.5 },
  { name: "Madagascar", lat: -18, lon: 47, sLat: 4, sLon: 3, w: 1 },
  { name: "Gulf Stream", lat: 34, lon: -70, sLat: 4, sLon: 8, w: 0.7 },
];

export type StormSystem = {
  id: string;
  region: string;
  origin: LatLon;
  birth: number;
  life: number;
  heading: number;
  speedKmh: number;
  peakRate: number; // strikes / min at peak
  radiusKm: number;
  elongation: number; // >1 = squall line
  severe: boolean;
};

/** Seasonal weight: favours the summer hemisphere, tropics always active. */
function seasonWeight(lat: number, sunLat: number) {
  if (Math.abs(lat) < 15) return 1;
  const summer = Math.sign(lat) === Math.sign(sunLat) ? 1 : 0;
  return 0.25 + 0.75 * summer;
}

function systemsForHour(slot: number, sunLat: number): StormSystem[] {
  const rng = mulberry32(hash(slot, 17));
  const n = 2 + Math.floor(rng() * 2);
  const weights = REGIONS.map((r) => r.w * seasonWeight(r.lat, sunLat));
  const total = weights.reduce((a, b) => a + b, 0);
  const out: StormSystem[] = [];
  for (let k = 0; k < n; k++) {
    let pick = rng() * total;
    let idx = 0;
    while (pick > weights[idx] && idx < REGIONS.length - 1) pick -= weights[idx++];
    const r = REGIONS[idx];
    const lat = r.lat + gaussian(rng) * r.sLat * 0.6;
    const lon = r.lon + gaussian(rng) * r.sLon * 0.6;
    const tropical = Math.abs(lat) < 23;
    const severe = rng() < 0.14;
    out.push({
      id: `ts-${slot}-${k}`,
      region: r.name,
      origin: { lat, lon },
      birth: slot * HOUR + rng() * HOUR,
      life: (2.5 + rng() * 7) * HOUR,
      heading: tropical ? 255 + gaussian(rng) * 25 : 65 + gaussian(rng) * 30,
      speedKmh: 12 + rng() * (tropical ? 25 : 55),
      peakRate: (severe ? 40 : 10) + rng() * 30,
      radiusKm: (severe ? 60 : 25) + rng() * 60,
      elongation: rng() < 0.3 ? 2.5 + rng() * 2 : 1,
      severe,
    });
  }
  return out;
}

export function positionAt(s: StormSystem, t: number): LatLon {
  const km = (s.speedKmh * Math.max(0, t - s.birth)) / HOUR;
  return destination(s.origin, s.heading, km);
}

export function intensityAt(s: StormSystem, t: number) {
  const x = (t - s.birth) / s.life;
  if (x <= 0 || x >= 1) return 0;
  const env = Math.pow(Math.sin(Math.PI * x), 0.7);
  const p = positionAt(s, t);
  const lsh = ((t / HOUR + p.lon / 15) % 24 + 24) % 24;
  const diurnal = 0.45 + 0.55 * Math.max(0, Math.cos(((lsh - 16) / 24) * 2 * Math.PI));
  return env * diurnal;
}

/** All systems that could be alive anywhere in [t0, t1]. */
export function systemsBetween(t0: number, t1: number, extra: StormSystem[] = []) {
  const sunLat = subsolarPoint(t1).lat;
  const list: StormSystem[] = [];
  for (let slot = Math.floor((t0 - 10 * HOUR) / HOUR); slot <= Math.floor(t1 / HOUR); slot++) {
    for (const s of systemsForHour(slot, sunLat)) if (s.birth < t1 && s.birth + s.life > t0) list.push(s);
  }
  for (const s of extra) if (s.birth < t1 && s.birth + s.life > t0) list.push(s);
  return list;
}

/**
 * Emits strikes for [t0, t1]. `keep` < 1 decimates (used for old backfill so the
 * 24 h view fits in the ring buffer).
 */
export function generateStrikes(
  systems: StormSystem[],
  t0: number,
  t1: number,
  emit: (lat: number, lon: number, t: number) => void,
  keep = 1,
  rand: () => number = Math.random,
) {
  const step = Math.min(t1 - t0, 5 * 60_000);
  for (let a = t0; a < t1; a += step) {
    const b = Math.min(t1, a + step);
    const mid = (a + b) / 2;
    for (const s of systems) {
      const I = intensityAt(s, mid);
      if (I <= 0.02) continue;
      const expected = s.peakRate * I * ((b - a) / 60_000) * keep;
      let n = Math.floor(expected);
      if (rand() < expected - n) n++;
      for (let i = 0; i < n; i++) {
        const t = a + rand() * (b - a);
        const c = positionAt(s, t);
        // Squall lines spread perpendicular to motion; cells are roughly circular.
        const along = gaussian(rand) * s.radiusKm * 0.35;
        const across = gaussian(rand) * s.radiusKm * 0.35 * s.elongation;
        const p1 = destination(c, s.heading, along);
        const p = destination(p1, s.heading + 90, across);
        emit(p.lat, p.lon, t);
      }
    }
  }
}

export function stormCellsAt(systems: StormSystem[], t: number): StormCell[] {
  const cells: StormCell[] = [];
  for (const s of systems) {
    const I = intensityAt(s, t);
    if (I < 0.12) continue;
    const p = positionAt(s, t);
    cells.push({
      id: s.id,
      kind: s.severe && I > 0.45 ? "severe" : "thunderstorm",
      lat: p.lat,
      lon: p.lon,
      radiusKm: s.radiusKm * (0.6 + 0.6 * I) * (s.elongation > 1 ? 1.4 : 1),
      intensity: I,
      headingDeg: ((s.heading % 360) + 360) % 360,
      speedKmh: s.speedKmh,
      strikesPerMin: Math.round(s.peakRate * I),
      source: "mock",
    });
  }
  return cells;
}

/** A storm parked near the selected place, used when its forecast says thunder is likely. */
export function localSystem(p: LatLon, strength: number, now: number): StormSystem {
  const rng = mulberry32(hash(p.lat, p.lon, Math.floor(now / (6 * HOUR))));
  const start = destination(p, rng() * 360, 25 + rng() * 60);
  return {
    id: `local-${p.lat.toFixed(2)}-${p.lon.toFixed(2)}`,
    region: "Local cell",
    origin: start,
    birth: now - 2.5 * HOUR,
    life: 6 * HOUR,
    heading: 40 + rng() * 80,
    speedKmh: 10 + rng() * 20,
    peakRate: 12 + strength * 30,
    radiusKm: 20 + strength * 25,
    elongation: 1,
    severe: strength > 0.8,
  };
}
