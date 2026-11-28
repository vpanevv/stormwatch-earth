"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useAppStore } from "@/store/useAppStore";
import { loadOwmLayer } from "@/lib/radar/owm";
import { CLIMATE, COLOR, GEO, NOISE, TEMP_RAMP } from "./shaders/common";
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
 * Surface temperature. With an OpenWeather key: their temp_new tiles.
 * Without: a radiative toy model — latitude + season (subsolar latitude), land/sea contrast
 * and a diurnal swing — clearly labelled MODEL in the UI.
 */
const fragment = /* glsl */ `
${NOISE}
${GEO}
${TEMP_RAMP}
${COLOR}
${CLIMATE}
uniform sampler2D uWater;
uniform sampler2D uTopo;
uniform sampler2D uReal;
uniform float uUseReal;
uniform float uOpacity;
uniform vec3 uSunDir;
uniform float uSimHours;
varying vec2 vUv;
varying vec3 vN;

void main() {
  vec3 n = normalize(vN);
  if (uUseReal > 0.5) {
    vec4 r = texture2D(uReal, mercatorUv(vUv));
    gl_FragColor = vec4(toLinear(r.rgb), r.a * uOpacity * 0.85 * inMercator(vUv));
    #include <colorspace_fragment>
    return;
  }
  float land = 1.0 - texture2D(uWater, vUv).g;
  float t = climateTemp(vUv, n, land, texture2D(uTopo, vUv).r, uSunDir, uSimHours);
  float d = dot(n, uSunDir);
  t += land * (6.0 * max(d, 0.0) - 3.0 * smoothstep(0.0, -0.4, d));
  vec3 col = tempColor(t);
  gl_FragColor = vec4(toLinear(col), uOpacity * 0.55);
  #include <colorspace_fragment>
}
`;

function Temperature({ opacity }: { opacity: React.RefObject<number> }) {
  const [water, topo] = useTexture([TEXTURES.water, TEXTURES.topo]);
  const owm = useAppStore((s) => s.config.openweather);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uWater: { value: water },
          uTopo: { value: topo },
          uReal: { value: null },
          uUseReal: { value: 0 },
          uOpacity: { value: 0 },
          uSunDir: shared.uSunDir,
          uSimHours: shared.uSimHours,
        },
        transparent: true,
        depthWrite: false,
      }),
    [water, topo],
  );
  useEffect(() => {
    if (!owm) return;
    let alive = true;
    loadOwmLayer("temp_new").then((t) => {
      if (!alive || !t) return;
      material.uniforms.uReal.value = t;
      material.uniforms.uUseReal.value = 1;
    });
    return () => {
      alive = false;
    };
  }, [owm, material]);
  useFrame(() => {
    material.uniforms.uOpacity.value = opacity.current;
  });
  return (
    <mesh material={material} renderOrder={RENDER_ORDER.temperature}>
      <sphereGeometry args={[1.002, 128, 64]} />
    </mesh>
  );
}

export function TemperatureLayer({ enabled }: { enabled: boolean }) {
  const { mounted, opacity } = useLayerFade(enabled);
  return mounted ? (
    <LayerGroup opacity={opacity}>
      <Temperature opacity={opacity} />
    </LayerGroup>
  ) : null;
}
