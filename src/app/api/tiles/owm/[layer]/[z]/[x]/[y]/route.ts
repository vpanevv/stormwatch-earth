import { type NextRequest } from "next/server";
import { OWM_KEY, OWM_TILE_LAYERS, type OwmTileLayer } from "@/lib/server/openweather";

/**
 * GET /api/tiles/owm/:layer/:z/:x/:y — proxies OpenWeather map tiles so the API key stays on the server.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ layer: string; z: string; x: string; y: string }> },
) {
  const { layer, z, x, y } = await params;
  const zi = Number(z), xi = Number(y === undefined ? NaN : x), yi = Number(y.replace(/\.png$/, ""));
  if (
    !OWM_KEY ||
    !OWM_TILE_LAYERS.includes(layer as OwmTileLayer) ||
    !Number.isInteger(zi) || zi < 0 || zi > 6 ||
    !Number.isInteger(xi) || !Number.isInteger(yi) ||
    xi < 0 || yi < 0 || xi >= 2 ** zi || yi >= 2 ** zi
  ) {
    return new Response("Not found", { status: 404 });
  }
  const upstream = await fetch(`https://tile.openweathermap.org/map/${layer}/${zi}/${xi}/${yi}.png?appid=${OWM_KEY}`, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 600 },
  });
  if (!upstream.ok) return new Response("Upstream error", { status: 502 });
  return new Response(upstream.body, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=600" },
  });
}
