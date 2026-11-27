"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { shared } from "./uniforms";

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** HDR sun disc + corona far along the sun direction. The Earth occludes it; bloom does the rest. */
const fragment = /* glsl */ `
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float core = smoothstep(0.06, 0.03, r) * 18.0;
  float corona = exp(-r * 9.0) * 2.2 + exp(-r * 3.0) * 0.25;
  vec3 col = vec3(1.0, 0.92, 0.8) * (core + corona) * smoothstep(1.0, 0.7, r);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function Sun() {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useFrame(() => group.current?.position.copy(shared.uSunDir.value).multiplyScalar(120));
  return (
    <group ref={group}>
      <Billboard>
        <mesh material={material}>
          <planeGeometry args={[34, 34]} />
        </mesh>
      </Billboard>
    </group>
  );
}
