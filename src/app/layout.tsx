import type { Metadata, Viewport } from "next";
// Self-hosted (next/font/local under the hood): no Google Fonts fetch at build or dev time.
import { GeistSans as sans } from "geist/font/sans";
import { GeistMono as mono } from "geist/font/mono";
// Editorial faces for the landing / about pages (SIL OFL 1.1, self-hosted via Fontsource).
import "@fontsource-variable/instrument-sans/wdth.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";

/**
 * Absolute base for link previews (og:image must be a full URL for Facebook and LinkedIn). Netlify sets URL to the
 * site's main address at build time; NEXT_PUBLIC_SITE_URL overrides it (a custom domain set up later, say).
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:3080";

const TITLE = "StormWatch Earth — live weather from orbit";
const DESCRIPTION =
  "Live radar, clouds, lightning and snow on a real-time 3D Earth. Pick any place for its 48-hour and 7-day forecast, and share it as a card.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "StormWatch Earth",
  keywords: ["weather", "radar", "lightning", "3D globe", "forecast", "snow", "storm tracker"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "StormWatch Earth",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  appleWebApp: { title: "StormWatch", capable: true, statusBarStyle: "black-translucent" },
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
