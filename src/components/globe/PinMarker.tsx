"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useAppStore } from "@/store/useAppStore";
import { latLonToVec3 } from "@/lib/geo";
import { COLOR } from "./shaders/common";
import { RENDER_ORDER } from "./uniforms";

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** A bone-white reticle (ring, four ticks, a dot) that settles onto the spot as it drops. */
const fragment = /* glsl */ `
${COLOR}
uniform float uDrop;    // 0 → 1 as it lands
uniform float uFacing;
varying vec2 vUv;
const vec3 BONE = vec3(0.93, 0.9, 0.84);
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ringR = mix(0.95, 0.56, uDrop);
  float ring = smoothstep(0.03, 0.0, abs(r - ringR));
  float halo = smoothstep(0.2, 0.0, abs(r - ringR)) * 0.18;
  float tick = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.5707963 + 0.785398;
    vec2 d = vec2(cos(a), sin(a));
    float along = dot(p, d);
    float across = abs(dot(p, vec2(-d.y, d.x)));
    tick += step(across, 0.02) * step(ringR + 0.08, along) * step(along, ringR + 0.3);
  }
  float dot_ = smoothstep(0.11, 0.07, r);
  float inner = smoothstep(0.025, 0.0, abs(r - 0.2)) * 0.9;
  float a = (ring + halo + tick + inner) * uDrop + dot_;
  a *= uFacing;
  if (a < 0.004) discard;
  gl_FragColor = vec4(toLinear(BONE) * a, a);
  #include <colorspace_fragment>
}
`;

const Z = new THREE.Vector3(0, 0, 1);

/** Where the pin is on screen this frame, for the DOM card (PinCard) to follow. */
export const pinAnchor = { x: 0, y: 0, visible: false };

export function PinMarker() {
  const pin = useAppStore((s) => s.pin);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const mesh = useRef<THREE.Mesh>(null);
  const dropStart = useRef(0);
  const projected = useMemo(() => new THREE.Vector3(), []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uDrop: { value: 0 }, uFacing: { value: 1 } },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        premultipliedAlpha: true,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const { normal, quaternion } = useMemo(() => {
    if (!pin) return { normal: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const n = latLonToVec3(pin.lat, pin.lon).normalize();
    return { normal: n, quaternion: new THREE.Quaternion().setFromUnitVectors(Z, n) };
  }, [pin]);

  useEffect(() => {
    dropStart.current = performance.now();
    if (!pin) pinAnchor.visible = false;
  }, [pin]);

  useFrame(() => {
    if (!mesh.current || !pin) {
      pinAnchor.visible = false;
      return;
    }
    mesh.current.scale.setScalar(camera.position.distanceTo(mesh.current.position) * 0.06);
    const t = Math.min(1, (performance.now() - dropStart.current) / 420);
    material.uniforms.uDrop.value = 1 - Math.pow(1 - t, 3);
    const facing = THREE.MathUtils.smoothstep(normal.dot(camera.position) / camera.position.length(), 0.05, 0.25);
    material.uniforms.uFacing.value = facing;
    projected.copy(mesh.current.position).project(camera);
    pinAnchor.x = ((projected.x + 1) / 2) * size.width;
    pinAnchor.y = ((1 - projected.y) / 2) * size.height;
    pinAnchor.visible = facing > 0.5;
  });

  if (!pin) return null;
  return (
    <mesh ref={mesh} position={normal.clone().multiplyScalar(1.0055)} quaternion={quaternion} material={material} renderOrder={RENDER_ORDER.marker}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
