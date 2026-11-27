import { latLonToVec3 } from "@/lib/geo";
import * as THREE from "three";

/**
 * Fixed-capacity ring buffer of strikes in GPU-ready typed arrays.
 * The lightning layer uploads only the ranges written since its last frame.
 */
export const STRIKE_CAPACITY = 150_000;
/** Strike times are stored as float32 seconds relative to this epoch to keep precision. */
export const STRIKE_EPOCH = Date.now() - 26 * 3_600_000;

const tmp = new THREE.Vector3();

class StrikeBuffer {
  readonly positions = new Float32Array(STRIKE_CAPACITY * 3);
  readonly times = new Float32Array(STRIKE_CAPACITY).fill(-1e9);
  readonly lats = new Float32Array(STRIKE_CAPACITY);
  readonly lons = new Float32Array(STRIKE_CAPACITY);
  head = 0;
  count = 0;
  /** Pending [start, count] ranges for the GPU. */
  dirty: [number, number][] = [];
  private listeners = new Set<() => void>();

  push(lat: number, lon: number, timeMs: number) {
    const i = this.head;
    latLonToVec3(lat, lon, 1.0035, tmp);
    this.positions[i * 3] = tmp.x;
    this.positions[i * 3 + 1] = tmp.y;
    this.positions[i * 3 + 2] = tmp.z;
    this.times[i] = (timeMs - STRIKE_EPOCH) / 1000;
    this.lats[i] = lat;
    this.lons[i] = lon;
    const last = this.dirty[this.dirty.length - 1];
    if (last && last[0] + last[1] === i) last[1]++;
    else this.dirty.push([i, 1]);
    this.head = (i + 1) % STRIKE_CAPACITY;
    this.count = Math.min(STRIKE_CAPACITY, this.count + 1);
  }

  /** Empties the buffer (a new source taking over, or StrictMode re-mounting in dev). */
  clear() {
    this.times.fill(-1e9);
    this.head = 0;
    this.count = 0;
    this.dirty = [[0, STRIKE_CAPACITY]];
  }

  notify() {
    this.listeners.forEach((l) => l());
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  drainDirty() {
    const d = this.dirty;
    this.dirty = [];
    return d;
  }
}

export const strikes = new StrikeBuffer();
