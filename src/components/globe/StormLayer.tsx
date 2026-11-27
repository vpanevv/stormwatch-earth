"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { StormCell } from "@/types/weather";
import { useAppStore } from "@/store/useAppStore";
import { destination, EARTH_RADIUS_KM, latLonToVec3 } from "@/lib/geo";
import { RENDER_ORDER, shared } from "./uniforms";
import { useLayerFade } from "./useLayerFade";

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Storm cell glyph: soft core, rotating dashed outer ring, slow outward pulse. */
const fragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform float uSeed;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float ang = atan(p.y, p.x);
  float core = exp(-r * r * 5.0) * (0.35 + 0.45 * uIntensity);
  float spin = uTime * (0.4 + uIntensity * 0.8) + uSeed;
  float dashes = step(0.5, fract((ang + spin) / 6.2831853 * 24.0));
  float ring = smoothstep(0.035, 0.0, abs(r - 0.82)) * dashes;
  float ring2 = smoothstep(0.02, 0.0, abs(r - 0.6)) * 0.5;
  float pulseR = fract(uTime * 0.35 + uSeed);
  float pulse = smoothstep(0.045, 0.0, abs(r - pulseR)) * (1.0 - pulseR);
  // spiral arms for severe cells
  float arms = pow(max(0.0, sin(ang * 3.0 + r * 9.0 - spin * 2.0)), 6.0) * smoothstep(0.85, 0.2, r) * step(0.75, uIntensity) * 0.35;
  float a = core * 1.3 + ring * 1.6 + ring2 * 1.4 + pulse * 1.1 + arms;
  gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
  #include <colorspace_fragment>
}
`;

const COLORS = { rain: "#4ea3ff", thunderstorm: "#ffb020", severe: "#ff3b2f" };
const Z = new THREE.Vector3(0, 0, 1);

function CellGlyph({ cell, opacity }: { cell: StormCell; opacity: React.RefObject<number> }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uColor: { value: new THREE.Color(COLORS[cell.kind]) },
          uIntensity: { value: cell.intensity },
          uTime: shared.uTime,
          uSeed: { value: (cell.id.length * 7.13) % 1 },
          uOpacity: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [cell.kind], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { position, quaternion, size, track } = useMemo(() => {
    const n = latLonToVec3(cell.lat, cell.lon, 1).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(Z, n);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const p = destination(cell, cell.headingDeg, (cell.speedKmh * 2 * i) / 12);
      pts.push(latLonToVec3(p.lat, p.lon, 1.009));
    }
    return {
      position: n.clone().multiplyScalar(1.008),
      quaternion: q,
      size: ((cell.radiusKm * 2.6) / EARTH_RADIUS_KM),
      track: pts,
    };
  }, [cell]);

  const camera = useThree((st) => st.camera);
  const mesh = useRef<THREE.Mesh>(null);

  useFrame(() => {
    material.uniforms.uIntensity.value = cell.intensity;
    material.uniforms.uOpacity.value = opacity.current;
    // Never smaller than ~4% of the view, so cells stay legible from orbit.
    if (mesh.current) {
      const min = camera.position.distanceTo(position) * 0.045;
      mesh.current.scale.setScalar(Math.max(1, min / size));
    }
  });

  return (
    <group>
      <mesh
        ref={mesh}
        position={position}
        quaternion={quaternion}
        material={material}
        renderOrder={RENDER_ORDER.storms}
      >
        <planeGeometry args={[size, size]} />
      </mesh>
      <Line
        points={track}
        color={COLORS[cell.kind]}
        lineWidth={1}
        dashed
        dashSize={0.004}
        gapSize={0.004}
        transparent
        opacity={0.6}
        depthWrite={false}
        renderOrder={RENDER_ORDER.storms}
      />
    </group>
  );
}

function Storms({ opacity }: { opacity: React.RefObject<number> }) {
  const cells = useAppStore((s) => s.storms);
  return (
    <group>
      {cells.map((c) => (
        <CellGlyph key={c.id} cell={c} opacity={opacity} />
      ))}
    </group>
  );
}

export function StormLayer({ enabled }: { enabled: boolean }) {
  const { mounted, opacity } = useLayerFade(enabled);
  return mounted ? <Storms opacity={opacity} /> : null;
}
