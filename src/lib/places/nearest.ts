"use client";

/**
 * The town a spot on the globe belongs to, from an offline list of GeoNames settlements split into 5° tiles
 * (public/places/<version>/t/<tile>.txt, one `name|lat|lon|cc|admin1|p` line per town). Same logic as Watched's
 * dropped pins (https://github.com/dev-Armaan/satellites, src/imagery/localPlaces.ts, MIT):
 *
 *   - every town has a "reach" that grows with its population (~2 km for a village, ~16 km for a city of a million,
 *     at most 30 km);
 *   - the spot's town is the one with the smallest distance ÷ reach, if that is under 1;
 *   - nothing within reach (open sea, desert, ice): undefined, and the caller asks a network geocoder.
 *
 * Only the tiles within ~33 km of the spot are fetched; each file is fetched once per page and kept in memory.
 */
import { haversineKm } from "@/lib/geo";
import { PLACE_TILES, PLACE_TILES_SPLIT, PLACES_VERSION } from "./tiles.gen";

export type LocalPlace = {
  name: string;
  lat: number;
  lon: number;
  /** ISO country code, upper case */
  cc: string;
  /** State or province */
  admin1: string;
  /** Population on a log scale: round(20·log10(people)); 0 when unknown */
  p: number;
};

const BASE = `/places/${PLACES_VERSION}/t`;
const TILE_DEG = 5;
const TILE_ROWS = 180 / TILE_DEG;
const TILE_COLS = 360 / TILE_DEG;
const SPLIT = new Set(PLACE_TILES_SPLIT.split(",").filter(Boolean).map(Number));
let tileBits: Uint8Array | undefined;
const hasTile = (i: number) => {
  tileBits ??= Uint8Array.from(atob(PLACE_TILES), (c) => c.charCodeAt(0));
  return ((tileBits[i >> 3] >> (i & 7)) & 1) === 1;
};

/** How far from its point a town's name still holds, in km. */
export function reachKm(p: number): number {
  const people = p > 0 ? 10 ** (p / 20) : 1_000;
  return Math.min(30, 2 * Math.max(1, people / 1_000) ** 0.3);
}

function tileIndex(row: number, col: number) {
  const r = Math.min(TILE_ROWS - 1, Math.max(0, row));
  const c = ((col % TILE_COLS) + TILE_COLS) % TILE_COLS;
  return r * TILE_COLS + c;
}

/** The file (without .txt) holding (lat, lon): `<i>`, or `<i>-<q>` for a quarter of a split tile. */
function tileFile(lat: number, lon: number): string | null {
  const row = Math.floor((lat + 90) / TILE_DEG);
  const col = Math.floor((lon + 180) / TILE_DEG);
  const i = tileIndex(row, col);
  if (!hasTile(i)) return null;
  if (!SPLIT.has(i)) return String(i);
  const north = (lat + 90) / TILE_DEG - row >= 0.5 ? 1 : 0;
  const east = ((lon + 180) / TILE_DEG - col) % 1 >= 0.5 ? 1 : 0;
  return `${i}-${north * 2 + east}`;
}

/** The files under the spot and under points 0.3° (~33 km, the largest reach) around it. */
function tilesAround(lat: number, lon: number): string[] {
  const dLat = 0.3;
  const dLon = Math.min(5, 0.3 / Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const out = new Set<string>();
  for (const a of [-dLat, 0, dLat])
    for (const o of [-dLon, 0, dLon]) {
      const la = Math.max(-89.999, Math.min(89.999, lat + a));
      const lo = ((((lon + o + 180) % 360) + 360) % 360) - 180;
      const f = tileFile(la, lo);
      if (f) out.add(f);
    }
  return [...out];
}

function parse(text: string): LocalPlace[] {
  const out: LocalPlace[] = [];
  for (const line of text.split("\n")) {
    const f = line.split("|");
    if (f.length < 6 || !f[0]) continue;
    const lat = Number(f[1]);
    const lon = Number(f[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({ name: f[0], lat, lon, cc: f[3], admin1: f[4], p: Number(f[5]) || 0 });
  }
  return out;
}

/** Tile files, fetched once per page and shared by every caller (a small cache: the user rarely pins far apart). */
const files = new Map<string, Promise<LocalPlace[]>>();
function load(file: string): Promise<LocalPlace[]> {
  let p = files.get(file);
  if (!p) {
    p = fetch(`${BASE}/${file}.txt`).then((r) => {
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`places tile ${file}: ${r.status}`);
      return r.text().then(parse);
    });
    p.catch(() => files.delete(file)); // a failed fetch is retried next time
    files.set(file, p);
    if (files.size > 48) files.delete(files.keys().next().value as string);
  }
  return p;
}

/** The settlement (lat, lon) is in, or undefined when none reaches it. Rejects if a tile can't be loaded. */
export async function nearestLocal(lat: number, lon: number): Promise<LocalPlace | undefined> {
  const lists = await Promise.all(tilesAround(lat, lon).map(load));
  let best: LocalPlace | undefined;
  let bestScore = 1;
  for (const list of lists)
    for (const r of list) {
      if (Math.abs(r.lat - lat) > 0.3) continue;
      const score = haversineKm({ lat, lon }, r) / reachKm(r.p);
      if (score < bestScore) {
        best = r;
        bestScore = score;
      }
    }
  return best;
}

let regionNames: Intl.DisplayNames | undefined;
/** "BG" → "Bulgaria" */
export function countryName(cc: string): string {
  if (!cc) return "";
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(cc) ?? cc;
  } catch {
    return cc;
  }
}
