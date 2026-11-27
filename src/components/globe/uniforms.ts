import * as THREE from "three";

/**
 * Uniform objects shared by every globe material. Updated once per frame by <TimeDriver/>,
 * so all layers stay in lock-step with the timeline and the sun.
 */
export const shared = {
  uSunDir: { value: new THREE.Vector3(1, 0, 0) },
  /** Real seconds since load — drives purely cosmetic motion (shimmer, warp). */
  uTime: { value: 0 },
  /** Horizontal cloud drift in UV units, follows the timeline. */
  uCloudShift: { value: 0 },
  /** Unit vector of the selected place (zero vector when nothing is selected). */
  uFocus: { value: new THREE.Vector3() },
  /** Observed cloud cover at the selected place, 0..1, or −1 when unknown. */
  uFocusCover: { value: -1 },
  /** 0 when the camera is close to the surface, 1 from orbit: global (coarse) layers step aside for HD close views. */
  uOrbitFade: { value: 1 },
  /** Timeline hours relative to now (≤ 0). Drives procedural fields during playback. */
  uSimHours: { value: 0 },
};

export const RENDER_ORDER = {
  earth: 0,
  temperature: 1,
  precipitation: 2,
  clouds: 3,
  graticule: 4,
  wind: 5,
  storms: 6,
  lightning: 7,
  marker: 8,
  atmosphere: 9,
} as const;
