import * as THREE from "three";
import { stitchTiles } from "./tileClient";

const cache = new Map<string, { at: number; tex: Promise<THREE.DataTexture | null> }>();

/** Global OpenWeather overlay (clouds_new, temp_new…) stitched from the server-side tile proxy. */
export function loadOwmLayer(layer: "clouds_new" | "temp_new" | "precipitation_new" | "wind_new") {
  const hit = cache.get(layer);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.tex;
  const tex = stitchTiles({ kind: "rgba", template: `/api/tiles/owm/${layer}/{z}/{x}/{y}`, z: 2, tileSize: 256 }).then(
    (res) => {
      if (!res.ok) return null;
      const t = new THREE.DataTexture(res.data, res.width, res.height, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.wrapS = THREE.RepeatWrapping;
      t.needsUpdate = true;
      return t;
    },
  );
  cache.set(layer, { at: Date.now(), tex });
  return tex;
}
