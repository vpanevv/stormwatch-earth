"use client";

import { useFrame } from "@react-three/fiber";
import { BASE_RATE, clock, useAppStore } from "@/store/useAppStore";
import { sunDirection } from "@/lib/sun";
import { latLonToVec3 } from "@/lib/geo";
import { shared } from "./uniforms";

let lastPublish = 0;

/** Advances the timeline clock and refreshes shared uniforms. Renders nothing. */
export function TimeDriver() {
  useFrame(({ camera }, delta) => {
    const s = useAppStore.getState();
    const now = Date.now();
    const dt = Math.min(delta, 0.1);

    if (s.live) {
      clock.time = now;
      clock.rate = 1;
    } else if (s.playing) {
      clock.rate = BASE_RATE * s.speed / 1000;
      clock.time += dt * 1000 * clock.rate;
      if (clock.time >= now) {
        s.goLive();
        clock.time = now;
      }
    } else {
      clock.time = s.time;
      clock.rate = 1;
    }

    // Publish to React at ~15 Hz (UI clocks, scrubber).
    if (now - lastPublish > 66) {
      lastPublish = now;
      if (Math.abs(s.time - clock.time) > 500) s.setTime(clock.time);
    }

    const d = camera.position.length();
    const t = Math.min(1, Math.max(0, (d - 1.16) / (1.6 - 1.16)));
    shared.uOrbitFade.value = t * t * (3 - 2 * t);
    sunDirection(clock.time, shared.uSunDir.value);
    shared.uTime.value += dt;
    shared.uSimHours.value = (clock.time - now) / 3_600_000;
    // ~0.7°/h along the timeline plus a slow ambient drift so clouds are never static.
    shared.uCloudShift.value = shared.uSimHours.value * 0.002 + shared.uTime.value * 0.000012;

    const sel = s.selection;
    if (sel) latLonToVec3(sel.lat, sel.lon, 1, shared.uFocus.value);
    else shared.uFocus.value.set(0, 0, 0);
    const w = s.weather.data;
    shared.uFocusCover.value = sel && w && s.live ? w.current.cloudCover / 100 : -1;
  });
  return null;
}
