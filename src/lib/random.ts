/** Small deterministic PRNG (mulberry32) so mock data is stable across reloads. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(...parts: number[]) {
  let h = 2166136261;
  for (const p of parts) {
    h ^= Math.floor(p * 1000) | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function gaussian(rand: () => number) {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Cheap smooth 3D value noise in [-1, 1] — used for CPU-side wind and mock fields. */
export function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const r = (i: number, j: number, k: number) => {
    let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) & 0xffff) / 32767.5 - 1;
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return lerp(
    lerp(lerp(r(xi, yi, zi), r(xi + 1, yi, zi), u), lerp(r(xi, yi + 1, zi), r(xi + 1, yi + 1, zi), u), v),
    lerp(lerp(r(xi, yi, zi + 1), r(xi + 1, yi, zi + 1), u), lerp(r(xi, yi + 1, zi + 1), r(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
