"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { RENDER_ORDER, shared } from "./uniforms";

/** Thin shell, like a real limb seen from orbit (technique adapted from Watched, MIT). */
const RADIUS = 1.025;

const vertex = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}
`;

/**
 * Back faces of the shell, additive. For each view ray: impact parameter b (closest approach to the centre),
 * chord optical depth of an exponential atmosphere (brightest right at the surface, gone within a few pixels),
 * lit by the tangent point's sun angle with a Rayleigh phase term and a narrow forward-scatter lobe that blazes
 * when the sun sits behind the planet. A warm band rides the terminator.
 */
const fragment = /* glsl */ `
uniform vec3 uSunDir;
uniform float uShell;
uniform float uScaleHeight;
uniform vec3 uRayleigh;
uniform vec3 uHorizon;
uniform vec3 uTwilight;
uniform float uIntensity;
varying vec3 vPos;
float gauss(float x) { return exp(-x * x); }
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vPos - ro);
  float tca = -dot(ro, rd);
  vec3 pc = ro + rd * tca;
  float b = length(pc);
  if (b < 1.0) discard;
  float h = b - 1.0;
  vec3 n = pc / b;
  vec3 L = normalize(uSunDir);

  float od = exp(-h / uScaleHeight);
  od *= 1.0 - smoothstep(0.55, 1.0, h / (uShell - 1.0));

  float mu = dot(n, L);
  float lit = smoothstep(-0.22, 0.28, mu);
  float cosT = dot(rd, L);
  float rayleigh = 0.75 * (1.0 + cosT * cosT);
  float forward = pow(max(cosT, 0.0), 10.0) * smoothstep(-0.25, 0.1, mu);
  float twilight = gauss((mu - 0.02) / 0.14);

  vec3 tint = mix(uHorizon, uRayleigh, smoothstep(0.0, 2.5 * uScaleHeight, h));
  vec3 col = tint * rayleigh * lit + uHorizon * forward * 1.6;
  col = mix(col, uTwilight * 0.9, twilight * 0.35 * lit);
  col *= od * uIntensity;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function Atmosphere() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uSunDir: shared.uSunDir,
          uShell: { value: RADIUS },
          uScaleHeight: { value: 0.0045 },
          uRayleigh: { value: new THREE.Color("#8fb4ec") },
          uHorizon: { value: new THREE.Color("#dfe9f5") },
          uTwilight: { value: new THREE.Color("#f0a070") },
          uIntensity: { value: 0.95 },
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  return (
    <mesh material={material} renderOrder={RENDER_ORDER.atmosphere}>
      <sphereGeometry args={[RADIUS, 128, 64]} />
    </mesh>
  );
}
