import type { DataSource, LatLon, StormCell } from "@/types/weather";
import { strikes } from "./buffer";
import { generateStrikes, localSystem, stormCellsAt, systemsBetween, type StormSystem } from "./mock";

/**
 * A lightning feed writes strikes into the shared ring buffer and can describe
 * the storm cells it knows about. Swap MockLightningSource for a real adapter
 * (e.g. a licensed Blitzortung/Vaisala/NOAA GLM relay) without touching the globe or UI.
 */
export interface LightningSource {
  readonly id: DataSource;
  start(): void;
  stop(): void;
  /** Hint that the selected place has thunder in its forecast (0..1). */
  setFocus(p: LatLon | null, thunderRisk: number): void;
  stormCells(t: number): StormCell[];
}

const HOUR = 3_600_000;

export class MockLightningSource implements LightningSource {
  readonly id = "mock" as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private local: StormSystem | null = null;
  private idleHandles: number[] = [];

  start() {
    if (this.timer) return;
    strikes.clear();
    const now = Date.now();
    this.last = now;
    // Backfill newest hour first so the default "1h" window fills instantly,
    // then older hours (decimated) during idle time.
    const backfill = (h: number) => {
      const t1 = now - h * HOUR;
      const t0 = t1 - HOUR;
      generateStrikes(systemsBetween(t0, t1), t0, t1, (la, lo, t) => strikes.push(la, lo, t), h === 0 ? 1 : 0.3);
      strikes.notify();
    };
    backfill(0);
    const ric: (cb: () => void) => number =
      typeof requestIdleCallback === "function" ? (cb) => requestIdleCallback(cb) : (cb) => window.setTimeout(cb, 16);
    for (let h = 1; h < 24; h++) this.idleHandles.push(ric(() => backfill(h)));

    this.timer = setInterval(() => {
      const t = Date.now();
      const extra = this.local ? [this.local] : [];
      generateStrikes(systemsBetween(this.last, t, extra), this.last, t, (la, lo, tt) => strikes.push(la, lo, tt));
      this.last = t;
      strikes.notify();
    }, 200);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const cic = typeof cancelIdleCallback === "function" ? cancelIdleCallback : clearTimeout;
    this.idleHandles.forEach((h) => cic(h));
    this.idleHandles = [];
  }

  setFocus(p: LatLon | null, thunderRisk: number) {
    if (!p || thunderRisk < 0.35) {
      this.local = null;
      return;
    }
    const sys = localSystem(p, thunderRisk, Date.now());
    if (this.local?.id === sys.id) return;
    this.local = sys;
    // Give the local cell a history so the 15m/1h windows aren't empty on arrival.
    const now = Date.now();
    generateStrikes([sys], sys.birth, now, (la, lo, t) => strikes.push(la, lo, t));
    strikes.notify();
  }

  stormCells(t: number) {
    const extra = this.local ? [this.local] : [];
    return stormCellsAt(systemsBetween(t - 1, t, extra), t);
  }
}
