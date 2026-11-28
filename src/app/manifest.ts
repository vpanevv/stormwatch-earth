import type { MetadataRoute } from "next";
import { DESCRIPTION, SHORT_NAME, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SHORT_NAME,
    description: DESCRIPTION,
    categories: ["weather", "utilities", "navigation"],
    start_url: "/",
    display: "standalone",
    background_color: "#020306",
    theme_color: "#020306",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
