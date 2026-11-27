import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import og from "./og-view.json";

/**
 * The link preview (Facebook, LinkedIn, X, Slack, iMessage…): 1200×630, rendered once at build time.
 * The planet is a still from scripts/render-og-globe.mjs (crawlers can't run WebGL); the radar-lock reticle is placed
 * on it with the same orthographic projection, over Sofia.
 */
export const alt = "StormWatch Earth: live radar, clouds, lightning and snow on a real-time 3D globe, with a forecast for any place.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

const W = 1200, H = 630;
const BONE = "#ece8e0", MUTE = "#8c96a3", FAINT = "#5b6470", ACCENT = "#ff7a1a", INK = "#05070a";
const GLOBE = 880; // displayed size of the globe still
const GX = 548, GY = -24; // its top-left: the planet bleeds off the right edge
const LOCK = { name: "Sofia", lat: 42.6977, lon: 23.3219 };

/** Where (lat, lon) falls on the globe still, in card pixels (orthographic, as the renderer drew it). */
function project(lat: number, lon: number) {
  const r = Math.PI / 180;
  const φ = lat * r, λ = lon * r, φ0 = og.view.lat * r, λ0 = og.view.lon * r;
  const x = Math.cos(φ) * Math.sin(λ - λ0);
  const y = Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ - λ0);
  const k = GLOBE / og.size;
  return { x: GX + (og.size / 2 + x * og.radius) * k, y: GY + (og.size / 2 - y * og.radius) * k };
}

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
  const lock = project(LOCK.lat, LOCK.lon);
  const layers: [string, boolean][] = [
    ["Clouds", true],
    ["Rain", true],
    ["Snow", true],
    ["Lightning", true],
    ["Storms", false],
    ["Temp", false],
    ["Wind", false],
  ];

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", background: INK, fontFamily: "Geist", color: BONE }}>
        {/* the planet, bleeding off the right */}
        <img src={globe} width={GLOBE} height={GLOBE} style={{ position: "absolute", left: GX, top: GY }} alt="" />
        {/* ink behind the text column */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage: "linear-gradient(90deg, #05070a 0%, #05070a 40%, rgba(5,7,10,0.82) 52%, rgba(5,7,10,0) 66%)",
          }}
        />

        {/* radar lock over Sofia */}
        <div style={{ position: "absolute", left: lock.x - 46, top: lock.y - 46, width: 92, height: 92, display: "flex" }}>
          <div
            style={{
              position: "absolute",
              left: 26,
              top: 26,
              width: 40,
              height: 40,
              borderRadius: 40,
              display: "flex",
              backgroundImage: "radial-gradient(circle, rgba(255,140,50,0.95) 0%, rgba(255,122,26,0.5) 22%, rgba(255,122,26,0) 70%)",
            }}
          />
          <svg width="92" height="92" viewBox="0 0 92 92" style={{ position: "absolute", left: 0, top: 0 }}>
            <circle cx="46" cy="46" r="22" fill="none" stroke={ACCENT} strokeWidth="2" strokeDasharray="28 6.5" />
            <circle cx="46" cy="46" r="34" fill="none" stroke={ACCENT} strokeOpacity="0.35" strokeWidth="1.2" />
            <circle cx="46" cy="46" r="5" fill="none" stroke={ACCENT} strokeWidth="1.5" />
            <path d="M46 4v12M46 76v12M4 46h12M76 46h12" stroke={ACCENT} strokeWidth="1.6" />
          </svg>
        </div>
        <div
          style={{
            position: "absolute",
            right: W - lock.x + 54,
            top: lock.y - 34,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            padding: "10px 14px",
            background: "rgba(8,10,14,0.82)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRight: `2px solid ${ACCENT}`,
          }}
        >
          <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 12, letterSpacing: 2.6, color: ACCENT }}>LOCATION LOCK</div>
          <div style={{ display: "flex", marginTop: 4, fontSize: 22, letterSpacing: 3, color: BONE }}>{LOCK.name.toUpperCase()}</div>
          <div style={{ display: "flex", marginTop: 2, fontFamily: "Geist Mono", fontSize: 13, color: MUTE }}>
            42.70°N · 23.32°E · 48H · 7D
          </div>
        </div>

        {/* bezel */}
        <div style={{ position: "absolute", left: 20, top: 20, right: 20, bottom: 20, display: "flex", border: "1px solid rgba(255,255,255,0.07)" }} />

        {/* text column */}
        <div style={{ position: "absolute", left: 64, top: 56, width: 560, bottom: 52, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <img src={icon} width={58} height={58} alt="" />
            <div style={{ display: "flex", marginLeft: 16, fontFamily: "Instrument Serif", fontSize: 40, lineHeight: 1 }}>
              StormWatch<span style={{ color: ACCENT }}>.</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", marginLeft: 18, fontFamily: "Geist Mono", fontSize: 13, letterSpacing: 2.4, color: "#6ee7a8" }}>
              <div style={{ display: "flex", width: 8, height: 8, borderRadius: 8, background: "#34d399", marginRight: 8 }} />
              LIVE
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 54, fontFamily: "Instrument Serif", fontSize: 84, lineHeight: 0.98, letterSpacing: -1 }}>
            <div style={{ display: "flex" }}>Weather, watched</div>
            <div style={{ display: "flex", fontStyle: "italic", color: ACCENT }}>from orbit.</div>
          </div>

          <div style={{ display: "flex", marginTop: 26, width: 500, fontSize: 23, lineHeight: 1.4, color: "#b4bcc6", fontWeight: 300 }}>
            Live radar, clouds, lightning and snow on a real‑time 3D Earth. Pick any place for its 48‑hour and 7‑day forecast.
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", marginTop: "auto" }}>
            {layers.map(([label, on]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginRight: 7,
                  marginTop: 8,
                  padding: "6px 10px",
                  border: `1px solid ${on ? "rgba(255,122,26,0.55)" : "rgba(255,255,255,0.12)"}`,
                  background: on ? "rgba(255,122,26,0.08)" : "rgba(255,255,255,0.02)",
                  fontSize: 14,
                  fontWeight: 400,
                  color: on ? BONE : MUTE,
                }}
              >
                {on && <div style={{ display: "flex", width: 6, height: 6, borderRadius: 6, background: ACCENT, marginRight: 7 }} />}
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 20, fontFamily: "Geist Mono", fontSize: 12, letterSpacing: 2, color: FAINT }}>
            <div style={{ display: "flex", width: 120, height: 4, marginRight: 14, backgroundImage: "linear-gradient(90deg, #3b82f6, #22c55e, #facc15, #ef4444)" }} />
            OPEN-METEO · RAINVIEWER · NASA GIBS
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
