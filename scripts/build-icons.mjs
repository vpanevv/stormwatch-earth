#!/usr/bin/env node
/**
 * The StormWatch app icon: the real planet (rendered from the app's Earth textures, scripts/lib/globe.mjs) on a dark
 * tile, with a small lightning strike hitting the top of it. One 1024 px master, and every size the app needs:
 *   public/brand/icon-master.png            1024 px, rounded tile (the source of everything below)
 *   src/app/icon.png                        512 px favicon for modern browsers
 *   src/app/favicon.ico                     16/32/48 px
 *   src/app/apple-icon.png                  180 px, full-bleed (iOS rounds it itself)
 *   public/brand/icon-192.png, icon-512.png web app manifest, share card, landing, share popup
 *   public/brand/icon-maskable-512.png      Android adaptive icon (art inside the 80 % safe zone)
 * Run: npm run icons
 */
import { writeFile, rm } from "node:fs/promises";
import sharp from "sharp";
import { renderGlobe, project, strikeSvg } from "./lib/globe.mjs";

const S = 1024;
const VIEW = { lat: 22, lon: 18 };
const SUN = { lat: -6, lon: -2 }; // lit almost face-on, a hint of dusk along the right limb

async function art({ rounded, scale = 1 }) {
  const size = Math.round(S * scale);
  const g = await renderGlobe({ size, radiusFrac: 0.37, view: VIEW, sun: SUN, glow: 1 });
  const cy = Math.round(size * 0.07); // the globe sits a little low, the strike comes from above
  const top = project(VIEW.lat + 40, VIEW.lon - 6, { size, radiusFrac: 0.37, view: VIEW });
  const tip = [top.x, top.y + cy];
  const bolt = strikeSvg(size, size, { from: [size * 0.76, -size * 0.02], to: tip, width: size / 90, seed: 11 });
  const r = rounded ? Math.round(size * 0.22) : 0;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><radialGradient id="b" cx="35%" cy="25%" r="90%"><stop offset="0" stop-color="#18202b"/><stop offset="1" stop-color="#03050a"/></radialGradient></defs>
    <rect width="${size}" height="${size}" rx="${r}" fill="url(#b)"/></svg>`);
  return sharp(bg)
    .composite([
      { input: g.png, left: 0, top: cy },
      { input: Buffer.from(bolt), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

const master = await art({ rounded: true });
const square = await art({ rounded: false });
const sized = (buf, n) => sharp(buf).resize(n, n, { kernel: "lanczos3" }).png().toBuffer();

await writeFile("public/brand/icon-master.png", master);
await writeFile("src/app/icon.png", await sized(master, 512));
await writeFile("src/app/apple-icon.png", await sized(square, 180));
await writeFile("public/brand/icon-192.png", await sized(master, 192));
await writeFile("public/brand/icon-512.png", await sized(master, 512));
await writeFile(
  "public/brand/icon-maskable-512.png",
  await sharp({ create: { width: 512, height: 512, channels: 4, background: "#05070a" } })
    .composite([{ input: await sized(square, 410), left: 51, top: 51 }])
    .png()
    .toBuffer(),
);

// favicon.ico: an ICO directory of PNG images.
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((n) => sized(master, n)));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((n, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(n, e);
  head.writeUInt8(n, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
await writeFile("src/app/favicon.ico", Buffer.concat([head, ...pngs]));
// The vector icon of the earlier design is replaced by the raster above.
await rm("src/app/icon.svg", { force: true });
console.log("icons built");
