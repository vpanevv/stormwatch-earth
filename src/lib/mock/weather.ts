import type { DailyPoint, HourlyPoint, LatLon, WeatherBundle } from "@/types/weather";
import { noise3 } from "@/lib/random";
import { subsolarPoint } from "@/lib/sun";
import { deriveWarnings } from "@/lib/warnings";

const HOUR = 3_600_000;

/**
 * Physically-plausible synthetic weather. Used when every live provider fails
 * (offline dev, rate limits). Deterministic for a given place and hour.
 */
function sample(p: LatLon, t: number) {
  const sun = subsolarPoint(t);
  const latFromSun = Math.abs(p.lat - sun.lat * 0.6);
  const base = 29 - 0.55 * latFromSun - 0.004 * latFromSun * latFromSun;
  const localSolarHour = ((t / HOUR + p.lon / 15) % 24 + 24) % 24;
  const diurnal = 5 * Math.cos(((localSolarHour - 15) / 24) * 2 * Math.PI);
  const h = t / HOUR;
  const n1 = noise3(p.lat * 0.15, p.lon * 0.15, h * 0.05);
  const n2 = noise3(p.lat * 0.4 + 10, p.lon * 0.4, h * 0.12);
  const cloud = Math.max(0, Math.min(100, 50 + 70 * n1 + 20 * n2));
  const wet = Math.max(0, n1 * 0.8 + n2 * 0.6 - 0.25);
  const precipitation = cloud > 60 ? Math.round(wet * 9 * 10) / 10 : 0;
  const cape = Math.max(0, (base - 12) * 90 * (0.5 + n2) * (localSolarHour > 11 && localSolarHour < 20 ? 1.4 : 0.5));
  const temperature = Math.round((base + diurnal + n2 * 3) * 10) / 10;
  const snowing = precipitation > 0 && temperature <= 1;
  // ~10:1 snow-to-liquid ratio: 1 mm of water ≈ 1 cm of snow.
  const snowfall = snowing ? Math.round(precipitation * 10) / 10 : 0;
  const snowDepth = base < -2 ? Math.round(Math.min(150, (-base - 2) * 4 + (n1 + 1) * 10)) : 0;
  const thunder = !snowing && precipitation > 2.5 && cape > 900;
  const wind = 8 + 22 * Math.abs(noise3(p.lat * 0.2 + 5, p.lon * 0.2, h * 0.08)) + (thunder ? 18 : 0);
  const weatherCode = snowing
    ? snowfall > 3
      ? 75
      : snowfall > 1
        ? 73
        : 71
    : thunder
    ? 95
    : precipitation > 5
      ? 65
      : precipitation > 1
        ? 63
        : precipitation > 0
          ? 61
          : cloud > 85
            ? 3
            : cloud > 50
              ? 2
              : cloud > 20
                ? 1
                : 0;
  return {
    temperature,
    snowfall,
    snowDepth,
    cloudCover: Math.round(cloud),
    precipitation,
    precipProbability: Math.round(Math.min(100, wet * 160)),
    windSpeed: Math.round(wind),
    windGust: Math.round(wind * 1.6),
    weatherCode,
    cape: Math.round(cape),
    humidity: Math.round(Math.min(100, 45 + cloud * 0.45 + precipitation * 4)),
    isDay: localSolarHour > 6 && localSolarHour < 18,
  };
}

export function mockWeather(p: LatLon, now = Date.now()): WeatherBundle {
  const hourStart = Math.floor(now / HOUR) * HOUR;
  const hourly: HourlyPoint[] = [];
  for (let i = -24; i <= 48; i++) {
    const t = hourStart + i * HOUR;
    const s = sample(p, t);
    hourly.push({
      time: t,
      temperature: s.temperature,
      precipitation: s.precipitation,
      snowfall: s.snowfall,
      snowDepth: s.snowDepth,
      precipProbability: s.precipProbability,
      cloudCover: s.cloudCover,
      windSpeed: s.windSpeed,
      windGust: s.windGust,
      weatherCode: s.weatherCode,
      cape: s.cape,
    });
  }
  const offset = Math.round(p.lon / 15) * 3600;
  const dayStart = Math.floor((now + offset * 1000) / (24 * HOUR)) * 24 * HOUR - offset * 1000;
  const daily: DailyPoint[] = [];
  for (let d = 0; d < 7; d++) {
    const hours = Array.from({ length: 24 }, (_, i) => sample(p, dayStart + d * 24 * HOUR + i * HOUR));
    daily.push({
      time: dayStart + d * 24 * HOUR,
      tMax: Math.max(...hours.map((x) => x.temperature)),
      tMin: Math.min(...hours.map((x) => x.temperature)),
      precipSum: Math.round(hours.reduce((s, x) => s + x.precipitation, 0) * 10) / 10,
      snowfallSum: Math.round(hours.reduce((s, x) => s + x.snowfall, 0) * 10) / 10,
      precipProbMax: Math.max(...hours.map((x) => x.precipProbability)),
      windMax: Math.max(...hours.map((x) => x.windSpeed)),
      weatherCode: hours.reduce((m, x) => Math.max(m, x.weatherCode), 0),
    });
  }
  const c = sample(p, now);
  return {
    location: p,
    timezone: "UTC" + (offset >= 0 ? "+" : "") + offset / 3600,
    utcOffsetSeconds: offset,
    current: {
      time: now,
      temperature: c.temperature,
      feelsLike: Math.round((c.temperature - c.windSpeed * 0.05) * 10) / 10,
      humidity: c.humidity,
      cloudCover: c.cloudCover,
      windSpeed: c.windSpeed,
      windGust: c.windGust,
      windDirection: Math.round(((noise3(p.lat, p.lon, now / HOUR / 20) + 1) * 180) % 360),
      pressure: Math.round(1013 + noise3(p.lat * 0.1, p.lon * 0.1, now / HOUR / 30) * 18),
      precipitation: c.precipitation,
      snowfall: c.snowfall,
      snowDepth: c.snowDepth,
      weatherCode: c.weatherCode,
      isDay: c.isDay,
    },
    hourly,
    daily,
    warnings: deriveWarnings(hourly, now),
    sources: { current: "mock", forecast: "mock" },
    fetchedAt: now,
  };
}
