import { NextResponse } from "next/server";
import type { RadarIndex } from "@/types/weather";
import { fetchJson } from "@/lib/server/http";

type RVMaps = {
  host: string;
  radar: { past: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] };
};

/** GET /api/radar — RainViewer frame index (≈ last 2 h, 10-minute steps). */
export async function GET() {
  try {
    const d = await fetchJson<RVMaps>("https://api.rainviewer.com/public/weather-maps.json", { revalidate: 60 });
    const body: RadarIndex = {
      host: d.host,
      frames: [...d.radar.past, ...(d.radar.nowcast ?? [])].map((f) => ({ time: f.time * 1000, path: f.path })),
      source: "rainviewer",
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    const body: RadarIndex = { host: "", frames: [], source: "mock" };
    return NextResponse.json(body, { status: 200 });
  }
}
