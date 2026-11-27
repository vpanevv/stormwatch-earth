"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { clock, useAppStore } from "@/store/useAppStore";
import { DEG, haversineKm } from "@/lib/geo";
import { noise3 } from "@/lib/random";
import { RENDER_ORDER } from "./uniforms";
import { useLayerFade } from "./useLayerFade";

const R = 1.011;

/**
 * Wind field model (m/s): trade easterlies, mid-latitude westerlies with a jet near 45°,
 * polar easterlies, plus time-evolving noise eddies. Near the selected place the field is
 * blended toward the observed wind so the local flow is real.
 */
function windAt(lat: number, lon: number, hours: number, focus: FocusWind | null): [number, number] {
  const a = Math.abs(lat);
  let u =
    13 * Math.exp(-(((a - 45) / 12) ** 2)) -
    7 * Math.exp(-((lat / 17) ** 2)) -
    4 * Math.exp(-(((a - 74) / 8) ** 2));
  let v = 0;
  const t = hours * 0.04;
  u += 9 * noise3(lat * 0.045, lon * 0.045, t);
  v += 8 * noise3(lat * 0.045 + 31.7, lon * 0.045 + 12.1, t + 4.0);
  // Converge toward the ITCZ.
  v += -3 * Math.sin((lat / 25) * Math.PI) * Math.exp(-((lat / 25) ** 2));
  if (focus && Math.abs(lat - focus.lat) < 16) {
    const d = haversineKm({ lat, lon }, focus);
    const w = Math.exp(-((d / 700) ** 2));
    if (w > 0.01) {
      u = u * (1 - w) + focus.u * w;
      v = v * (1 - w) + focus.v * w;
    }
  }
  return [u, v];
}

type FocusWind = { lat: number; lon: number; u: number; v: number };

function Wind({ opacity }: { opacity: React.RefObject<number> }) {
  const count = typeof window !== "undefined" && window.innerWidth < 768 ? 2600 : 6500;

  const state = useMemo(() => {
    const lat = new Float32Array(count);
    const lon = new Float32Array(count);
    const age = new Float32Array(count);
    const life = new Float32Array(count);
    const spawn = (i: number) => {
      // Area-uniform latitude so the poles aren't overcrowded.
      lat[i] = Math.asin(Math.random() * 2 - 1) / DEG * 0.98;
      lon[i] = Math.random() * 360 - 180;
      age[i] = 0;
      life[i] = 2 + Math.random() * 4;
    };
    for (let i = 0; i < count; i++) {
      spawn(i);
      age[i] = Math.random() * life[i];
    }
    const positions = new Float32Array(count * 6);
    const colors = new Float32Array(count * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    return { lat, lon, age, life, spawn, positions, colors, geometry, material };
  }, [count]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = useAppStore.getState();
    const w = s.weather.data;
    const focus: FocusWind | null =
      s.selection && w
        ? (() => {
            const spd = w.current.windSpeed / 3.6;
            const to = (w.current.windDirection + 180) * DEG;
            return { lat: s.selection.lat, lon: s.selection.lon, u: spd * Math.sin(to), v: spd * Math.cos(to) };
          })()
        : null;
    const hours = (clock.time - Date.now()) / 3_600_000 + performance.now() / 3_600_000;
    const { lat, lon, age, life, spawn, positions, colors } = state;
    const k = 0.055; // degrees per (m/s · s) — visual speed
    for (let i = 0; i < count; i++) {
      age[i] += dt;
      if (age[i] > life[i] || Math.abs(lat[i]) > 84) spawn(i);
      const [u, v] = windAt(lat[i], lon[i], hours, focus);
      const cosLat = Math.max(0.15, Math.cos(lat[i] * DEG));
      lat[i] += v * k * dt;
      lon[i] += (u * k * dt) / cosLat;
      if (lon[i] > 180) lon[i] -= 360;
      if (lon[i] < -180) lon[i] += 360;

      const speed = Math.hypot(u, v);
      const tail = 0.55 + speed * 0.06;
      const lat0 = lat[i] - v * k * tail;
      const lon0 = lon[i] - (u * k * tail) / cosLat;
      writeVec(positions, i * 6, lat[i], lon[i]);
      writeVec(positions, i * 6 + 3, lat0, lon0);

      const fade = Math.sin(Math.PI * Math.min(1, age[i] / life[i]));
      const t = Math.min(1, speed / 22);
      // calm: steel blue → breezy: cyan-white → strong: amber
      const r = 0.35 + 0.65 * t;
      const g = 0.55 + 0.35 * (1 - Math.abs(t - 0.5) * 2) + 0.1;
      const b = 0.9 - 0.6 * t;
      const head = fade * (0.35 + 0.65 * t);
      colors[i * 6] = r * head;
      colors[i * 6 + 1] = g * head;
      colors[i * 6 + 2] = b * head;
      colors[i * 6 + 3] = 0;
      colors[i * 6 + 4] = 0;
      colors[i * 6 + 5] = 0;
    }
    state.geometry.getAttribute("position").needsUpdate = true;
    state.geometry.getAttribute("color").needsUpdate = true;
    state.material.opacity = opacity.current * 0.9;
  });

  return (
    <lineSegments
      geometry={state.geometry}
      material={state.material}
      frustumCulled={false}
      renderOrder={RENDER_ORDER.wind}
    />
  );
}

function writeVec(arr: Float32Array, o: number, lat: number, lon: number) {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  const st = Math.sin(theta);
  arr[o] = -R * st * Math.cos(phi);
  arr[o + 1] = R * Math.cos(theta);
  arr[o + 2] = R * st * Math.sin(phi);
}

export function WindLayer({ enabled }: { enabled: boolean }) {
  const { mounted, opacity } = useLayerFade(enabled);
  return mounted ? <Wind opacity={opacity} /> : null;
}
