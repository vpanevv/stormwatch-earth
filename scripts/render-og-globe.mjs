#!/usr/bin/env node
/**
 * The planet for the link-preview card (src/app/opengraph-image.tsx): the real Earth from the app's textures
 * (scripts/lib/globe.mjs) over Europe, Africa and the Middle East at dusk, with a lightning strike coming down onto
 * the top of it, as in the app icon. Social crawlers can't run WebGL, so the card needs a still.
 *
 *   npm run og:globe   →  public/og/globe.png (1000×1160, transparent around the planet)
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { renderGlobe, project, strikeSvg } from "./lib/globe.mjs";

const SIZE = 1000;
const HEAD = 160; // room above the planet for the strike
const VIEW = { lat: 30, lon: 22 };
const SUN = { lat: -21, lon: -26 };

const g = await renderGlobe({ size: SIZE, radiusFrac: 0.42, view: VIEW, sun: SUN });
const hit = project(VIEW.lat + 38, VIEW.lon + 4, { size: SIZE, radiusFrac: 0.42, view: VIEW });
const tip = [hit.x, hit.y + HEAD];
const bolt = strikeSvg(SIZE, SIZE + HEAD, { from: [SIZE * 0.66, 0], to: tip, width: 7, seed: 5 });

await mkdir("public/og", { recursive: true });
await sharp({ create: { width: SIZE, height: SIZE + HEAD, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([
    { input: g.png, left: 0, top: HEAD },
    { input: Buffer.from(bolt), left: 0, top: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile("public/og/globe.png");
await writeFile("src/app/og-view.json", JSON.stringify({ size: SIZE, head: HEAD, radius: SIZE * 0.42, view: VIEW, sun: SUN }, null, 2) + "\n");
console.log("public/og/globe.png");
