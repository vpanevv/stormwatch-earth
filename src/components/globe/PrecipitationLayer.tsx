"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { clock, useAppStore } from "@/store/useAppStore";
import { useTexture } from "@react-three/drei";
import { TEXTURES } from "./Earth";
import { radar } from "@/lib/radar/manager";
import { CLIMATE, COLOR, GEO, NOISE, PRECIP_RAMP, SIM_PRECIP } from "./shaders/common";
import { RENDER_ORDER, shared } from "./uniforms";
import { useLayerFade } from "./useLayerFade";

const vertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
void main() {
  vUv = uv;
  vN = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragment = /* glsl */ `
${NOISE}
${GEO}
${PRECIP_RAMP}
${COLOR}
${CLIMATE}
${SIM_PRECIP}
uniform sampler2D uWater;
uniform sampler2D uTopo;
uniform float uSnowLayer;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uMix;
uniform float uRadar;      // 1 = RainViewer frames bound, 0 = simulated field
uniform float uOpacity;
uniform float uTime;
uniform float uSimHours;
uniform vec3 uSunDir;
uniform vec2 uTexel;
varying vec2 vUv;
varying vec3 vN;

// 5-tap tent filter: hides the 1024² source grid when zoomed in.
vec2 radarTap(sampler2D t, vec2 uv) {
  vec2 o = uTexel * 0.75;
  vec2 s = texture2D(t, uv).rg * 2.0;
  s += texture2D(t, uv + vec2(o.x, o.y)).rg;
  s += texture2D(t, uv + vec2(-o.x, o.y)).rg;
  s += texture2D(t, uv + vec2(o.x, -o.y)).rg;
  s += texture2D(t, uv + vec2(-o.x, -o.y)).rg;
  return s / 6.0 * 255.0;
}

void main() {
  vec3 n = normalize(vN);
  float dbz;
  float snow = 0.0;

  if (uRadar > 0.5) {
    vec2 m = mercatorUv(vUv);
    vec2 a = radarTap(uA, m);
    vec2 b = radarTap(uB, m);
    vec2 v = mix(a, b, uMix);
    float code = max(v.r, v.g);
    dbz = code > 0.5 ? code - 11.0 : -99.0;
    snow = v.g / max(v.r + v.g, 0.001);
    dbz = mix(-99.0, dbz, inMercator(vUv));
  } else {
    dbz = simPrecipDbz(vUv, n, uSimHours);
    float land = 1.0 - texture2D(uWater, vUv).g;
    float t = climateTemp(vUv, n, land, texture2D(uTopo, vUv).r, uSunDir, uSimHours);
    snow = smoothstep(1.5, -1.0, t);
  }

  // When the Snow layer is on it owns frozen precipitation.
  float keep = 1.0 - snow * uSnowLayer;
  if (keep < 0.05) discard;

  if (dbz < 4.0) discard;

  vec3 col = precipColor(dbz);
  col = mix(col, vec3(0.85, 0.95, 1.0), snow * 0.75);
  float a = smoothstep(4.0, 22.0, dbz) * 0.85 + 0.15 * smoothstep(30.0, 45.0, dbz);

  // Animated rainfall: fine slanted streaks that fade out when too small to resolve.
  float phase = dot(n, vec3(0.32, 1.0, 0.55)) * 900.0 + uTime * 2.2 + vnoise(n * 260.0) * 4.0;
  float fw = fwidth(phase);
  float streak = smoothstep(0.86, 1.0, fract(phase)) * (1.0 - smoothstep(0.25, 0.9, fw));
  col += streak * 0.35 * smoothstep(12.0, 35.0, dbz);
  a *= 0.82 + 0.18 * vnoise(n * 140.0 + vec3(uTime * 0.8));

  // Echoes stay readable on the night side, slightly dimmed.
  float light = smoothstep(-0.3, 0.2, dot(n, uSunDir));
  col *= 0.7 + 0.3 * light;
  gl_FragColor = vec4(toLinear(col), a * uOpacity * keep);
  #include <colorspace_fragment>
}
`;

const EMPTY = new THREE.DataTexture(new Uint8Array([0, 0]), 1, 1, THREE.RGFormat);
EMPTY.needsUpdate = true;

function Precipitation({ opacity }: { opacity: React.RefObject<number> }) {
  const [water, topo] = useTexture([TEXTURES.water, TEXTURES.topo]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uA: { value: EMPTY },
          uB: { value: EMPTY },
          uMix: { value: 0 },
          uRadar: { value: 0 },
          uOpacity: { value: 0 },
          uTime: shared.uTime,
          uSimHours: shared.uSimHours,
          uSunDir: shared.uSunDir,
          uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
          uWater: { value: water },
          uTopo: { value: topo },
          uSnowLayer: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
      }),
    [water, topo],
  );

  useFrame((_, dt) => {
    const s = radar.sample(clock.time);
    const u = material.uniforms;
    if (s.a && s.b) {
      u.uA.value = s.a;
      u.uB.value = s.b;
      u.uMix.value = s.mix;
      u.uRadar.value = 1;
    } else {
      u.uRadar.value = 0;
    }
    u.uOpacity.value = opacity.current;
    const snowOn = useAppStore.getState().layers.snow ? 1 : 0;
    u.uSnowLayer.value += (snowOn - u.uSnowLayer.value) * Math.min(1, dt * 3);
  });

  return (
    <mesh material={material} renderOrder={RENDER_ORDER.precipitation}>
      <sphereGeometry args={[1.0045, 160, 80]} />
    </mesh>
  );
}

export function PrecipitationLayer({ enabled }: { enabled: boolean }) {
  const { mounted, opacity } = useLayerFade(enabled);
  return mounted ? <Precipitation opacity={opacity} /> : null;
}
