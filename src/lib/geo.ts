import * as THREE from "three";
import type { LatLon } from "@/types/weather";

export const DEG = Math.PI / 180;
export const EARTH_RADIUS_KM = 6371;

/**
 * Lat/lon → point on a sphere, matching THREE.SphereGeometry's UV layout
 * (u = 0 at lon -180, lon 0 on +X, north pole on +Y), so equirectangular
 * textures and these positions always agree.
 */
export function latLonToVec3(lat: number, lon: number, radius = 1, target = new THREE.Vector3()) {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  return target.set(
    -radius * Math.sin(theta) * Math.cos(phi),
    radius * Math.cos(theta),
    radius * Math.sin(theta) * Math.sin(phi),
  );
}

export function vec3ToLatLon(v: THREE.Vector3): LatLon {
  const r = v.length();
  const lat = 90 - Math.acos(THREE.MathUtils.clamp(v.y / r, -1, 1)) / DEG;
  let lon = Math.atan2(v.z, -v.x) / DEG - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lat, lon };
}

export function haversineKm(a: LatLon, b: LatLon) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(a: LatLon, b: LatLon) {
  const y = Math.sin((b.lon - a.lon) * DEG) * Math.cos(b.lat * DEG);
  const x =
    Math.cos(a.lat * DEG) * Math.sin(b.lat * DEG) -
    Math.sin(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((b.lon - a.lon) * DEG);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Point reached travelling `distKm` from `p` on initial bearing `brgDeg`. */
export function destination(p: LatLon, brgDeg: number, distKm: number): LatLon {
  const d = distKm / EARTH_RADIUS_KM;
  const brg = brgDeg * DEG;
  const lat1 = p.lat * DEG;
  const lon1 = p.lon * DEG;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
  const lon2 =
    lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / DEG, lon: ((((lon2 / DEG + 540) % 360) + 360) % 360) - 180 };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export function compass(deg: number) {
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

/**
 * Accepts "41.8831,23.4673", "41.8831 23.4673", "41.88°N 23.47°E", "41.88 N, 23.47 E", "-33.9, 151.2".
 */
export function parseCoordinates(input: string): LatLon | null {
  const s = input.trim().toUpperCase().replace(/°/g, " ");
  const m = s.match(
    /^([+-]?\d{1,2}(?:\.\d+)?)\s*([NS])?\s*[,;\s]\s*([+-]?\d{1,3}(?:\.\d+)?)\s*([EW])?$/,
  );
  if (!m) return null;
  let lat = parseFloat(m[1]);
  let lon = parseFloat(m[3]);
  if (m[2] === "S") lat = -Math.abs(lat);
  if (m[4] === "W") lon = -Math.abs(lon);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function formatLat(lat: number, digits = 4) {
  return `${Math.abs(lat).toFixed(digits)}°${lat >= 0 ? "N" : "S"}`;
}
export function formatLon(lon: number, digits = 4) {
  return `${Math.abs(lon).toFixed(digits)}°${lon >= 0 ? "E" : "W"}`;
}
export function formatLatLon(p: LatLon, digits = 4) {
  return `${formatLat(p.lat, digits)}  ${formatLon(p.lon, digits)}`;
}
