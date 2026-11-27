import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StormWatch Earth",
    short_name: "StormWatch",
    description: "Live radar, clouds, lightning and snow on a real-time 3D Earth, with a forecast for any place.",
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
