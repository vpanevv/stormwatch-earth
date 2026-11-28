#!/usr/bin/env node
/**
 * Packs NASA's LIS/OTD 0.5° High Resolution Monthly Climatology (HRMC V2.3.2015, doi:10.5067/LIS/LIS-OTD/DATA311)
 * into 13 small 8-bit PNGs the app reads in the browser: m01…m12 (each month's mean flash rate) and annual
 * (the mean over the year), in flashes/km²/day on a log scale (src/lib/lightning/climatologyCodec.ts).
 *
 * The source file needs a free NASA Earthdata login:
 *   https://data.ghrc.earthdata.nasa.gov/ghrcw-protected/lohrmc__2.3.2015/LISOTD_HRMC_V2.3.2015.nc
 * Then: npm i --no-save h5wasm && node scripts/build-lightning-climatology.mjs ~/Downloads/LISOTD_HRMC_V2.3.2015.nc
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import h5wasm from "h5wasm/node";

const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/build-lightning-climatology.mjs <LISOTD_HRMC_V2.3.2015.nc>");
const W = 720, H = 360, R0 = 0.0005, RMAX = 0.6, K = Math.log(1 + RMAX / R0);
const enc = (r) => Math.max(0, Math.min(255, Math.round((255 * Math.log(1 + Math.max(0, r) / R0)) / K)));

await h5wasm.ready;
const f = new h5wasm.File(src, "r");
const lat = f.get("Latitude").value;
const fr = f.get("HRMC_COM_FR").value; // [lat 360 (south → north)][lon 720 (from 180° W)][month 12], flashes/km²/day
if (lat[0] > lat[1]) throw new Error("unexpected latitude order");
const out = "public/lightning/lisotd-v2.3";
await mkdir(out, { recursive: true });
const write = (name, valueAt) => {
  const px = Buffer.alloc(W * H);
  for (let row = 0; row < H; row++) {
    const i = H - 1 - row; // north at the top of the image
    for (let j = 0; j < W; j++) px[row * W + j] = enc(valueAt(i, j));
  }
  return sharp(px, { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 9 }).toFile(`${out}/${name}.png`);
};
for (let m = 0; m < 12; m++) await write(`m${String(m + 1).padStart(2, "0")}`, (i, j) => fr[(i * W + j) * 12 + m]);
await write("annual", (i, j) => {
  let s = 0;
  for (let m = 0; m < 12; m++) s += fr[(i * W + j) * 12 + m];
  return s / 12;
});
f.close();
await writeFile(`${out}/SOURCE.txt`, "NASA LIS/OTD 0.5 Degree High Resolution Monthly Climatology (HRMC) V2.3.2015\nDOI 10.5067/LIS/LIS-OTD/DATA311, NASA Global Hydrometeorology Resource Center DAAC.\nCombined flash rate (flashes/km²/day), log-encoded: see src/lib/lightning/climatologyCodec.ts\n");
console.log("wrote", out);
