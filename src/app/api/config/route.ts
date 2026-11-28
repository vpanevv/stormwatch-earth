import { NextResponse } from "next/server";
import type { AppConfig } from "@/types/weather";
import { OWM_KEY } from "@/lib/server/openweather";
import { XWEATHER_ON } from "@/lib/server/xweather";

/** Tells the client which optional providers are enabled, without exposing keys. */
export async function GET() {
  const body: AppConfig = { openweather: Boolean(OWM_KEY), lightningSource: "mock", liveLightning: XWEATHER_ON };
  return NextResponse.json(body);
}
