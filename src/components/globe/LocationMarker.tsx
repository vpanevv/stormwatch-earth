"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useAppStore } from "@/store/useAppStore";
import { latLonToVec3 } from "@/lib/geo";
import { COLOR } from "./shaders/common";
import { RENDER_ORDER, shared } from "./uniforms";

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Radar-lock reticle drawn in one fragment shader:
 * bracketed ring that converges on lock, cardinal ticks, hot core, and expanding sonar pulses.
 */
const fragment = /* glsl */ `
${COLOR}
uniform float uTime;
uniform float uLock;     // 0 → 1 during lock-on
uniform float uFacing;
varying vec2 vUv;
const vec3 ORANGE = vec3(1.0, 0.48, 0.1);
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float lock = uLock;
  float ringR = mix(0.95, 0.5, lock);

  // Bracket ring: four arcs with gaps at the cardinal ticks, rotating into place during lock.
  float rot = (1.0 - lock) * 1.6;
  float ring = smoothstep(0.018, 0.0, abs(r - ringR)) * step(abs(sin((ang + rot + 0.785) * 2.0)), 0.92);

  // Cardinal ticks outside the ring.
  float tick = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.5707963;
    vec2 d = vec2(cos(a), sin(a));
    float along = dot(p, d);
    float across = abs(dot(p, vec2(-d.y, d.x)));
    tick += step(across, 0.012) * step(ringR + 0.06, along) * step(along, ringR + 0.2);
  }

  float core = exp(-r * r * 260.0) * 1.6 + exp(-r * r * 40.0) * 0.35;
  float inner = smoothstep(0.012, 0.0, abs(r - 0.12)) * 0.8;

  float pulse = 0.0;
  for (int i = 0; i < 2; i++) {
    float t = fract(uTime * 0.55 + float(i) * 0.5);
    float pr = mix(0.12, 1.0, t);
    pulse += smoothstep(0.025, 0.0, abs(r - pr)) * pow(1.0 - t, 1.6);
  }

  float a = (ring + tick * 0.9) * lock + core + inner * lock + pulse * 0.9 * lock;
  a *= uFacing;
  if (a < 0.003) discard;
  gl_FragColor = vec4(toLinear(ORANGE * a), 1.0);
  #include <colorspace_fragment>
}
`;

const Z = new THREE.Vector3(0, 0, 1);

export function LocationMarker() {
  const selection = useAppStore((s) => s.selection);
  const camera = useThree((s) => s.camera);
  const mesh = useRef<THREE.Mesh>(null);
  const size = useThree((s) => s.size);
  const lockStart = useRef(0);
  const projected = useMemo(() => new THREE.Vector3(), []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uTime: shared.uTime, uLock: { value: 0 }, uFacing: { value: 1 } },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const { normal, quaternion } = useMemo(() => {
    if (!selection) return { normal: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const n = latLonToVec3(selection.lat, selection.lon).normalize();
    return { normal: n, quaternion: new THREE.Quaternion().setFromUnitVectors(Z, n) };
  }, [selection]);

  useEffect(() => {
    lockStart.current = performance.now();
  }, [selection?.id]);

  useFrame(() => {
    const el = markerLabel.el;
    if (!mesh.current || !selection) {
      if (el) el.style.opacity = "0";
      return;
    }
    const camDist = camera.position.distanceTo(mesh.current.position);
    mesh.current.scale.setScalar(camDist * 0.085);
    const t = Math.min(1, (performance.now() - lockStart.current) / 900);
    material.uniforms.uLock.value = 1 - Math.pow(1 - t, 3);
    const shown = useAppStore.getState().entered ? 1 : 0;
    const facing = shown * THREE.MathUtils.smoothstep(normal.dot(camera.position) / camera.position.length(), 0.05, 0.25);
    material.uniforms.uFacing.value = facing;
    if (el) {
      projected.copy(mesh.current.position).project(camera);
      const x = ((projected.x + 1) / 2) * size.width;
      const y = ((1 - projected.y) / 2) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.opacity = String(facing * material.uniforms.uLock.value);
    }
  });

  if (!selection) return null;
  const pos = normal.clone().multiplyScalar(1.0055);

  return (
    <group>
      <mesh ref={mesh} position={pos} quaternion={quaternion} material={material} renderOrder={RENDER_ORDER.marker}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}

/** The label is plain DOM outside the canvas; the marker positions it every frame. */
export const markerLabel: { el: HTMLDivElement | null } = { el: null };
