import * as THREE from "three";
import type { LatLon, RadarIndex } from "@/types/weather";
import { bearingDeg, DEG, haversineKm } from "@/lib/geo";
import { stitchTiles } from "./tileClient";

/** RainViewer is fetched at z1 with 512 px tiles → one 1024² web-mercator image per frame. */
const Z = 1;
const TILE = 512;
const FRAME_STEP = 10 * 60_000;

type Frame = {
  time: number;
  status: "pending" | "ready" | "error";
  texture?: THREE.DataTexture;
  data?: Uint8Array;
  width?: number;
};

export type RadarSample = { a: THREE.DataTexture | null; b: THREE.DataTexture | null; mix: number; frameTime: number | null };

export type RainCell = { lat: number; lon: number; dbz: number; distanceKm: number; bearing: number; snow: boolean };

/** dBZ → rain rate (mm/h), Marshall–Palmer Z = 200 R^1.6 */
export const dbzToRate = (dbz: number) => Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6);

class RadarManager {
  private index: RadarIndex | null = null;
  private frames = new Map<number, Frame>();
  private listeners = new Set<(frameTime: number) => void>();
  private queue: number[] = [];
  private busy = false;

  get hasData() {
    return !!this.index?.frames.length;
  }

  /** [first, last] frame times, or null if no radar. */
  get coverage(): [number, number] | null {
    const f = this.index?.frames;
    return f?.length ? [f[0].time, f[f.length - 1].time] : null;
  }

  onFrame(fn: (frameTime: number) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  setIndex(index: RadarIndex) {
    this.index = index;
    const keep = new Set(index.frames.map((f) => f.time));
    for (const [t, fr] of this.frames) {
      if (!keep.has(t)) {
        fr.texture?.dispose();
        this.frames.delete(t);
      }
    }
    // Newest first so the live view appears immediately, then backfill for playback.
    this.queue = [...index.frames].reverse().map((f) => f.time).filter((t) => !this.frames.has(t));
    this.pump();
  }

  private async pump(): Promise<void> {
    if (this.busy || !this.index) return;
    const t = this.queue.shift();
    if (t === undefined) return;
    const frame = this.index.frames.find((f) => f.time === t);
    if (!frame) return this.pump();
    this.busy = true;
    const entry: Frame = { time: t, status: "pending" };
    this.frames.set(t, entry);
    const res = await stitchTiles({
      kind: "rainviewer",
      template: `${this.index.host}${frame.path}/${TILE}/{z}/{x}/{y}/2/0_1.png`,
      z: Z,
      tileSize: TILE,
    });
    if (res.ok) {
      const tex = new THREE.DataTexture(res.data, res.width, res.height, THREE.RGFormat, THREE.UnsignedByteType);
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      Object.assign(entry, { status: "ready", texture: tex, data: res.data, width: res.width });
      this.listeners.forEach((l) => l(t));
    } else {
      entry.status = "error";
    }
    this.busy = false;
    // Yield between frames so decoding never competes with the first paint.
    setTimeout(() => this.pump(), 60);
  }

  private readyTimes() {
    return [...this.frames.values()].filter((f) => f.status === "ready").map((f) => f.time).sort((a, b) => a - b);
  }

  /** Two bracketing frames + crossfade factor for time t. Null textures → outside radar coverage. */
  sample(t: number): RadarSample {
    const times = this.readyTimes();
    const cov = this.coverage;
    if (!times.length || !cov || t < cov[0] - FRAME_STEP / 2 || t > cov[1] + FRAME_STEP * 1.5) {
      return { a: null, b: null, mix: 0, frameTime: null };
    }
    let i = times.findIndex((x) => x > t);
    if (i === -1) i = times.length;
    const t0 = times[Math.max(0, i - 1)];
    const t1 = times[Math.min(times.length - 1, i)];
    const fa = this.frames.get(t0)!.texture!;
    const fb = this.frames.get(t1)!.texture!;
    const mix = t1 === t0 ? 0 : THREE.MathUtils.clamp((t - t0) / (t1 - t0), 0, 1);
    return { a: fa, b: fb, mix, frameTime: mix < 0.5 ? t0 : t1 };
  }

  private frameDataAt(t: number) {
    const s = this.sample(t);
    if (!s.frameTime) return null;
    const f = this.frames.get(s.frameTime);
    return f?.data && f.width ? { data: f.data, width: f.width } : null;
  }

  /** Reflectivity at a point (dBZ) or null if no echo / no coverage. */
  dbzAt(p: LatLon, t: number) {
    const fd = this.frameDataAt(t);
    if (!fd) return null;
    const [x, y] = mercatorPx(p, fd.width);
    let best = 0;
    // 3×3 neighbourhood smooths the coarse global grid.
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = (wrap(y + dy, fd.width) * fd.width + wrap(x + dx, fd.width)) * 2;
        best = Math.max(best, fd.data[i], fd.data[i + 1]);
      }
    return best ? best - 11 : null;
  }

  /** Local reflectivity maxima ≥ minDbz within radiusKm — "rain cells" for the events panel. */
  cellsNear(p: LatLon, t: number, radiusKm = 400, minDbz = 22): RainCell[] {
    const fd = this.frameDataAt(t);
    if (!fd) return [];
    const W = fd.width;
    const [cx, cy] = mercatorPx(p, W);
    const kmPerPx = (40075 * Math.cos(p.lat * DEG)) / W;
    const r = Math.ceil(radiusKm / Math.max(5, kmPerPx));
    const val = (x: number, y: number) => {
      const i = (wrap(y, W) * W + wrap(x, W)) * 2;
      return Math.max(fd.data[i], fd.data[i + 1]);
    };
    const cells: RainCell[] = [];
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        const v = val(x, y);
        if (v - 11 < minDbz) continue;
        let isMax = true;
        for (let dy = -2; dy <= 2 && isMax; dy++)
          for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && val(x + dx, y + dy) > v) { isMax = false; break; }
        if (!isMax) continue;
        // Real cells have neighbouring echoes; isolated spikes are usually clutter.
        let support = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && val(x + dx, y + dy) - 11 >= 15) support++;
        if (support < 3) continue;
        const ll = pxToLatLon(x + 0.5, y + 0.5, W);
        const d = haversineKm(p, ll);
        if (d > radiusKm) continue;
        const i = (wrap(y, W) * W + wrap(x, W)) * 2;
        cells.push({ ...ll, dbz: v - 11, distanceKm: d, bearing: bearingDeg(p, ll), snow: fd.data[i + 1] > fd.data[i] });
      }
    // Flat-topped echoes yield several equal maxima; keep the strongest within 60 km.
    const kept: RainCell[] = [];
    for (const c of cells.sort((a, b) => b.dbz - a.dbz)) {
      if (kept.every((k) => haversineKm(k, c) > 60)) kept.push(c);
      if (kept.length === 6) break;
    }
    return kept;
  }
}

function wrap(v: number, W: number) {
  return ((v % W) + W) % W;
}

function mercatorPx(p: LatLon, W: number): [number, number] {
  const lat = THREE.MathUtils.clamp(p.lat, -85.05, 85.05) * DEG;
  const x = Math.floor(((p.lon + 180) / 360) * W);
  const y = Math.floor((0.5 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / (2 * Math.PI)) * W);
  return [x, THREE.MathUtils.clamp(y, 0, W - 1)];
}

function pxToLatLon(x: number, y: number, W: number): LatLon {
  const lon = (x / W) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / W;
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return { lat, lon: ((lon + 540) % 360) - 180 };
}

export const radar = new RadarManager();
