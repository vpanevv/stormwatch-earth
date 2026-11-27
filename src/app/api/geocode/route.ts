import { NextResponse, type NextRequest } from "next/server";
import { searchPlaces, suggestPlaces } from "@/lib/server/geocoding";

/** GET /api/geocode?q=..&mode=suggest|search */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const mode = req.nextUrl.searchParams.get("mode") === "search" ? "search" : "suggest";
  if (q.length < 2) return NextResponse.json({ places: [], source: "mock" });
  const result = mode === "search" ? await searchPlaces(q) : await suggestPlaces(q);
  return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=3600", "Netlify-Vary": "query=q|mode" } });
}
