"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useAppStore } from "@/store/useAppStore";
import { loadOwmLayer } from "@/lib/radar/owm";
import { COLOR, GEO, NOISE } from "./shaders/common";
import { TEXTURES } from "./Earth";
import { RENDER_ORDER, shared } from "./uniforms";
import { useLayerFade } from "./useLayerFade";

const vertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vPos;
void main() {
  vUv = uv;
  vN = normalize(position);
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}
`;

const fragment = /* glsl */ `
${NOISE}
${GEO}
${COLOR}
uniform sampler2D uClouds;
uniform sampler2D uReal;
uniform float uUseReal;
uniform float uOpacity;
uniform vec3 uSunDir;
uniform float uCloudShift;
uniform float uTime;
uniform vec3 uFocus;
uniform float uFocusCover;
uniform float uOrbitFade;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vPos;

void main() {
  vec3 n = normalize(vN);
  // Slow domain warp makes the cloud field churn rather than just slide.
  vec3 q = n * 3.5 + vec3(0.0, uTime * 0.012, 0.0);
  vec2 warp = vec2(fbm(q), fbm(q + 7.31)) - 0.5;
  vec2 uv = vec2(vUv.x - uCloudShift, vUv.y) + warp * 0.01;
  float c = texture2D(uClouds, uv).r;
  c *= 0.78 + 0.45 * fbm(n * 22.0 + uTime * 0.02);

  if (uUseReal > 0.5) {
    float real = texture2D(uReal, mercatorUv(vUv)).a;
    c = mix(c * 0.35, real * (0.75 + 0.35 * c), inMercator(vUv));
  }

  // Pull the field toward the observed cloud cover around the selected place,
  // keeping cloud structure (thresholded noise) instead of painting a flat disc.
  if (uFocusCover >= 0.0) {
    float ang = acos(clamp(dot(n, uFocus), -1.0, 1.0));
    float ragged = (fbm(n * 14.0 + 3.7) - 0.5) * 0.09;
    float w = 1.0 - smoothstep(0.01, 0.1, ang + ragged);
    float structure = fbm(n * 34.0 + warp.xyx * 3.0 + uTime * 0.01);
    float target = smoothstep(0.55 - uFocusCover * 0.3, 0.78 - uFocusCover * 0.2, structure) * (0.3 + 0.45 * uFocusCover);
    c = mix(c, max(c * (1.0 - uFocusCover * 0.3), target), w * 0.75);
  }

  float dn = dot(n, uSunDir);
  float light = smoothstep(-0.18, 0.32, dn);
  vec3 V = normalize(cameraPosition - vPos);

  // Puffy relief: treat cloud density as a height field and light its normal.
  vec2 t = vec2(1.5 / 4096.0, 1.5 / 2048.0);
  float cx = texture2D(uClouds, uv + vec2(t.x, 0.0)).r - texture2D(uClouds, uv - vec2(t.x, 0.0)).r;
  float cy = texture2D(uClouds, uv + vec2(0.0, t.y)).r - texture2D(uClouds, uv - vec2(0.0, t.y)).r;
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-5));
  vec3 north = cross(n, east);
  vec3 nb = normalize(n - (east * cx + north * cy) * 5.0);

  // Self-shadowing: denser cloud between this point and the sun darkens it.
  vec3 sunT = uSunDir - n * dn;
  vec2 toSun = vec2(dot(sunT, east), dot(sunT, north)) * 0.0035;
  float occ = texture2D(uClouds, uv + toSun).r;
  float shade = 1.0 - clamp((occ - c) * 1.6, 0.0, 0.55);

  vec3 sunCol = mix(vec3(1.0, 0.52, 0.28), vec3(1.0, 0.98, 0.95), smoothstep(-0.02, 0.3, dn));
  vec3 lit = sunCol * (0.28 + 0.9 * max(dot(nb, uSunDir), 0.0)) * shade;
  // Night side reads like an IR satellite pass: cool grey, still clearly visible.
  vec3 col = mix(vec3(0.12, 0.14, 0.19), lit * vec3(0.89, 0.89, 0.87), light);
  // Thin cloud scatters bluish; silver lining on the limb.
  col = mix(col * vec3(0.82, 0.88, 1.0), col, smoothstep(0.15, 0.65, c));
  col += sunCol * pow(1.0 - max(dot(n, V), 0.0), 3.0) * smoothstep(-0.05, 0.25, dn) * 0.3;
  // The cloud map has a grey floor: remap to sparse, crisp cover. Decks sink into the haze at the limb.
  float a = smoothstep(0.16, 0.78, c) * uOpacity * (0.4 + 0.6 * light);
  a *= 1.0 - 0.55 * pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 4.0);
  // The global cloud map is ~10 km/px: on close views it thins to a veil so the HD ground reads.
  a *= mix(0.12, 1.0, uOrbitFade);
  gl_FragColor = vec4(toLinear(col), a);
  #include <colorspace_fragment>
}
`;

function Clouds({ opacity }: { opacity: React.RefObject<number> }) {
  const tex = useTexture(TEXTURES.clouds);
  const owm = useAppStore((s) => s.config.openweather);
  const material = useMemo(() => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uClouds: { value: tex },
        uReal: { value: null },
        uUseReal: { value: 0 },
        uOpacity: { value: 0 },
        uSunDir: shared.uSunDir,
        uCloudShift: shared.uCloudShift,
        uTime: shared.uTime,
        uFocus: shared.uFocus,
        uFocusCover: shared.uFocusCover,
        uOrbitFade: shared.uOrbitFade,
      },
      transparent: true,
      depthWrite: false,
    });
  }, [tex]);

  useEffect(() => {
    if (!owm) return;
    let alive = true;
    loadOwmLayer("clouds_new").then((t) => {
      if (!alive || !t) return;
      material.uniforms.uReal.value = t;
      material.uniforms.uUseReal.value = 1;
    });
    return () => {
      alive = false;
    };
  }, [owm, material]);

  useFrame(() => {
    material.uniforms.uOpacity.value = opacity.current * 0.95;
  });

  return (
    <mesh material={material} renderOrder={RENDER_ORDER.clouds}>
      <sphereGeometry args={[1.007, 160, 80]} />
    </mesh>
  );
}

export function CloudLayer({ enabled }: { enabled: boolean }) {
  const { mounted, opacity } = useLayerFade(enabled);
  return mounted ? <Clouds opacity={opacity} /> : null;
}
