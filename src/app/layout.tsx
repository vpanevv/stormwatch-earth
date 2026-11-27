import type { Metadata, Viewport } from "next";
// Self-hosted (next/font/local under the hood): no Google Fonts fetch at build or dev time.
import { GeistSans as sans } from "geist/font/sans";
import { GeistMono as mono } from "geist/font/mono";
// Editorial faces for the landing / about pages (SIL OFL 1.1, self-hosted via Fontsource).
import "@fontsource-variable/instrument-sans/wdth.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "StormWatch Earth — real-time atmospheric observatory",
  description:
    "Live clouds, radar precipitation, lightning and weather conditions rendered on an interactive 3D Earth.",
};

export const viewport: Viewport = {
  themeColor: "#020306",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans font-light">{children}</body>
    </html>
  );
}
