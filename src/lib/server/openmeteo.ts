import "server-only";
import type { CurrentWeather, DailyPoint, HourlyPoint, LatLon } from "@/types/weather";
import { fetchJson } from "./http";

type OMResponse = {
  timezone: string;
  utc_offset_seconds: number;
  current: {
    time: number;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    pressure_msl: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    snowfall: number;
    snow_depth: number | null;
  };
  hourly: {
    time: number[];
    temperature_2m: number[];
    precipitation_probability: (number | null)[];
    precipitation: number[];
    weather_code: number[];
    cloud_cover: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    cape: (number | null)[];
    snowfall: (number | null)[];
    snow_depth: (number | null)[];
  };
  daily: {
    time: number[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
    wind_speed_10m_max: number[];
    snowfall_sum: (number | null)[];
    sunrise?: (number | null)[];
    sunset?: (number | null)[];
  };
};

/** Open-Meteo: keyless, global, hourly + 7-day. Free tier is for non-commercial use. */
export async function fetchOpenMeteo(p: LatLon) {
  const q = new URLSearchParams({
    latitude: p.lat.toFixed(4),
    longitude: p.lon.toFixed(4),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,snowfall,snow_depth",
    hourly:
      "temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,cape,snowfall,snow_depth",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,snowfall_sum,sunrise,sunset",
    past_days: "1",
    forecast_days: "7",
    timezone: "auto",
    timeformat: "unixtime",
  });
  const d = await fetchJson<OMResponse>(`https://api.open-meteo.com/v1/forecast?${q}`, { revalidate: 600 });

  const now = Date.now();
  const hourly: HourlyPoint[] = d.hourly.time
    .map((t, i) => ({
      time: t * 1000,
      temperature: d.hourly.temperature_2m[i],
      precipitation: d.hourly.precipitation[i] ?? 0,
      snowfall: d.hourly.snowfall[i] ?? 0,
      snowDepth: (d.hourly.snow_depth[i] ?? 0) * 100,
      precipProbability: d.hourly.precipitation_probability[i] ?? 0,
      cloudCover: d.hourly.cloud_cover[i] ?? 0,
      windSpeed: d.hourly.wind_speed_10m[i] ?? 0,
      windGust: d.hourly.wind_gusts_10m[i] ?? 0,
      weatherCode: d.hourly.weather_code[i] ?? 0,
      cape: d.hourly.cape[i] ?? 0,
    }))
    .filter((h) => h.time >= now - 25 * 3_600_000 && h.time <= now + 49 * 3_600_000);

  const daily: DailyPoint[] = d.daily.time.map((t, i) => ({
    time: t * 1000,
    tMax: d.daily.temperature_2m_max[i],
    tMin: d.daily.temperature_2m_min[i],
    precipSum: d.daily.precipitation_sum[i] ?? 0,
    snowfallSum: d.daily.snowfall_sum[i] ?? 0,
    precipProbMax: d.daily.precipitation_probability_max[i] ?? 0,
    windMax: d.daily.wind_speed_10m_max[i] ?? 0,
    // Open-Meteo returns 0 (1970) or nothing when the sun doesn't rise or set that day.
    sunrise: d.daily.sunrise?.[i] ? d.daily.sunrise[i]! * 1000 : undefined,
    sunset: d.daily.sunset?.[i] ? d.daily.sunset[i]! * 1000 : undefined,
    weatherCode: d.daily.weather_code[i] ?? 0,
  }));
  // past_days=1 prepends yesterday; the forecast view wants today onward.
  const todayIdx = daily.findIndex((x) => x.time + 86_400_000 > now);

  const c = d.current;
  const current: CurrentWeather = {
    time: c.time * 1000,
    temperature: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    cloudCover: c.cloud_cover,
    windSpeed: c.wind_speed_10m,
    windGust: c.wind_gusts_10m,
    windDirection: c.wind_direction_10m,
    pressure: c.pressure_msl,
    precipitation: c.precipitation,
    snowfall: c.snowfall ?? 0,
    snowDepth: (c.snow_depth ?? 0) * 100,
    weatherCode: c.weather_code,
    isDay: c.is_day === 1,
  };

  return {
    timezone: d.timezone,
    utcOffsetSeconds: d.utc_offset_seconds,
    current,
    hourly,
    daily: daily.slice(Math.max(0, todayIdx), Math.max(0, todayIdx) + 7),
  };
}
