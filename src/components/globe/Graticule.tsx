"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { latLonToVec3 } from "@/lib/geo";
import { RENDER_ORDER } from "./uniforms";

/** Faint 15° lat/lon grid with a slightly brighter equator — the "scientific instrument" layer. */
export function Graticule() {
  const { grid, equator } = useMemo(() => {
    const r = 1.0025;
    const pts: number[] = [];
    const push = (a: THREE.Vector3, b: THREE.Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let lat = -75; lat <= 75; lat += 15) {
      if (lat === 0) continue;
      for (let lon = -180; lon < 180; lon += 2) push(latLonToVec3(lat, lon, r), latLonToVec3(lat, lon + 2, r));
    }
    for (let lon = -180; lon < 180; lon += 15)
      for (let lat = -80; lat < 80; lat += 2) push(latLonToVec3(lat, lon, r), latLonToVec3(lat + 2, lon, r));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const eq: number[] = [];
    for (let lon = -180; lon < 180; lon += 1) {
      const a = latLonToVec3(0, lon, r);
      const b = latLonToVec3(0, lon + 1, r);
      eq.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const e = new THREE.BufferGeometry();
    e.setAttribute("position", new THREE.Float32BufferAttribute(eq, 3));
    return { grid: g, equator: e };
  }, []);

  return (
    <group renderOrder={RENDER_ORDER.graticule}>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#9db4cc" transparent opacity={0.03} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={equator}>
        <lineBasicMaterial color="#ff8a3d" transparent opacity={0.12} depthWrite={false} />
      </lineSegments>
    </group>
  );
}
