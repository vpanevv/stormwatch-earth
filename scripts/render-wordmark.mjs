#!/usr/bin/env node
/**
 * Renders the "StormWatch." wordmark (Instrument Serif, orange full stop) as transparent PNGs for places that can't
 * load web fonts — the README: public/brand/wordmark.png (bone, for dark backgrounds) and wordmark-ink.png (ink, for
 * light ones). Run: node scripts/render-wordmark.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { createElement as h } from "react";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";

const font = await readFile("node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff");
for (const [file, color] of [
  ["public/brand/wordmark.png", "#ece8e0"],
  ["public/brand/wordmark-ink.png", "#0b0d10"],
]) {
  const el = h(
    "div",
    { style: { display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontFamily: "Instrument Serif", fontSize: 150, color, background: "transparent" } },
    "StormWatch",
    h("span", { style: { color: "#ff7a1a" } }, "."),
  );
  const res = new ImageResponse(el, { width: 820, height: 200, fonts: [{ name: "Instrument Serif", data: font, weight: 400, style: "normal" }] });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(file);
}
