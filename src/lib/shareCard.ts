"use client";

import type { Place, WeatherBundle } from "@/types/weather";
import { codeGlyph, describeCode } from "@/lib/weatherCodes";
import { compass, formatLat, formatLon } from "@/lib/geo";
import { fmtDate, fmtDay, fmtTime } from "@/lib/format";

export const CARD_W = 1200;
export const CARD_H = 630;
const SCALE = 2;
const HALF_KM = 160;

export type OrbitImage = { img: HTMLImageElement; label: string; credit: string; halfKm: number };

const GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

function gibsUrl(layer: string, time: string, lat: number, lon: number, px: number) {
  const dLat = HALF_KM / 110.57;
  const dLon = HALF_KM / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const q = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer,
    STYLES: "",
    FORMAT: "image/jpeg",
    CRS: "EPSG:4326",
    BBOX: [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => v.toFixed(4)).join(","),
    WIDTH: String(px),
    HEIGHT: String(px),
    TIME: time,
  });
  return `${GIBS}?${q}`;
}

/** The app icon (scripts/build-icons.mjs), same origin so the canvas stays exportable. */
const APP_ICON = "/brand/icon-192.png";

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed"));
    img.src = url;
  });
}

/** Share of near-black pixels: daily swaths leave gaps, which we'd rather not put on a card. */
function gapFraction(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 24) dark++;
  return dark / (64 * 64);
}

/**
 * The most recent complete true-colour look at the place from NASA GIBS: yesterday's VIIRS (NOAA-20, then
 * Suomi NPP), falling back to the Blue Marble composite when the swaths have gaps.
 */
export async function loadOrbitImage(place: Place): Promise<OrbitImage | null> {
  const y = new Date(Date.now() - 86_400_000);
  const day = y.toISOString().slice(0, 10);
  const label = `${fmtDate(y.getTime()).toUpperCase()}`;
  const tries: [string, string, string, string][] = [
    ["VIIRS_NOAA20_CorrectedReflectance_TrueColor", day, `FROM ORBIT · ${label} · NOAA-20 VIIRS`, "NASA GIBS / EOSDIS"],
    ["VIIRS_SNPP_CorrectedReflectance_TrueColor", day, `FROM ORBIT · ${label} · SUOMI NPP VIIRS`, "NASA GIBS / EOSDIS"],
    ["BlueMarble_NextGeneration", "2004-08-01", "BLUE MARBLE · NASA", "NASA GIBS / EOSDIS"],
  ];
  for (const [layer, time, lab, credit] of tries) {
    try {
      const img = await loadImage(gibsUrl(layer, time, place.lat, place.lon, 1024));
      if (layer.startsWith("VIIRS") && gapFraction(img) > 0.12) continue;
      return { img, label: lab, credit, halfKm: HALF_KM };
    } catch {
      /* try the next source */
    }
  }
  return null;
}

function fontFamilies() {
  const probe = document.createElement("span");
  probe.className = "font-mono";
  document.body.appendChild(probe);
  const mono = getComputedStyle(probe).fontFamily;
  probe.remove();
  return { sans: getComputedStyle(document.body).fontFamily, mono };
}

function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "right" = "left") {
  // Canvas letterSpacing is supported in modern Chromium/Safari; fall back silently elsewhere.
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  ctx.textAlign = "left";
}

export function headline(place: Place, w: WeatherBundle) {
  return `${Math.round(w.current.temperature)}° · ${describeCode(w.current.weatherCode).toLowerCase()}`;
}

/** One-line summary of what's coming, used on the card and in the share text. */
export function outlook(w: WeatherBundle) {
  const days = w.daily.slice(0, 5);
  const snowDay = days.filter((d) => d.snowfallSum >= 0.5).sort((a, b) => b.snowfallSum - a.snowfallSum)[0];
  if (snowDay) return `❄ ${snowDay.snowfallSum.toFixed(1)} cm of snow ${snowDay === w.daily[0] ? "today" : `on ${fmtDay(snowDay.time + 43_200_000, w.utcOffsetSeconds)}`}`;
  const wet = days.filter((d) => d.precipSum >= 2).sort((a, b) => b.precipSum - a.precipSum)[0];
  if (wet) return `☂ ${wet.precipSum.toFixed(0)} mm of rain ${wet === w.daily[0] ? "today" : `on ${fmtDay(wet.time + 43_200_000, w.utcOffsetSeconds)}`}`;
  const hot = Math.max(...days.map((d) => d.tMax));
  return `Dry week ahead · highs up to ${Math.round(hot)}°`;
}

export async function renderShareCard(place: Place, w: WeatherBundle, orbit: OrbitImage | null): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  const { sans, mono } = fontFamilies();
  const c = document.createElement("canvas");
  c.width = CARD_W * SCALE;
  c.height = CARD_H * SCALE;
  const ctx = c.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  const INK = "#07090c", BONE = "#ece8e0", MUTE = "#8c96a3", FAINT = "#4d5560", ACCENT = "#ff7a1a", LINE = "rgba(255,255,255,0.1)";
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // ── left: the place from orbit
  const S = CARD_H;
  if (orbit) {
    ctx.drawImage(orbit.img, 0, 0, S, S);
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, "rgba(7,9,12,0.35)");
    g.addColorStop(0.25, "rgba(7,9,12,0)");
    g.addColorStop(0.8, "rgba(7,9,12,0)");
    g.addColorStop(1, "rgba(7,9,12,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  } else {
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, S, S);
  }
  // reticle
  const cx = S / 2, cy = S / 2;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(cx + dx * 30, cy + dy * 30);
    ctx.lineTo(cx + dx * 46, cy + dy * 46);
  }
  ctx.stroke();
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();

  const chip = (text: string, x: number, y: number, align: "left" | "right" = "left") => {
    ctx.font = `400 12px ${mono}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "1.6px";
    const wdt = ctx.measureText(text).width + 20;
    const x0 = align === "left" ? x : x - wdt;
    ctx.fillStyle = "rgba(7,9,12,0.78)";
    ctx.fillRect(x0, y - 18, wdt, 28);
    ctx.fillStyle = BONE;
    ctx.fillText(text, x0 + 10, y + 1);
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  };
  chip(orbit?.label ?? "NO IMAGE", 24, 40);
  if (orbit) {
    // scale bar: 50 km
    const kmPerPx = (2 * orbit.halfKm) / S;
    const bar = 50 / kmPerPx;
    ctx.fillStyle = "rgba(7,9,12,0.78)";
    ctx.fillRect(S - 24 - bar - 74, 22, bar + 74, 28);
    ctx.strokeStyle = BONE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const bx = S - 24 - bar - 64;
    ctx.moveTo(bx, 36);
    ctx.lineTo(bx + bar, 36);
    ctx.moveTo(bx, 31);
    ctx.lineTo(bx, 41);
    ctx.moveTo(bx + bar, 31);
    ctx.lineTo(bx + bar, 41);
    ctx.stroke();
    ctx.fillStyle = BONE;
    ctx.font = `400 12px ${mono}`;
    ctx.fillText("50 km", bx + bar + 10, 41);
    chip(orbit.credit.toUpperCase(), 24, S - 28);
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, S - 1, S - 1);

  // ── right: the forecast
  const X = S + 48, R = CARD_W - 48;
  // App icon + wordmark
  const mark = await loadImage(APP_ICON).catch(() => null);
  const WX = mark ? X + 48 : X;
  if (mark) ctx.drawImage(mark, X, 44, 38, 38);
  ctx.fillStyle = BONE;
  ctx.font = `300 28px ${sans}`;
  ctx.fillText("StormWatch", WX, 74);
  const wm = ctx.measureText("StormWatch").width;
  ctx.fillStyle = ACCENT;
  ctx.fillText(".", WX + wm + 1, 74);
  ctx.fillStyle = MUTE;
  ctx.font = `400 12px ${mono}`;
  tracked(ctx, `${fmtDate(Date.now(), w.utcOffsetSeconds).toUpperCase()} · ${fmtTime(Date.now(), w.utcOffsetSeconds)} LOCAL`, R, 72, 1.6, "right");
  ctx.fillStyle = LINE;
  ctx.fillRect(X, 100, R - X, 1);

  // headline (shrinks to fit long names)
  const maxW = R - X;
  let size = 64;
  ctx.font = `300 ${size}px ${sans}`;
  const h1 = headline(place, w);
  while (ctx.measureText(h1).width > maxW && size > 34) ctx.font = `300 ${(size -= 2)}px ${sans}`;
  ctx.fillStyle = BONE;
  ctx.fillText(h1, X - 3, 172);
  let size2 = 52;
  const h2 = `in ${place.name}.`;
  ctx.font = `300 ${size2}px ${sans}`;
  while (ctx.measureText(h2).width > maxW && size2 > 28) ctx.font = `300 ${(size2 -= 2)}px ${sans}`;
  ctx.fillStyle = ACCENT;
  ctx.fillText(h2, X - 2, 234);

  const today = w.daily[0];
  ctx.fillStyle = MUTE;
  ctx.font = `400 17px ${sans}`;
  const sub = [`Feels ${Math.round(w.current.feelsLike)}°`, today ? `H ${Math.round(today.tMax)}° L ${Math.round(today.tMin)}°` : "", place.context ?? ""]
    .filter(Boolean)
    .join("  ·  ");
  ctx.fillText(sub.length > 60 ? sub.slice(0, 58) + "…" : sub, X, 270);
  ctx.fillStyle = "#cfd6de";
  ctx.font = `400 17px ${sans}`;
  ctx.fillText(outlook(w), X, 300);

  // stats
  const next24 = w.hourly.filter((h) => h.time > Date.now() && h.time <= Date.now() + 86_400_000);
  const rain24 = next24.reduce((s, h) => s + Math.max(0, h.precipitation - h.snowfall), 0);
  const snow24 = next24.reduce((s, h) => s + h.snowfall, 0);
  const stats: [string, string, string][] = [
    ["RAIN 24H", `${rain24.toFixed(1)}`, "mm"],
    ["SNOW 24H", `${snow24.toFixed(1)}`, "cm"],
    ["WIND", `${Math.round(w.current.windSpeed)}`, `km/h ${compass(w.current.windDirection)}`],
    ["CLOUD", `${Math.round(w.current.cloudCover)}`, "%"],
  ];
  const colW = (R - X) / 4;
  ctx.fillStyle = LINE;
  ctx.fillRect(X, 326, R - X, 1);
  stats.forEach(([label, value, unit], i) => {
    const x = X + i * colW;
    if (i) {
      ctx.fillStyle = LINE;
      ctx.fillRect(x - 10, 340, 1, 58);
    }
    ctx.fillStyle = FAINT;
    ctx.font = `400 11px ${mono}`;
    tracked(ctx, label, x, 352, 1.4);
    ctx.fillStyle = BONE;
    ctx.font = `300 30px ${mono}`;
    ctx.fillText(value, x, 390);
    const vw = ctx.measureText(value).width;
    ctx.fillStyle = MUTE;
    ctx.font = `400 12px ${mono}`;
    ctx.fillText(unit, x + vw + 6, 390);
  });
  ctx.fillStyle = LINE;
  ctx.fillRect(X, 414, R - X, 1);

  // 5-day strip
  const days = w.daily.slice(0, 5);
  const dw = (R - X) / days.length;
  days.forEach((d, i) => {
    const x = X + i * dw;
    const mid = d.time + 43_200_000;
    ctx.fillStyle = i === 0 ? ACCENT : MUTE;
    ctx.font = `400 11px ${mono}`;
    tracked(ctx, i === 0 ? "TODAY" : fmtDay(mid, w.utcOffsetSeconds).toUpperCase(), x, 446, 1.4);
    ctx.font = `26px ${sans}`;
    ctx.fillStyle = d.snowfallSum > 0 ? "#dfeaff" : "#ffb27a";
    ctx.fillText(codeGlyph(d.weatherCode), x, 486);
    ctx.fillStyle = BONE;
    ctx.font = `300 20px ${sans}`;
    const hi = `${Math.round(d.tMax)}°`;
    ctx.fillText(hi, x, 520);
    const hw = ctx.measureText(hi).width;
    ctx.fillStyle = MUTE;
    ctx.font = `300 15px ${sans}`;
    ctx.fillText(`${Math.round(d.tMin)}°`, x + hw + 6, 520);
    ctx.font = `400 11px ${mono}`;
    if (d.snowfallSum > 0) {
      ctx.fillStyle = "#cfe0ff";
      ctx.fillText(`❄ ${d.snowfallSum.toFixed(1)}cm`, x, 544);
    } else {
      ctx.fillStyle = d.precipProbMax >= 50 ? "#7cc0ff" : FAINT;
      // Columns are ~100 px: show the amount when it rains, otherwise the chance.
      ctx.fillText(d.precipSum >= 0.1 ? `☂ ${d.precipSum.toFixed(1)}mm` : `☂ ${Math.round(d.precipProbMax)}%`, x, 544);
    }
  });

  ctx.fillStyle = LINE;
  ctx.fillRect(X, 574, R - X, 1);
  ctx.fillStyle = MUTE;
  ctx.font = `400 11px ${mono}`;
  tracked(ctx, "STORMWATCH EARTH · LIVE WEATHER FROM ORBIT", X, 602, 1.4);
  tracked(ctx, `${formatLat(place.lat, 2)} ${formatLon(place.lon, 2)}`, R, 602, 1.4, "right");

  ctx.strokeStyle = LINE;
  ctx.strokeRect(0.5, 0.5, CARD_W - 1, CARD_H - 1);
  return c;
}

export function shareLink(place: Place) {
  const u = new URL(window.location.origin + window.location.pathname);
  u.searchParams.set("q", `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`);
  u.searchParams.set("n", place.name);
  if (place.context) u.searchParams.set("c", place.context);
  return u.toString();
}

export function shareText(place: Place, w: WeatherBundle) {
  return `${Math.round(w.current.temperature)}° and ${describeCode(w.current.weatherCode).toLowerCase()} in ${place.name} right now. ${outlook(w)}.`;
}

export function cardFileName(place: Place) {
  const slug = place.name.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "place";
  return `stormwatch-${slug}-${new Date().toISOString().slice(0, 10)}.png`;
}
