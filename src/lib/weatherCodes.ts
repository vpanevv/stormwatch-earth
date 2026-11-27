/** WMO weather interpretation codes (as used by Open-Meteo). OpenWeather ids are mapped onto these. */
const WMO: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Heavy showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm, hail",
  99: "Severe thunderstorm, hail",
};

export function describeCode(code: number) {
  return WMO[code] ?? "—";
}

export function isThunderCode(code: number) {
  return code >= 95;
}

export function isPrecipCode(code: number) {
  return code >= 51;
}

/** WMO snow codes: 71–77 (snowfall, snow grains) and 85–86 (snow showers). 80–82 are rain showers. */
export function isSnowCode(code: number) {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

/** WMO liquid-precipitation codes: drizzle and rain (51–67), rain showers (80–82), thunderstorms (95–99). */
export function isRainCode(code: number) {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

/**
 * How hard an hour rains, 0..1 (0 = dry). Driven by the rain chance the forecast shows,
 * nudged up by the expected amount so a sure drizzle stays lighter than a sure downpour.
 */
export function rainStrength(h: { weatherCode: number; precipitation: number; precipProbability: number; snowfall: number }) {
  if (isSnowCode(h.weatherCode)) return 0;
  const rainy = isRainCode(h.weatherCode) || h.precipitation - h.snowfall >= 0.1;
  if (!rainy) return 0;
  const chance = Math.max(h.precipProbability, isRainCode(h.weatherCode) ? 30 : 0) / 100;
  return Math.min(1, Math.max(0.12, chance * 0.8 + Math.min(0.35, h.precipitation / 8)));
}

/** Single-glyph icon. Kept as text so the UI stays thin and typographic. */
export function codeGlyph(code: number, isDay = true) {
  if (code === 0) return isDay ? "☀" : "☾";
  if (code <= 2) return isDay ? "⛅" : "☁";
  if (code === 3) return "☁";
  if (code <= 48) return "≋";
  if (code <= 67 || (code >= 80 && code <= 82)) return "☂";
  if (code <= 86) return "❄";
  return "⚡";
}

/** OpenWeather condition id → WMO code */
export function owmToWmo(id: number): number {
  if (id >= 200 && id < 300) return id >= 210 && id <= 221 ? 95 : id === 202 || id === 232 ? 99 : 95;
  if (id >= 300 && id < 400) return id <= 301 ? 51 : 53;
  if (id === 500) return 61;
  if (id === 501) return 63;
  if (id >= 502 && id <= 504) return 65;
  if (id === 511) return 66;
  if (id >= 520 && id < 600) return id === 520 ? 80 : 81;
  if (id === 600) return 71;
  if (id === 601) return 73;
  if (id >= 602 && id < 700) return 75;
  if (id >= 700 && id < 800) return 45;
  if (id === 800) return 0;
  if (id === 801) return 1;
  if (id === 802) return 2;
  return 3;
}
