import "server-only";
import type { CurrentWeather, LatLon } from "@/types/weather";
import { owmToWmo } from "@/lib/weatherCodes";
import { fetchJson } from "./http";

export const OWM_KEY = process.env.OPENWEATHER_API_KEY?.trim() || "";

type OWMCurrent = {
  dt: number;
  weather: { id: number }[];
  main: { temp: number; feels_like: number; humidity: number; pressure: number };
  wind: { speed: number; deg: number; gust?: number };
  clouds: { all: number };
  rain?: { "1h"?: number };
  snow?: { "1h"?: number };
  sys: { sunrise: number; sunset: number };
};

/** OpenWeather "Current weather" (free tier). Speeds come back in m/s → converted to km/h. */
export async function fetchOpenWeatherCurrent(p: LatLon): Promise<CurrentWeather> {
  if (!OWM_KEY) throw new Error("OPENWEATHER_API_KEY not set");
  const q = new URLSearchParams({ lat: String(p.lat), lon: String(p.lon), units: "metric", appid: OWM_KEY });
  const d = await fetchJson<OWMCurrent>(`https://api.openweathermap.org/data/2.5/weather?${q}`, { revalidate: 300 });
  const now = d.dt * 1000;
  return {
    time: now,
    temperature: d.main.temp,
    feelsLike: d.main.feels_like,
    humidity: d.main.humidity,
    cloudCover: d.clouds.all,
    windSpeed: d.wind.speed * 3.6,
    windGust: (d.wind.gust ?? d.wind.speed) * 3.6,
    windDirection: d.wind.deg,
    pressure: d.main.pressure,
    precipitation: (d.rain?.["1h"] ?? 0) + (d.snow?.["1h"] ?? 0),
    // OpenWeather reports snow as mm water equivalent; ~1 mm ≈ 1 cm of fresh snow.
    snowfall: d.snow?.["1h"] ?? 0,
    snowDepth: 0,
    weatherCode: owmToWmo(d.weather[0]?.id ?? 800),
    isDay: d.dt > d.sys.sunrise && d.dt < d.sys.sunset,
  };
}

export const OWM_TILE_LAYERS = ["clouds_new", "precipitation_new", "temp_new", "wind_new"] as const;
export type OwmTileLayer = (typeof OWM_TILE_LAYERS)[number];
