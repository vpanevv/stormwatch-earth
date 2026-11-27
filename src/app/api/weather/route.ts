import { NextResponse, type NextRequest } from "next/server";
import type { WeatherBundle } from "@/types/weather";
import { fetchOpenMeteo } from "@/lib/server/openmeteo";
import { fetchOpenWeatherCurrent, OWM_KEY } from "@/lib/server/openweather";
import { mockWeather } from "@/lib/mock/weather";
import { deriveWarnings } from "@/lib/warnings";

/**
 * GET /api/weather?lat=..&lon=..
 * Provider chain: OpenWeather (current, if keyed) → Open-Meteo (current + forecast) → mock.
 * Each section reports its own source so the UI can label it honestly.
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "lat/lon out of range" }, { status: 400 });
  }
  const p = { lat, lon };
  const now = Date.now();

  const [om, owm] = await Promise.allSettled([
    fetchOpenMeteo(p),
    OWM_KEY ? fetchOpenWeatherCurrent(p) : Promise.reject(new Error("no key")),
  ]);

  let bundle: WeatherBundle;
  if (om.status === "fulfilled") {
    bundle = {
      location: p,
      timezone: om.value.timezone,
      utcOffsetSeconds: om.value.utcOffsetSeconds,
      current:
        owm.status === "fulfilled"
          ? { ...owm.value, snowDepth: om.value.current.snowDepth, snowfall: Math.max(owm.value.snowfall, om.value.current.snowfall) }
          : om.value.current,
      hourly: om.value.hourly,
      daily: om.value.daily,
      warnings: deriveWarnings(om.value.hourly, now),
      sources: { current: owm.status === "fulfilled" ? "openweather" : "open-meteo", forecast: "open-meteo" },
      fetchedAt: now,
    };
  } else {
    bundle = mockWeather(p, now);
    if (owm.status === "fulfilled") {
      bundle.current = owm.value;
      bundle.sources.current = "openweather";
    }
  }

  // Netlify's CDN drops the query string from its cache key unless told otherwise;
  // without Netlify-Vary every place would get the first place's weather.
  return NextResponse.json(bundle, {
    headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600", "Netlify-Vary": "query=lat|lon" },
  });
}
