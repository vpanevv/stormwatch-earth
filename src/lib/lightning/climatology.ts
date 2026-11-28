"use client";

/**
 * NASA's typical lightning for a place: the LIS/OTD satellite climatology (1995–2014), from the small maps in
 * public/lightning/lisotd-v2.3/ (scripts/build-lightning-climatology.mjs). Averaged over the same 100 km circle the
 * live Xweather count uses, so the two can sit side by side: what is striking now, and what is normal here.
 * Only two maps are fetched (this month's and the year's), once, then cached.
 */
import { CLIMO_DIR, CLIMO_H, CLIMO_W, decodeRate } from "./climatologyCodec";
import { haversineKm } from "@/lib/geo";

const maps = new Map<string, Promise<Uint8Array>>();

function loadMap(name: string): Promise<Uint8Array> {
  let p = maps.get(name);
  if (!p) {
    p = (async () => {
      const blob = await (await fetch(`${CLIMO_DIR}/${name}.png`)).blob();
      const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const c = document.createElement("canvas");
      c.width = CLIMO_W;
      c.height = CLIMO_H;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      const rgba = ctx.getImageData(0, 0, CLIMO_W, CLIMO_H).data;
      const out = new Uint8Array(CLIMO_W * CLIMO_H);
      for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
      return out;
    })();
    p.catch(() => maps.delete(name));
    maps.set(name, p);
  }
  return p;
}

/** Mean flash rate (flashes/km²/day) over a circle of `radiusKm` around (lat, lon), area-weighted. */
function circleMean(grid: Uint8Array, lat: number, lon: number, radiusKm: number) {
  const dRows = Math.ceil(radiusKm / 55) + 1;
  const row0 = Math.floor((90 - lat) / 0.5), col0 = Math.floor((lon + 180) / 0.5);
  let sum = 0, wsum = 0;
  for (let dr = -dRows; dr <= dRows; dr++) {
    const row = row0 + dr;
    if (row < 0 || row >= CLIMO_H) continue;
    const cLat = 90 - (row + 0.5) * 0.5;
    const w = Math.cos((cLat * Math.PI) / 180); // cell area ∝ cos(lat)
    const dCols = Math.min(CLIMO_W / 2, Math.ceil(dRows / Math.max(0.15, w)));
    for (let dc = -dCols; dc <= dCols; dc++) {
      const col = (((col0 + dc) % CLIMO_W) + CLIMO_W) % CLIMO_W;
      const cLon = -180 + (col + 0.5) * 0.5;
      if (haversineKm({ lat, lon }, { lat: cLat, lon: cLon }) > radiusKm + 25) continue;
      sum += decodeRate(grid[row * CLIMO_W + col]) * w;
      wsum += w;
    }
  }
  return wsum ? sum / wsum : 0;
}

export type TypicalLightning = {
  /** Calendar month the "typical" numbers are for (0 = January), in the place's local time. */
  month: number;
  /** Average strikes within `radiusKm` in a 5-minute window in this month: comparable to the live count. */
  per5min: number;
  /** Flashes per km² per year at the place (the classic lightning-map number). */
  perKm2Year: number;
  /** How this month compares to the place's year: "peak", "busy", "average", "quiet" or "very quiet". */
  season: "peak" | "busy" | "average" | "quiet" | "very quiet";
  radiusKm: number;
};

export async function typicalLightning(lat: number, lon: number, utcOffsetSeconds = 0, radiusKm = 100): Promise<TypicalLightning> {
  const month = new Date(Date.now() + utcOffsetSeconds * 1000).getUTCMonth();
  const [m, y] = await Promise.all([loadMap(`m${String(month + 1).padStart(2, "0")}`), loadMap("annual")]);
  const monthRate = circleMean(m, lat, lon, radiusKm); // flashes/km²/day
  const yearRate = circleMean(y, lat, lon, radiusKm);
  const area = Math.PI * radiusKm * radiusKm;
  const ratio = yearRate > 0 ? monthRate / yearRate : 0;
  return {
    month,
    per5min: monthRate * area * (5 / 1440),
    perKm2Year: yearRate * 365,
    season: ratio >= 1.6 ? "peak" : ratio >= 1.15 ? "busy" : ratio >= 0.7 ? "average" : ratio >= 0.3 ? "quiet" : "very quiet",
    radiusKm,
  };
}
