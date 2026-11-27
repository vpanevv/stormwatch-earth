import { RV_RAIN, RV_SNOW } from "./palette";

/** Maps RainViewer "Universal Blue" pixels back to reflectivity. Shared by the tile worker and the mini-map. */

type Entry = { r: number; g: number; b: number; a: number; dbz: number; snow: boolean };

const unpack = (c: number) => ({ r: (c >>> 24) & 255, g: (c >>> 16) & 255, b: (c >>> 8) & 255, a: c & 255 });
const key = (r: number, g: number, b: number, a: number) => ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;

const PALETTE: Entry[] = [
  ...RV_RAIN.map(([dbz, c]) => ({ ...unpack(c), dbz, snow: false })),
  ...RV_SNOW.map(([dbz, c]) => ({ ...unpack(c), dbz, snow: true })),
];
const lookup = new Map<number, Entry>();
for (const p of PALETTE) lookup.set(key(p.r, p.g, p.b, p.a), p);

/** Canvas readback un-premultiplies alpha with rounding, so unseen colours fall back to nearest match (cached). */
export function decodePixel(r: number, g: number, b: number, a: number): Entry | null {
  if (a === 0) return null;
  const k = key(r, g, b, a);
  let p = lookup.get(k);
  if (!p) {
    let bd = Infinity;
    for (const e of PALETTE) {
      const d = (e.r - r) ** 2 + (e.g - g) ** 2 + (e.b - b) ** 2 + 4 * (e.a - a) ** 2;
      if (d < bd) {
        bd = d;
        p = e;
      }
    }
    lookup.set(k, p!);
  }
  return p!;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: number[], b: number[], t: number) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** JS twin of the GLSL precipColor ramp — blue / green / yellow / red / magenta. Returns 0..255 RGB. */
export function precipRGB(dbz: number, snow = false) {
  let c = [0.25, 0.55, 1.0];
  c = mix3(c, [0.15, 0.85, 0.45], smooth(18, 26, dbz));
  c = mix3(c, [1.0, 0.86, 0.15], smooth(32, 40, dbz));
  c = mix3(c, [1.0, 0.18, 0.12], smooth(45, 52, dbz));
  c = mix3(c, [0.95, 0.3, 0.95], smooth(58, 64, dbz));
  if (snow) c = mix3(c, [0.85, 0.95, 1.0], 0.75);
  return c.map((v) => Math.round(v * 255)) as [number, number, number];
}

export function precipAlpha(dbz: number) {
  return Math.round(255 * (smooth(4, 22, dbz) * 0.85 + 0.15 * smooth(30, 45, dbz)));
}
