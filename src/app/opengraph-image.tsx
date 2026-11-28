import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import og from "./og-view.json";

/**
 * The link preview (Facebook, LinkedIn, X, Slack, iMessage…): 1200×630, rendered once at build time.
 * The StormWatch name, and the real planet with a lightning strike coming down onto it (the same art as the app
 * icon; scripts/render-og-globe.mjs renders it from the app's Earth textures, since crawlers can't run WebGL).
 */
export const alt = "StormWatch: the real Earth from orbit with a lightning strike hitting it. Live radar, clouds, lightning and snow, and a forecast for any place.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

const W = 1200, H = 630;
const BONE = "#ece8e0", MUTE = "#b9c1ca", ACCENT = "#ff7a1a", INK = "#05070a";
/** The planet still (1000 × (1000 + head)), shown 690 px wide and bleeding off the right edge. */
const GLOBE_W = 690;
const GLOBE_H = Math.round((GLOBE_W * (og.size + og.head)) / og.size);
const GX = 560, GY = -28;

const file = (p: string) => readFile(join(process.cwd(), p));
const dataUrl = async (p: string, mime: string) => `data:${mime};base64,${(await file(p)).toString("base64")}`;

export default async function Image() {
  const [globe, icon, serif, serifItalic, sans, sansRegular, mono] = await Promise.all([
    dataUrl("public/og/globe.png", "image/png"),
    dataUrl("public/brand/icon-192.png", "image/png"),
    file("node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff"),
    file("node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff"),
    file("node_modules/geist/dist/fonts/geist-sans/Geist-Light.ttf"),
    file("node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf"),
    file("node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf"),
  ]);
  const chips = ["Lightning", "Radar", "Clouds", "Snow", "7-day forecast"];

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", background: INK, fontFamily: "Geist", color: BONE }}>
        {/* the planet and its strike, bleeding off the right */}
        <img src={globe} width={GLOBE_W} height={GLOBE_H} style={{ position: "absolute", left: GX, top: GY }} alt="" />
        {/* ink behind the text column */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage: "linear-gradient(90deg, #05070a 0%, #05070a 42%, rgba(5,7,10,0.7) 52%, rgba(5,7,10,0) 62%)",
          }}
        />
        {/* bezel */}
        <div style={{ position: "absolute", left: 20, top: 20, right: 20, bottom: 20, display: "flex", border: "1px solid rgba(255,255,255,0.08)" }} />

        <div style={{ position: "absolute", left: 64, top: 60, width: 600, bottom: 54, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <img src={icon} width={64} height={64} style={{ borderRadius: 14 }} alt="" />
            <div style={{ display: "flex", alignItems: "center", marginLeft: 18, fontFamily: "Geist Mono", fontSize: 14, letterSpacing: 2.6, color: "#6ee7a8" }}>
              <div style={{ display: "flex", width: 9, height: 9, borderRadius: 9, background: "#34d399", marginRight: 9 }} />
              LIVE WEATHER FROM ORBIT
            </div>
          </div>

          <div style={{ display: "flex", marginTop: 34, fontFamily: "Instrument Serif", fontSize: 128, lineHeight: 0.95, letterSpacing: -2 }}>
            StormWatch<span style={{ color: ACCENT }}>.</span>
          </div>
          <div style={{ display: "flex", marginTop: 14, fontFamily: "Instrument Serif", fontSize: 42, lineHeight: 1.05, color: BONE }}>
            Every storm, watched&nbsp;<span style={{ fontStyle: "italic", color: ACCENT }}>live</span>&nbsp;from orbit.
          </div>
          <div style={{ display: "flex", marginTop: 22, width: 520, fontSize: 22, lineHeight: 1.4, color: MUTE, fontWeight: 300 }}>
            Live radar, clouds, lightning and snow on a real-time 3D Earth, and the forecast for any place.
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", marginTop: "auto" }}>
            {chips.map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginRight: 8,
                  marginTop: 8,
                  padding: "7px 12px",
                  border: "1px solid rgba(255,122,26,0.55)",
                  background: "rgba(255,122,26,0.08)",
                  fontSize: 15,
                  fontWeight: 400,
                  color: BONE,
                }}
              >
                <div style={{ display: "flex", width: 6, height: 6, borderRadius: 6, background: ACCENT, marginRight: 8 }} />
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 18, fontFamily: "Geist Mono", fontSize: 13, letterSpacing: 2, color: "#8f98a3" }}>
            STORMWATCH.EARTH · XWEATHER · OPEN-METEO · RAINVIEWER
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Instrument Serif", data: serif, style: "normal", weight: 400 },
        { name: "Instrument Serif", data: serifItalic, style: "italic", weight: 400 },
        { name: "Geist", data: sans, style: "normal", weight: 300 },
        { name: "Geist", data: sansRegular, style: "normal", weight: 400 },
        { name: "Geist Mono", data: mono, style: "normal", weight: 400 },
      ],
    },
  );
}
