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
