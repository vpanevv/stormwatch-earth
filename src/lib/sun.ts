import * as THREE from "three";
import { DEG, latLonToVec3 } from "./geo";

/**
 * Subsolar point (where the sun is directly overhead) for a UTC time.
 * Low-precision NOAA approximation — accurate to a fraction of a degree,
 * which is plenty for day/night shading.
 */
export function subsolarPoint(timeMs: number) {
  const d = new Date(timeMs);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = (timeMs - start) / 86_400_000;
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (d.getUTCHours() - 12) / 24);

  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));

  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  let lon = -(utcMinutes + eqTimeMin - 720) / 4;
  lon = ((lon + 540) % 360) - 180;
  return { lat: decl / DEG, lon };
}

export function sunDirection(timeMs: number, target = new THREE.Vector3()) {
  const p = subsolarPoint(timeMs);
  return latLonToVec3(p.lat, p.lon, 1, target).normalize();
}

export type SunEvent =
  | { kind: "sunrise" | "sunset"; time: number }
  | { kind: "polar-day" | "polar-night" };

/**
 * The next sun event at a place, from the forecast's daily sunrise/sunset: sunset while the sun is up, sunrise while
 * it is down. Null when the forecast has no sun times (the offline fallback).
 */
export function nextSunEvent(
  daily: { sunrise?: number; sunset?: number }[],
  isDay: boolean,
  now = Date.now(),
): SunEvent | null {
  if (!daily.length || daily.every((d) => d.sunrise === undefined && d.sunset === undefined)) return null;
  const want = isDay ? "sunset" : "sunrise";
  // Open-Meteo marks polar night with sunrise = sunset (local midnight) and midnight sun with a 24 h day:
  // neither is a real sunrise or sunset.
  const real = (d: { sunrise?: number; sunset?: number }) =>
    d.sunrise !== undefined && d.sunset !== undefined && d.sunset - d.sunrise > 60_000 && d.sunset - d.sunrise < 86_340_000;
  const times = daily
    .filter(real)
    .map((d) => d[want])
    .filter((t): t is number => t !== undefined && t > now)
    .sort((a, b) => a - b);
  if (times.length && times[0] - now < 3 * 86_400_000) return { kind: want, time: times[0] };
  // No sunset ahead while it's day (or no sunrise while it's night): the sun stays up (or down) for days.
  return { kind: isDay ? "polar-day" : "polar-night" };
}

/** "in 3 h 12 min" / "in 45 min" */
export function untilLabel(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(m / 60);
  return h > 0 ? `in ${h} h ${m % 60} min` : `in ${m} min`;
}
