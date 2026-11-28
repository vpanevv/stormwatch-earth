"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { clock } from "@/store/useAppStore";
import { radar } from "@/lib/radar/manager";
import { CLIMATE, COLOR, GEO, NOISE, SIM_PRECIP } from "./shaders/common";
import { TEXTURES } from "./Earth";
import { RENDER_ORDER, shared } from "./uniforms";
import { useLayerFade } from "./useLayerFade";
import { LayerGroup } from "./LayerGroup";

const vertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
void main() {
  vUv = uv;
  vN = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Falling snow, worldwide: RainViewer's snow channel where radar exists, plus the simulated
 * precipitation field wherever the climate model is below freezing. Rendered as a pale
 * blue → white → lavender intensity wash with drifting, twinkling flakes.
 */
const fragment = /* glsl */ `
${NOISE}
${GEO}
${COLOR}
${CLIMATE}
${SIM_PRECIP}
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uWater;
uniform sampler2D uTopo;
uniform float uMix;
uniform float uRadar;
uniform float uOpacity;
uniform float uTime;
uniform float uSimHours;
uniform vec3 uSunDir;
uniform vec2 uTexel;
varying vec2 vUv;
varying vec3 vN;

float snowTap(sampler2D t, vec2 uv) {
  vec2 o = uTexel * 0.75;
  float s = texture2D(t, uv).g * 2.0;
  s += texture2D(t, uv + vec2(o.x, o.y)).g + texture2D(t, uv + vec2(-o.x, o.y)).g;
  s += texture2D(t, uv + vec2(o.x, -o.y)).g + texture2D(t, uv + vec2(-o.x, -o.y)).g;
  return s / 6.0 * 255.0;
}

void main() {
  vec3 n = normalize(vN);
  float land = 1.0 - texture2D(uWater, vUv).g;
  float t = climateTemp(vUv, n, land, texture2D(uTopo, vUv).r, uSunDir, uSimHours);
  float cold = smoothstep(1.5, -1.0, t);
  float dbz = simPrecipDbz(vUv, n, uSimHours) * cold;

  if (uRadar > 0.5 && inMercator(vUv) > 0.5) {
    vec2 m = mercatorUv(vUv);
    float g = mix(snowTap(uA, m), snowTap(uB, m), uMix);
    if (g > 0.5) dbz = max(dbz, g - 11.0);
  }
  if (dbz < 2.0) discard;

  float inten = smoothstep(2.0, 30.0, dbz);
  vec3 col = mix(vec3(0.55, 0.76, 1.0), vec3(0.96, 0.98, 1.0), smoothstep(6.0, 20.0, dbz));
  col = mix(col, vec3(0.8, 0.7, 1.0), smoothstep(26.0, 40.0, dbz));
  float a = inten * 0.62;

  // Flakes: a 3D jittered grid sliced by the sphere, drifting and twinkling.
  vec3 p = n * 650.0 + vec3(uTime * 0.35, -uTime * 0.8, uTime * 0.25);
  vec3 cell = floor(p);
  vec3 f = fract(p) - 0.5;
  float rnd = hash31(cell);
  float flake = smoothstep(0.24, 0.0, length(f.xy + (vec2(rnd, fract(rnd * 7.3)) - 0.5) * 0.3)) * step(0.5, rnd);
  flake *= 0.6 + 0.4 * sin(uTime * 3.0 + rnd * 40.0);
  flake *= 1.0 - smoothstep(0.35, 1.1, fwidth(p.x));
  col += flake * 0.7;
  a = max(a, flake * inten);

  col *= 0.6 + 0.4 * smoothstep(-0.3, 0.2, dot(n, uSunDir));
  gl_FragColor = vec4(toLinear(col), a * uOpacity);
  #include <colorspace_fragment>
}
`;

const EMPTY = new THREE.DataTexture(new Uint8Array([0, 0]), 1, 1, THREE.RGFormat);
EMPTY.needsUpdate = true;

function Snowfall({ opacity }: { opacity: React.RefObject<number> }) {
  const [water, topo] = useTexture([TEXTURES.water, TEXTURES.topo]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uA: { value: EMPTY },
          uB: { value: EMPTY },
          uWater: { value: water },
          uTopo: { value: topo },
          uMix: { value: 0 },
          uRadar: { value: 0 },
          uOpacity: { value: 0 },
          uTime: shared.uTime,
          uSimHours: shared.uSimHours,
          uSunDir: shared.uSunDir,
          uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
        },
        transparent: true,
        depthWrite: false,
      }),
    [water, topo],
  );

  useFrame(() => {
    const s = radar.sample(clock.time);
    const u = material.uniforms;
    if (s.a && s.b) {
      u.uA.value = s.a;
      u.uB.value = s.b;
      u.uMix.value = s.mix;
      u.uRadar.value = 1;
    } else u.uRadar.value = 0;
    u.uOpacity.value = opacity.current;
  });

  return (
    <mesh material={material} renderOrder={RENDER_ORDER.precipitation}>
      <sphereGeometry args={[1.005, 160, 80]} />
    </mesh>
  );
}

export function SnowfallLayer({ enabled }: { enabled: boolean }) {
  const { mounted, opacity } = useLayerFade(enabled);
  return mounted ? (
    <LayerGroup opacity={opacity}>
      <Snowfall opacity={opacity} />
    </LayerGroup>
  ) : null;
}
