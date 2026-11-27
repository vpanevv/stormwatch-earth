#!/usr/bin/env node
/**
 * Builds every raster of the app icon from the one source, public/brand/stormwatch-icon.svg:
 *   src/app/icon.svg          favicon (SVG, modern browsers)
 *   src/app/favicon.ico       16/32/48 px (older browsers, bookmarks)
 *   src/app/apple-icon.png    180 px, full-bleed (iOS rounds it itself)
 *   public/brand/icon-192.png, icon-512.png            web app manifest
 *   public/brand/icon-maskable-512.png                 Android adaptive icon (mark inside the 80% safe zone)
 * Run: node scripts/build-icons.mjs
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";
import sharp from "sharp";

const SRC = "public/brand/stormwatch-icon.svg";
const svg = await readFile(SRC, "utf8");
const BG = "#05070a";

const raster = (s, size) => sharp(Buffer.from(s), { density: (72 * size) / 64 }).resize(size, size).png().toBuffer();
// Full-bleed variant: the tile's rounded corners squared off (iOS and Android mask the icon themselves).
const square = svg.replace('rx="14"', 'rx="0"');

await copyFile(SRC, "src/app/icon.svg");
await writeFile("src/app/apple-icon.png", await raster(square, 180));
await writeFile("public/brand/icon-192.png", await raster(svg, 192));
await writeFile("public/brand/icon-512.png", await raster(svg, 512));
const inner = await raster(square, 410);
await writeFile(
  "public/brand/icon-maskable-512.png",
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
    .composite([{ input: inner, left: 51, top: 51 }])
    .png()
    .toBuffer(),
);

// favicon.ico: an ICO directory of PNG images (supported by every browser since IE Vista-era).
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => raster(svg, s)));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(s, e);
  head.writeUInt8(s, e + 1);
  head.writeUInt8(0, e + 2);
  head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
await writeFile("src/app/favicon.ico", Buffer.concat([head, ...pngs]));
console.log("icons built from", SRC);
