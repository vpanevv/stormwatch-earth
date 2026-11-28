/**
 * How NASA's lightning climatology is packed into the 8-bit PNGs in public/lightning/lisotd-v2.3/ (written by
 * scripts/build-lightning-climatology.mjs, read by climatology.ts). A log scale keeps quiet places (0.001
 * flashes/km²/day) and the stormiest ones (0.5) both precise in 256 steps.
 */
export const CLIMO_DIR = "/lightning/lisotd-v2.3";
export const CLIMO_W = 720; // 0.5° columns from 180° W
export const CLIMO_H = 360; // 0.5° rows, north at the top
const R0 = 0.0005; // flashes/km²/day
const RMAX = 0.6;
const K = Math.log(1 + RMAX / R0);

export const encodeRate = (r: number) => Math.max(0, Math.min(255, Math.round((255 * Math.log(1 + Math.max(0, r) / R0)) / K)));
export const decodeRate = (q: number) => R0 * (Math.exp((q / 255) * K) - 1);
