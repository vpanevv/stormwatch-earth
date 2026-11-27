"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useAppStore } from "@/store/useAppStore";
import { CLIMATE, COLOR, GEO, NOISE } from "./shaders/common";
import { RENDER_ORDER, shared } from "./uniforms";

/**
 * Earth maps. Day / night / clouds are Solar System Scope's 8k set (CC BY 4.0, NASA Blue Marble / Black Marble based),
 * resized and re-encoded by the Watched project (MIT); `data` packs R = relief, G = ocean mask (1 = water).
 * `topo` is the calibrated elevation used by the climate model (snow, temperature).
 */
export const TEXTURES = {
  day: "/textures/earth-day-4k.webp",
  day8k: "/textures/earth-day-8k.webp",
  night: "/textures/earth-night-4k.webp",
  clouds: "/textures/earth-clouds-4k.webp",
  data: "/textures/earth-data-4k.webp",
  topo: "/textures/earth-topology.jpg",
  /** Kept for overlays that read the ocean mask: same file as `data`, ocean in G. */
  water: "/textures/earth-data-4k.webp",
};

/** HD regional patch around the selected place: NASA GIBS Blue Marble Next Generation (~0.5 km/px). */
const CTX_HALF_KM = 360;
const TONE_KM = 60;

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

/**
 * Photoreal but graded:
 *  - day map desaturated ~12%, cool-neutral, oceans pulled toward deep navy; a touch of linear contrast
 *  - HD context patch: detail from a sharp regional basemap, low-frequency tone from the global map (no visible square)
 *  - relief as a bounded hill-shade (slopes brighten/darken, never go black)
 *  - reddened low sun, cloud shadows displaced toward the sun by cloud height / N·L
 *  - ocean glint: tight core + broad sheen, Schlick Fresnel, killed by cloud and low sun
 *  - seasonal snow / sea-ice cover (shared climate model)
 *  - night never a void: cool floor + earthshine, sodium city lights with warmer cores
 *  - day-side haze toward the limb
 */
const fragment = /* glsl */ `
${NOISE}
${GEO}
${COLOR}
${CLIMATE}
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform sampler2D uData;
uniform sampler2D uTopo;
uniform vec2 uDataTexel;
uniform vec3 uSunDir;
uniform float uCloudShift;
uniform float uCloudShadow;
uniform float uOrbitFade;
uniform float uSnow;
uniform float uTime;
uniform float uSimHours;
uniform sampler2D uCtxMap;
uniform vec4 uCtxUv;     // centre u, centre v, width u, height v
uniform float uCtxOn;
uniform float uCtxLod;
uniform float uDayLod;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vPos;

float sat01(float x) { return clamp(x, 0.0, 1.0); }
float gauss(float x) { return exp(-x * x); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 gradeDay(vec3 c, float ocean) {
  float l = luma(c);
  c = mix(vec3(l), c, 0.88) * vec3(0.96, 0.99, 1.03);
  vec3 sea = mix(vec3(l), c, 0.55) * vec3(0.42, 0.52, 0.68);
  return mix(c, sea, ocean);
}

vec2 patchCoord(vec2 uv, vec4 b) {
  float dx = uv.x - b.x;
  dx -= floor(dx + 0.5);
  return vec2(0.5 + dx / b.z, 0.5 + (uv.y - b.y) / b.w);
}
float patchMask(vec2 p, float f) {
  vec2 a = smoothstep(vec2(0.0), vec2(f), p) * smoothstep(vec2(0.0), vec2(f), 1.0 - p);
  return a.x * a.y;
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vPos);
  vec3 L = normalize(uSunDir);
  float NdL = dot(N, L);
  // East points toward increasing u (longitude) on three's sphere; north = N × E.
  vec3 E = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-6));
  vec3 Nn = cross(N, E);
  float cosLat = max(length(N.xz), 0.04);

  vec4 data = texture2D(uData, vUv);
  float ocean = smoothstep(0.35, 0.65, data.g);
  float land = 1.0 - ocean;
  float h = texture2D(uTopo, vUv).r;

  // ── relief: central differences → slope per radian → bounded hill-shade
  vec2 du = vec2(uDataTexel.x * 1.5, 0.0);
  vec2 dv = vec2(0.0, uDataTexel.y * 1.5);
  vec2 slope = vec2(
    (texture2D(uData, vUv + du).r - texture2D(uData, vUv - du).r) / (2.0 * du.x * 2.0 * PI * cosLat),
    (texture2D(uData, vUv + dv).r - texture2D(uData, vUv - dv).r) / (2.0 * dv.y * PI)
  );
  float reliefMask = land * smoothstep(0.02, 0.12, cosLat);
  vec3 Nb = normalize(N - 0.01 * reliefMask * (slope.x * E + slope.y * Nn));
  float relief = clamp(1.0 + (dot(Nb, L) - NdL) * 2.2, 0.62, 1.32);

  // ── clouds: here (dims lights, glint) and toward the sun (shadow)
  vec2 cloudUv = vec2(vUv.x - uCloudShift, vUv.y);
  float cloudVis = uCloudShadow * mix(0.12, 1.0, uOrbitFade);
  float cloudHere = smoothstep(0.16, 0.78, texture2D(uClouds, cloudUv).r) * cloudVis;
  vec2 sunT = vec2(dot(L, E), dot(L, Nn));
  vec2 shift = sunT * (0.006 / max(NdL, 0.12)) * vec2(1.0 / (2.0 * PI * cosLat), 1.0 / PI);
  float cloudShadowAmt = smoothstep(0.16, 0.78, texture2D(uClouds, cloudUv + shift).r) * cloudVis;

  // ── day albedo, sharpened by the regional HD patch
  vec3 dayTex = texture2D(uDay, vUv).rgb;
  if (uCtxOn > 0.001) {
    vec2 p = patchCoord(vUv, uCtxUv);
    vec3 c = textureGrad(uCtxMap, p, dFdx(p), dFdy(p)).rgb;
    vec3 cLow = textureLod(uCtxMap, p, uCtxLod).rgb;
    vec3 dLow = textureLod(uDay, vUv, uDayLod).rgb;
    // Keep the global map's tone, take the patch's detail. Its sea is near-black, so leave water to the global map.
    float w = patchMask(p, 0.16) * uCtxOn * smoothstep(0.0, 0.01, luma(c)) * land;
    dayTex = mix(dayTex, max(dLow + (c - cLow), vec3(0.0)), w);
  }
  vec3 albedo = pow(gradeDay(dayTex, ocean), vec3(1.12)) * 1.06;

  float snow = uSnow * snowCover(vUv, N, land, h, uSunDir, uSimHours);
  albedo = mix(albedo, vec3(0.8, 0.84, 0.9), snow * 0.9);

  float dayMix = smoothstep(-0.05, 0.09, NdL);
  float lambert = sat01((NdL + 0.04) / 1.04);
  vec3 day = albedo * 1.55 * lambert * mix(1.0, relief, smoothstep(0.0, 0.08, NdL));
  float lowSun = gauss((NdL - 0.03) / 0.11);
  day *= mix(vec3(1.0), vec3(1.0, 0.74, 0.55), lowSun * 0.5);
  day *= 1.0 - 0.38 * cloudShadowAmt * smoothstep(0.0, 0.2, NdL);

  // ── ocean glint
  vec3 H = normalize(L + V);
  vec3 wave = vec3(vnoise(N * 900.0 + uTime * 0.25), vnoise(N * 900.0 + 13.1), vnoise(N * 900.0 + 27.3)) - 0.5;
  float NdH = max(dot(normalize(N + wave * 0.02), H), 0.0);
  float VdH = max(dot(V, H), 0.0);
  float fres = 0.02 + 0.98 * pow(sat01(1.0 - VdH), 5.0);
  float spec = pow(NdH, 260.0) * 0.4 + pow(max(dot(N, H), 0.0), 70.0) * 0.025;
  spec *= (0.35 + fres) * ocean * (1.0 - snow) * (1.0 - 0.9 * cloudHere) * smoothstep(0.0, 0.25, NdL);
  day += vec3(1.0, 0.97, 0.92) * spec * 1.8;
  day += snow * pow(max(dot(Nb, H), 0.0), 40.0) * 0.25 * lambert;

  // ── day-side haze toward the limb
  float NdV = max(dot(N, V), 0.0);
  float limb = pow(sat01(1.0 - NdV), 3.2);
  vec3 hazeColor = vec3(0.55, 0.72, 1.0);
  day = mix(day, hazeColor * 0.76 * smoothstep(0.02, 0.45, NdL), limb * 0.7 * smoothstep(-0.02, 0.2, NdL));

  // ── night
  vec3 nightTex = texture2D(uNight, vUv).rgb;
  float nl = luma(nightTex);
  float earthshine = luma(dayTex) * 0.012;
  vec3 nightTint = vec3(0.45, 0.55, 0.8);
  vec3 nightBase = vec3(0.0046, 0.0057, 0.0070) * mix(1.3, 1.0, ocean) + nightTint * earthshine + vec3(nl) * nightTint * 0.25;
  float lights = pow(smoothstep(0.014, 0.55, nl), 1.45);
  float lightsOn = 1.0 - smoothstep(-0.14, 0.03, NdL);
  vec3 cityTint = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.8, 0.58), lights * lights * lights * 0.8);
  vec3 night = nightBase + cityTint * lights * (1.0 - 0.45 * cloudHere) * 1.9 * lightsOn;

  vec3 col = mix(night, day, dayMix);
  col += vec3(1.0, 0.5, 0.25) * gauss((NdL + 0.035) / 0.05) * 0.004;

  // Tone-map here (linear in, linear out); sRGB encoding happens once at output.
  gl_FragColor = vec4(acesFilm(col * 0.95), 1.0);
  #include <colorspace_fragment>
}
`;

function gibsContextUrl(lat: number, lon: number, px: number) {
  const dLat = (2 * CTX_HALF_KM) / 110.57;
  const dLon = (2 * CTX_HALF_KM) / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const bbox = [lat - dLat / 2, lon - dLon / 2, lat + dLat / 2, lon + dLon / 2].map((v) => v.toFixed(4)).join(",");
  const q = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: "BlueMarble_NextGeneration",
    STYLES: "",
    FORMAT: "image/jpeg",
    CRS: "EPSG:4326",
    BBOX: bbox,
    WIDTH: String(px),
    HEIGHT: String(px),
    TIME: "2004-08-01",
  });
  return { url: `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${q}`, dLat, dLon };
}

export function Earth({ cloudShadow, snow }: { cloudShadow: number; snow: boolean }) {
  const gl = useThree((s) => s.gl);
  const [day, night, clouds, data, topo] = useTexture([
    TEXTURES.day,
    TEXTURES.night,
    TEXTURES.clouds,
    TEXTURES.data,
    TEXTURES.topo,
  ]);
  const selection = useAppStore((s) => s.selection);
  const entered = useAppStore((s) => s.entered);
  const ctxTarget = useRef(0);

  const material = useMemo(() => {
    const aniso = Math.min(16, gl.capabilities.getMaxAnisotropy());
    for (const t of [day, night]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
    }
    for (const t of [clouds, data, topo]) t.anisotropy = aniso;
    clouds.wrapS = THREE.RepeatWrapping;
    clouds.needsUpdate = true;
    const empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    empty.needsUpdate = true;
    return new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uDay: { value: day },
        uNight: { value: night },
        uClouds: { value: clouds },
        uData: { value: data },
        uTopo: { value: topo },
        uDataTexel: { value: new THREE.Vector2(1 / 4096, 1 / 2048) },
        uSunDir: shared.uSunDir,
        uCloudShift: shared.uCloudShift,
        uCloudShadow: { value: cloudShadow },
        uSnow: { value: snow ? 1 : 0 },
        uTime: shared.uTime,
        uSimHours: shared.uSimHours,
        uOrbitFade: shared.uOrbitFade,
        uCtxMap: { value: empty },
        uCtxUv: { value: new THREE.Vector4(0.5, 0.5, 0.01, 0.01) },
        uCtxOn: { value: 0 },
        uCtxLod: { value: 7 },
        uDayLod: { value: Math.log2(TONE_KM / (40075 / 4096)) },
      },
      toneMapped: false,
    });
  }, [day, night, clouds, data, topo, gl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progressive HD: swap in the 8k day map once the visitor is in and the GPU can hold it.
  useEffect(() => {
    if (!entered || gl.capabilities.maxTextureSize < 8192 || window.innerWidth < 1024) return;
    let alive = true;
    const id = window.setTimeout(() => {
      new THREE.TextureLoader().load(TEXTURES.day8k, (t) => {
        if (!alive) return t.dispose();
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
        material.uniforms.uDay.value = t;
        material.uniforms.uDayLod.value = Math.log2(TONE_KM / (40075 / 8192));
      });
    }, 1200);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [entered, gl, material]);

  // HD regional patch around the selected place.
  useEffect(() => {
    ctxTarget.current = 0;
    if (!selection || !entered) return;
    let alive = true;
    const px = window.innerWidth < 768 ? 1024 : 1536;
    const { url, dLat, dLon } = gibsContextUrl(selection.lat, selection.lon, px);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (t) => {
        if (!alive) return t.dispose();
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
        const u = material.uniforms;
        (u.uCtxMap.value as THREE.Texture).dispose();
        u.uCtxMap.value = t;
        u.uCtxUv.value.set((selection.lon + 180) / 360, (selection.lat + 90) / 180, dLon / 360, dLat / 180);
        u.uCtxLod.value = Math.max(0, Math.log2(TONE_KM / ((2 * CTX_HALF_KM) / px)));
        ctxTarget.current = 1;
      },
      undefined,
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [selection, entered, gl, material]);

  useFrame((_, dt) => {
    const u = material.uniforms;
    const k = Math.min(1, dt * 2.5);
    u.uCloudShadow.value += (cloudShadow - u.uCloudShadow.value) * k;
    u.uSnow.value += ((snow ? 1 : 0) - u.uSnow.value) * k;
    // Fade out fast before a swap, fade in slowly once the new patch is bound.
    const target = ctxTarget.current;
    u.uCtxOn.value += (target - u.uCtxOn.value) * Math.min(1, dt * (target ? 1.2 : 6));
  });

  // Mounting means Suspense resolved: every texture is loaded.
  const setGlobeReady = useAppStore((s) => s.setGlobeReady);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGlobeReady());
    return () => cancelAnimationFrame(id);
  }, [setGlobeReady]);

  return (
    <mesh material={material} renderOrder={RENDER_ORDER.earth}>
      <sphereGeometry args={[1, 256, 128]} />
    </mesh>
  );
}
