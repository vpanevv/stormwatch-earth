import type { HourlyPoint, WeatherWarning } from "@/types/weather";

/**
 * Derives watch/warning style alerts from forecast thresholds.
 * These are NOT official bulletins — the UI labels them as "derived".
 */
export function deriveWarnings(hourly: HourlyPoint[], now = Date.now()): WeatherWarning[] {
  const next = hourly.filter((h) => h.time >= now - 3_600_000 && h.time <= now + 24 * 3_600_000);
  if (!next.length) return [];
  const out: WeatherWarning[] = [];

  const span = (pred: (h: HourlyPoint) => boolean) => {
    const hits = next.filter(pred);
    return hits.length ? { from: hits[0].time, to: hits[hits.length - 1].time + 3_600_000, hits } : null;
  };

  const gust = span((h) => h.windGust >= 60);
  if (gust) {
    const max = Math.max(...gust.hits.map((h) => h.windGust));
    out.push({
      id: "wind",
      level: max >= 90 ? "warning" : "advisory",
      title: max >= 90 ? "Damaging wind gusts" : "Strong wind gusts",
      detail: `Gusts up to ${Math.round(max)} km/h`,
      from: gust.from,
      to: gust.to,
      origin: "derived",
    });
  }

  const rain = span((h) => h.precipitation >= 4);
  if (rain) {
    const max = Math.max(...rain.hits.map((h) => h.precipitation));
    const total = rain.hits.reduce((s, h) => s + h.precipitation, 0);
    out.push({
      id: "rain",
      level: max >= 10 || total >= 40 ? "warning" : "advisory",
      title: max >= 10 ? "Intense rainfall" : "Heavy rain",
      detail: `Up to ${max.toFixed(1)} mm/h · ${Math.round(total)} mm total`,
      from: rain.from,
      to: rain.to,
      origin: "derived",
    });
  }

  const thunder = span((h) => h.weatherCode >= 95 || (h.cape >= 1200 && h.precipProbability >= 40));
  if (thunder) {
    const severe = thunder.hits.some((h) => h.weatherCode >= 96 || h.cape >= 2500);
    out.push({
      id: "thunder",
      level: severe ? "warning" : "watch",
      title: severe ? "Severe thunderstorm risk" : "Thunderstorm watch",
      detail: `CAPE up to ${Math.round(Math.max(...thunder.hits.map((h) => h.cape)))} J/kg`,
      from: thunder.from,
      to: thunder.to,
      origin: "derived",
    });
  }

  const heat = span((h) => h.temperature >= 35);
  if (heat) {
    out.push({
      id: "heat",
      level: Math.max(...heat.hits.map((h) => h.temperature)) >= 40 ? "warning" : "advisory",
      title: "Extreme heat",
      detail: `Highs near ${Math.round(Math.max(...heat.hits.map((h) => h.temperature)))}°C`,
      from: heat.from,
      to: heat.to,
      origin: "derived",
    });
  }

  const cold = span((h) => h.temperature <= -15);
  if (cold) {
    out.push({
      id: "cold",
      level: "advisory",
      title: "Severe cold",
      detail: `Lows near ${Math.round(Math.min(...cold.hits.map((h) => h.temperature)))}°C`,
      from: cold.from,
      to: cold.to,
      origin: "derived",
    });
  }

  const snow = span((h) => h.snowfall >= 1 || (h.weatherCode >= 71 && h.weatherCode <= 86 && h.precipitation >= 1.5));
  if (snow) {
    const total = snow.hits.reduce((s, h) => s + h.snowfall, 0);
    const max = Math.max(...snow.hits.map((h) => h.snowfall));
    out.push({
      id: "snow",
      level: total >= 15 || max >= 3 ? "warning" : total >= 5 ? "watch" : "advisory",
      title: total >= 15 ? "Heavy snowfall" : "Snowfall",
      detail: `${total.toFixed(1)} cm expected · up to ${max.toFixed(1)} cm/h`,
      from: snow.from,
      to: snow.to,
      origin: "derived",
    });
  }

  return out;
}
