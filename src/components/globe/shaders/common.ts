/** Shared GLSL chunks. All overlay spheres use SphereGeometry UVs (equirectangular, u=0 at lon −180). */

export const NOISE = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
`;

export const GEO = /* glsl */ `
const float PI = 3.141592653589793;
float latFromUv(vec2 uv) { return (uv.y - 0.5) * PI; }
/** Equirectangular UV → web-mercator UV (row 0 = north, as stitched tiles are stored). */
vec2 mercatorUv(vec2 uv) {
  float lat = clamp(latFromUv(uv), -1.4844, 1.4844);
  return vec2(uv.x, 0.5 - log(tan(PI * 0.25 + lat * 0.5)) / (2.0 * PI));
}
float inMercator(vec2 uv) { return step(abs(latFromUv(uv)), 1.4844); }
`;

/** Precipitation colour scale: blue (light) → green (moderate) → yellow (heavy) → red (extreme) → magenta. */
export const PRECIP_RAMP = /* glsl */ `
vec3 precipColor(float dbz) {
  vec3 c = vec3(0.25, 0.55, 1.0);
  c = mix(c, vec3(0.15, 0.85, 0.45), smoothstep(18.0, 26.0, dbz));
  c = mix(c, vec3(1.0, 0.86, 0.15), smoothstep(32.0, 40.0, dbz));
  c = mix(c, vec3(1.0, 0.18, 0.12), smoothstep(45.0, 52.0, dbz));
  c = mix(c, vec3(0.95, 0.3, 0.95), smoothstep(58.0, 64.0, dbz));
  return c;
}
`;

export const TEMP_RAMP = /* glsl */ `
vec3 tempColor(float t) {
  vec3 c = vec3(0.42, 0.2, 0.75);
  c = mix(c, vec3(0.2, 0.35, 0.95), smoothstep(-35.0, -18.0, t));
  c = mix(c, vec3(0.3, 0.8, 0.95), smoothstep(-15.0, 0.0, t));
  c = mix(c, vec3(0.3, 0.85, 0.45), smoothstep(2.0, 12.0, t));
  c = mix(c, vec3(1.0, 0.85, 0.25), smoothstep(14.0, 24.0, t));
  c = mix(c, vec3(1.0, 0.45, 0.15), smoothstep(25.0, 33.0, t));
  c = mix(c, vec3(0.85, 0.08, 0.15), smoothstep(34.0, 44.0, t));
  return c;
}
`;

/**
 * Overlay colours are authored in display (sRGB) space; the pipeline is linear (bloom works in HDR).
 * Convert before writing, then let <colorspace_fragment> encode for the screen.
 */
export const COLOR = /* glsl */ `
vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
`;

/**
 * Toy surface-temperature climatology (°C), shared by the temperature overlay, snow cover and
 * modelled snowfall so they always agree. Latitude vs. subsolar latitude (season), elevation
 * lapse rate, colder continental interiors in winter, plus slow noise.
 * Requires NOISE + GEO.
 */
export const CLIMATE = /* glsl */ `
float climateTemp(vec2 uv, vec3 n, float land, float h, vec3 sunDir, float simHours) {
  float lat = latFromUv(uv);
  float sunLat = asin(clamp(sunDir.y, -1.0, 1.0));
  float dl = abs(lat - sunLat * 0.55);
  float t = 30.0 - 58.0 * pow(dl / 1.5708, 2.0);
  t -= land * h * 40.0;
  float winter = clamp(-sign(lat) * sunLat / 0.41, 0.0, 1.0);
  t -= land * winter * smoothstep(0.85, 1.2, abs(lat)) * 10.0;
  t += (fbm(n * 5.0 + vec3(simHours * 0.01)) - 0.5) * 7.0;
  return t;
}

/** Seasonal snow / sea-ice cover 0..1 with ragged, fractal edges. */
float snowCover(vec2 uv, vec3 n, float land, float h, vec3 sunDir, float simHours) {
  float t = climateTemp(uv, n, land, h, sunDir, simHours);
  float edge = (fbm(n * 38.0) - 0.5) * 5.0;
  float onLand = land * smoothstep(-0.5, -5.0, t + edge);
  float seaIce = (1.0 - land) * smoothstep(-9.0, -15.0, t + edge * 1.5);
  return clamp(max(onLand, seaIce), 0.0, 1.0);
}
`;

/** Simulated precipitation reflectivity (dBZ): ITCZ + storm-track bands advected along the timeline. */
export const SIM_PRECIP = /* glsl */ `
float simPrecipDbz(vec2 uv, vec3 n, float simHours) {
  float lat = latFromUv(uv);
  float band = 0.8 * exp(-pow((lat - 0.08) / 0.22, 2.0)) + 0.9 * exp(-pow((abs(lat) - 0.8) / 0.25, 2.0))
             + 0.5 * exp(-pow((abs(lat) - 1.15) / 0.2, 2.0));
  vec3 p = n * 4.2 + vec3(simHours * 0.035, 0.0, simHours * 0.02);
  float f = fbm(p) * 0.75 + fbm(p * 3.1 + 4.0) * 0.35;
  return (f - 0.62) * 190.0 * band;
}
`;
