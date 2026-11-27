"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useAppStore } from "@/store/useAppStore";
import { decodePixel, precipAlpha, precipRGB } from "@/lib/radar/decode";

/**
 * Close-up of the selected place: OpenStreetMap (inverted to a dark base) with the latest
 * RainViewer frame, recoloured on the fly to the same blue/green/yellow/red scale as the globe.
 */

let protocolRegistered = false;
function registerProtocol() {
  if (protocolRegistered) return;
  protocolRegistered = true;
  maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
  maplibregl.addProtocol("rvdbz", async (params) => {
    const url = params.url.replace("rvdbz://", "https://");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`radar tile ${res.status}`);
    const bmp = await createImageBitmap(await res.blob());
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      const p = decodePixel(px[i], px[i + 1], px[i + 2], px[i + 3]);
      if (!p) continue;
      const [r, g, b] = precipRGB(p.dbz, p.snow);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = precipAlpha(p.dbz);
    }
    ctx.putImageData(img, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { data: await blob.arrayBuffer() };
  });
}

export default function LocalRadarMap({ lat, lon }: { lat: number; lon: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const radarIdx = useAppStore((s) => s.radar.data);
  const latest = radarIdx?.frames.filter((f) => f.time <= Date.now()).at(-1);
  const tileUrl = radarIdx?.host && latest
    ? `${radarIdx.host.replace("https://", "rvdbz://")}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`
    : null;

  useEffect(() => {
    if (!el.current) return;
    registerProtocol();
    const m = new maplibregl.Map({
      container: el.current,
      center: [lon, lat],
      zoom: 6.4,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
            // brightness-min > max inverts the tiles → dark basemap from standard OSM.
            paint: {
              "raster-brightness-min": 0.42,
              "raster-brightness-max": 0,
              "raster-saturation": -0.9,
              "raster-contrast": 0.1,
            },
          },
        ],
      },
    });
    m.touchZoomRotate.disableRotation();
    const dot = document.createElement("div");
    dot.className = "relative h-4 w-4";
    dot.innerHTML =
      '<span class="absolute inset-0 rounded-full border border-[#ff7a1a]"></span><span class="absolute inset-[5px] rounded-full bg-[#ff7a1a] shadow-[0_0_10px_2px_rgba(255,122,26,0.8)]"></span><span class="absolute -inset-2 animate-ping rounded-full border border-[#ff7a1a]/60"></span>';
    marker.current = new maplibregl.Marker({ element: dot }).setLngLat([lon, lat]).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    map.current?.flyTo({ center: [lon, lat], zoom: Math.max(6, map.current.getZoom()), duration: 1200 });
    marker.current?.setLngLat([lon, lat]);
  }, [lat, lon]);

  useEffect(() => {
    const m = map.current;
    if (!m || !tileUrl) return;
    const apply = () => {
      if (m.getLayer("radar")) m.removeLayer("radar");
      if (m.getSource("radar")) m.removeSource("radar");
      m.addSource("radar", {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: 7,
        attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
      });
      m.addLayer({ id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": 0.85 } });
    };
    if (m.isStyleLoaded()) apply();
    else m.once("load", apply);
  }, [tileUrl]);

  return <div ref={el} className="h-44 w-full border border-line" aria-label="Local radar map" />;
}
