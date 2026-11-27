#!/usr/bin/env node
/**
 * Renders the planet used by the Open Graph card (src/app/opengraph-image.tsx) from the app's own Earth textures:
 * an orthographic view over Europe, Africa and the Middle East at dusk, with clouds, city lights on the night side,
 * a Fresnel limb and a thin blue atmosphere. Social crawlers can't run WebGL, so the card needs a still.
 *
 *   node scripts/render-og-globe.mjs   →  public/og/globe.png (transparent outside the glow)
 *
 * The view (VIEW) is exported to src/app/og-view.json so the card can place its reticle on the same projection.
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const OUT = 1000; // final size (px)
const SS = 2; // supersampling
const N = OUT * SS;
const R = N * 0.42; // disc radius; the rest is atmosphere glow
const C = N / 2;
const VIEW = { lat: 30, lon: 22 }; // centre of the disc
const SUN = { lat: -21, lon: -26 }; // late-November sub-solar point, early evening over the Middle East

async function tex(path) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const [day, night, clouds] = await Promise.all([
  tex("public/textures/earth-day-4k.webp"),
  tex("public/textures/earth-night-4k.webp"),
  tex("public/textures/earth-clouds-4k.webp"),
]);

const rad = Math.PI / 180;
const toVec = (lat, lon) => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
const sun = toVec(SUN.lat, SUN.lon);
const φ0 = VIEW.lat * rad, λ0 = VIEW.lon * rad;

function sample(t, lat, lon) {
  // bilinear, equirectangular
  const u = ((lon + 180) / 360) * t.w - 0.5;
  const v = ((90 - lat) / 180) * t.h - 0.5;
  const x0 = Math.floor(u), y0 = Math.max(0, Math.min(t.h - 1, Math.floor(v)));
  const fx = u - x0, fy = v - Math.floor(v);
  const x1 = (x0 + 1 + t.w) % t.w, xa = (x0 + t.w) % t.w, y1 = Math.min(t.h - 1, y0 + 1);
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = t.data[(y0 * t.w + xa) * 3 + c], b = t.data[(y0 * t.w + x1) * 3 + c];
    const d = t.data[(y1 * t.w + xa) * 3 + c], e = t.data[(y1 * t.w + x1) * 3 + c];
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
  return out;
}
const srgbToLin = (v) => Math.pow(v / 255, 2.2);
const linToSrgb = (v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const aces = (x) => (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);

const px = Buffer.alloc(N * N * 4);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5 - C) / R, y = -(j + 0.5 - C) / R;
    const ρ = Math.hypot(x, y);
    const o = (j * N + i) * 4;
    if (ρ >= 1) {
      // atmosphere glow outside the limb
      const g = Math.exp(-(ρ - 1) * 26) * 0.9;
      const lit = 0.35 + 0.65 * smooth(-0.6, 0.6, (x * 0.8 - y * 0.2) * -1 + 0.2);
      px[o] = 110; px[o + 1] = 170; px[o + 2] = 255;
      px[o + 3] = Math.round(255 * Math.min(1, g * lit));
      continue;
    }
    const c = Math.asin(ρ);
    const sinc = Math.sin(c), cosc = Math.cos(c);
    const lat = Math.asin(cosc * Math.sin(φ0) + (ρ ? (y * sinc * Math.cos(φ0)) / ρ : 0)) / rad;
    const lon = (λ0 + Math.atan2(x * sinc, ρ * cosc * Math.cos(φ0) - y * sinc * Math.sin(φ0))) / rad;
    const lonW = ((lon + 540) % 360) - 180;
    const n = toVec(lat, lonW);
    const ndl = n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2];
    const dayK = smooth(-0.08, 0.22, ndl);

    const d = sample(day, lat, lonW).map(srgbToLin);
    const nt = sample(night, lat, lonW).map(srgbToLin);
    const cl = sample(clouds, lat, lonW)[0] / 255;
    const view = Math.sqrt(1 - ρ * ρ); // cos of the view angle
    const fres = Math.pow(1 - view, 3);
    const light = Math.max(0, ndl) * 1.25 + 0.03;
    let col = [0, 1, 2].map((k) => d[k] * light * dayK);
    // clouds: bright on the day side, faint grey at night
    const cloudK = Math.min(1, cl * 1.15);
    col = col.map((v, k) => v * (1 - cloudK) + cloudK * (light * dayK * 0.95 + 0.012));
    // city lights where it is night and not under thick cloud
    const nightK = 1 - smooth(-0.15, 0.05, ndl);
    const lights = [1.0, 0.72, 0.4];
    col = col.map((v, k) => v + nt[k] * nightK * (1 - cloudK * 0.8) * 1.6 * lights[k]);
    // dusk band and limb
    const dusk = Math.exp(-Math.pow((ndl - 0.02) / 0.06, 2)) * 0.012;
    col[0] += dusk * 1.0; col[1] += dusk * 0.45; col[2] += dusk * 0.2;
    const limb = fres * (0.25 + 0.75 * dayK);
    col = col.map((v, k) => v * (1 - fres * 0.5) + limb * [0.32, 0.52, 0.95][k] * 0.55);
    // tone map + vignette toward the limb
    const exposure = 1.15;
    for (let k = 0; k < 3; k++) px[o + k] = linToSrgb(aces(col[k] * exposure));
    // a soft edge so the disc anti-aliases
    px[o + 3] = Math.round(255 * smooth(1, 1 - 1.5 / R, ρ));
  }
}

await mkdir("public/og", { recursive: true });
await sharp(px, { raw: { width: N, height: N, channels: 4 } })
  .resize(OUT, OUT, { kernel: "lanczos3" })
  .png({ compressionLevel: 9, palette: false })
  .toFile("public/og/globe.png");
await writeFile("src/app/og-view.json", JSON.stringify({ size: OUT, radius: R / SS, view: VIEW, sun: SUN }, null, 2) + "\n");
console.log("public/og/globe.png", OUT, "px");
