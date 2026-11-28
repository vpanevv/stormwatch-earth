/**
 * Shared renderer for StormWatch's brand art (the app icon and the link-preview card): a photoreal planet from the
 * app's own Earth textures (orthographic, real sun lighting, clouds, city lights at night, Fresnel limb, thin blue
 * atmosphere), and a glowing lightning strike to put over it.
 */
import sharp from "sharp";

const rad = Math.PI / 180;
let textures;
async function tex(path) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
async function loadTextures() {
  textures ??= Promise.all([
    tex("public/textures/earth-day-4k.webp"),
    tex("public/textures/earth-night-4k.webp"),
    tex("public/textures/earth-clouds-4k.webp"),
  ]);
  return textures;
}

const toVec = (lat, lon) => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
function sample(t, lat, lon) {
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

/**
 * The planet as an RGBA PNG of `size`×`size` (transparent outside the atmosphere glow), the disc `radiusFrac` of the
 * size, centred on `view` and lit from the sub-solar point `sun`. Supersampled `ss`×.
 */
export async function renderGlobe({ size, radiusFrac = 0.42, view, sun: sunLL, ss = 2, exposure = 1.15, glow = 0.9 }) {
  const [day, night, clouds] = await loadTextures();
  const N = size * ss, R = N * radiusFrac, C = N / 2;
  const sun = toVec(sunLL.lat, sunLL.lon);
  const φ0 = view.lat * rad, λ0 = view.lon * rad;
  const px = Buffer.alloc(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5 - C) / R, y = -(j + 0.5 - C) / R;
      const ρ = Math.hypot(x, y);
      const o = (j * N + i) * 4;
      if (ρ >= 1) {
        const g = Math.exp(-(ρ - 1) * 26) * glow;
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
      const vw = Math.sqrt(1 - ρ * ρ);
      const fres = Math.pow(1 - vw, 3);
      const light = Math.max(0, ndl) * 1.25 + 0.03;
      let col = [0, 1, 2].map((k) => d[k] * light * dayK);
      const cloudK = Math.min(1, cl * 1.15);
      col = col.map((v) => v * (1 - cloudK) + cloudK * (light * dayK * 0.95 + 0.012));
      const nightK = 1 - smooth(-0.15, 0.05, ndl);
      const lights = [1.0, 0.72, 0.4];
      col = col.map((v, k) => v + nt[k] * nightK * (1 - cloudK * 0.8) * 1.6 * lights[k]);
      const dusk = Math.exp(-Math.pow((ndl - 0.02) / 0.06, 2)) * 0.012;
      col[0] += dusk; col[1] += dusk * 0.45; col[2] += dusk * 0.2;
      const limb = fres * (0.25 + 0.75 * dayK);
      col = col.map((v, k) => v * (1 - fres * 0.5) + limb * [0.32, 0.52, 0.95][k] * 0.55);
      for (let k = 0; k < 3; k++) px[o + k] = linToSrgb(aces(col[k] * exposure));
      px[o + 3] = Math.round(255 * smooth(1, 1 - 1.5 / R, ρ));
    }
  }
  const png = await sharp(px, { raw: { width: N, height: N, channels: 4 } }).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
  return { png, radius: R / ss };
}

/** Where (lat, lon) lands on a renderGlobe image (orthographic, same parameters), in its pixels. */
export function project(lat, lon, { size, radiusFrac = 0.42, view }) {
  const φ = lat * rad, λ = lon * rad, φ0 = view.lat * rad, λ0 = view.lon * rad;
  const x = Math.cos(φ) * Math.sin(λ - λ0);
  const y = Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ - λ0);
  const R = size * radiusFrac;
  return { x: size / 2 + x * R, y: size / 2 - y * R };
}

/**
 * A lightning strike as an SVG layer of `w`×`h`: a jagged channel from `from` down to `to` with two short forks,
 * a white-hot core inside an orange glow, and a flash where it hits. Deterministic (seeded), so the art is stable.
 */
export function strikeSvg(w, h, { from, to, width = 6, seed = 7, flash = 1 }) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const pts = [from];
  const steps = 9;
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const off = (rnd() - 0.5) * len * 0.16 * (i % 2 ? 1 : -1);
    pts.push([from[0] + dx * t + nx * off, from[1] + dy * t + ny * off]);
  }
  pts.push(to);
  const path = (p) => p.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");
  const fork = (i, sign, k) => {
    const a = pts[i];
    const b = [a[0] + nx * len * 0.12 * sign + dx * 0.1, a[1] + ny * len * 0.12 * sign + dy * 0.1];
    const c = [b[0] + nx * len * 0.05 * sign + dx * 0.06 * k, b[1] + ny * len * 0.05 * sign + dy * 0.06 * k];
    return path([a, b, c]);
  };
  const main = path(pts);
  const forks = [fork(3, 1, 1), fork(6, -1, 0.8)];
  const r = width * 7 * flash;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="g1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${width * 2.2}"/></filter>
    <filter id="g2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${width * 0.7}"/></filter>
    <radialGradient id="fl"><stop offset="0" stop-color="#fff6e8" stop-opacity="1"/><stop offset="0.25" stop-color="#ffb066" stop-opacity="0.85"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>
  </defs>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${main}" stroke="#ff7a1a" stroke-width="${width * 3}" filter="url(#g1)" opacity="0.9"/>
    ${forks.map((f) => `<path d="${f}" stroke="#ff8a33" stroke-width="${width * 1.4}" filter="url(#g2)" opacity="0.8"/>`).join("")}
    <path d="${main}" stroke="#ffb066" stroke-width="${width * 1.3}" filter="url(#g2)"/>
    ${forks.map((f) => `<path d="${f}" stroke="#ffe2c2" stroke-width="${width * 0.45}"/>`).join("")}
    <path d="${main}" stroke="#fffaf0" stroke-width="${width * 0.6}"/>
  </g>
  <circle cx="${to[0]}" cy="${to[1]}" r="${r}" fill="url(#fl)"/>
</svg>`;
}
