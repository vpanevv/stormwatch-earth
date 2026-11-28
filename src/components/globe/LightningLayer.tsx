"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { clock, LIGHTNING_WINDOW_MS, useAppStore } from "@/store/useAppStore";
import { STRIKE_CAPACITY, STRIKE_EPOCH, strikes } from "@/lib/lightning/buffer";
import { COLOR } from "./shaders/common";
import { RENDER_ORDER } from "./uniforms";
import { useLayerFade } from "./useLayerFade";
import { LayerGroup } from "./LayerGroup";

const vertex = /* glsl */ `
attribute float aTime;
uniform float uNow;
uniform float uWindow;
uniform float uRate;
uniform float uPixelRatio;
uniform float uScale;
uniform float uPlayback;
varying float vAge;
varying float vFlash;
varying float vVisible;
void main() {
  float age = uNow - aTime;
  vVisible = step(0.0, age) * step(age, uWindow);
  vAge = clamp(age / uWindow, 0.0, 1.0);
  // Flash duration is measured in *real* seconds so it reads the same at x1 and x10 playback.
  float realAge = age / max(uRate, 1.0);
  // Playback compresses hours into seconds: shorter, smaller flashes keep clusters from blooming.
  vFlash = vVisible * exp(-realAge * mix(1.4, 7.0, uPlayback)) * mix(1.0, 0.55, uPlayback);
  vec3 toCam = normalize(cameraPosition - position);
  float facing = dot(normalize(position), toCam);
  vVisible *= smoothstep(0.04, 0.18, facing);
  // Grazing-angle strikes flash softer so bloom doesn't turn the limb into flares.
  vFlash *= smoothstep(0.1, 0.45, facing);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = vVisible > 0.0 ? (2.2 + mix(30.0, 14.0, uPlayback) * vFlash) * uPixelRatio * uScale : 0.0;
}
`;

const fragment = /* glsl */ `
${COLOR}
uniform float uOpacity;
varying float vAge;
varying float vFlash;
varying float vVisible;
void main() {
  if (vVisible <= 0.0) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  // Blitzortung-style ageing: white → yellow → orange → deep red.
  vec3 c = mix(vec3(1.0, 0.97, 0.8), vec3(1.0, 0.78, 0.2), smoothstep(0.0, 0.08, vAge));
  c = mix(c, vec3(1.0, 0.45, 0.08), smoothstep(0.08, 0.35, vAge));
  c = mix(c, vec3(0.75, 0.08, 0.06), smoothstep(0.35, 0.9, vAge));
  float base = (1.0 - vFlash) * smoothstep(1.0, 0.45, r) * (1.0 - vAge * 0.55);
  float halo = vFlash * (exp(-r * r * 7.0) * 1.3 + smoothstep(1.0, 0.0, r) * 0.25);
  vec3 col = c * base * 0.95 + vec3(0.78, 0.86, 1.0) * halo;
  gl_FragColor = vec4(toLinear(col * uOpacity), 1.0);
  #include <colorspace_fragment>
}
`;

function Lightning({ opacity }: { opacity: React.RefObject<number> }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const camera = useThree((s) => s.camera);

  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(strikes.positions, 3).setUsage(THREE.DynamicDrawUsage);
    const time = new THREE.BufferAttribute(strikes.times, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", pos);
    g.setAttribute("aTime", time);
    g.setDrawRange(0, STRIKE_CAPACITY);
    const m = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uNow: { value: 0 },
        uWindow: { value: 3600 },
        uRate: { value: 1 },
        uPixelRatio: { value: 1 },
        uScale: { value: 1 },
        uOpacity: { value: 0 },
        uPlayback: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, []);

  useFrame(() => {
    const dirty = strikes.drainDirty();
    if (dirty.length) {
      const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
      const time = geometry.getAttribute("aTime") as THREE.BufferAttribute;
      pos.clearUpdateRanges();
      time.clearUpdateRanges();
      for (const [start, count] of dirty) {
        pos.addUpdateRange(start * 3, count * 3);
        time.addUpdateRange(start, count);
      }
      pos.needsUpdate = true;
      time.needsUpdate = true;
    }
    const u = material.uniforms;
    u.uNow.value = (clock.time - STRIKE_EPOCH) / 1000;
    u.uWindow.value = LIGHTNING_WINDOW_MS[useAppStore.getState().lightningWindow] / 1000;
    u.uRate.value = clock.rate;
    u.uPlayback.value = clock.rate > 1 ? 1 : 0;
    u.uPixelRatio.value = dpr;
    u.uScale.value = THREE.MathUtils.clamp(3.2 / camera.position.length(), 0.85, 2.2);
    u.uOpacity.value = opacity.current;
  });

  return (
    <points geometry={geometry} material={material} frustumCulled={false} renderOrder={RENDER_ORDER.lightning} />
  );
}

export function LightningLayer({ enabled }: { enabled: boolean }) {
  const { mounted, opacity } = useLayerFade(enabled, 0.4);
  return mounted ? (
    <LayerGroup opacity={opacity}>
      <Lightning opacity={opacity} />
    </LayerGroup>
  ) : null;
}
