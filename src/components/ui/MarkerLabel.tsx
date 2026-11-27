"use client";

import { useAppStore } from "@/store/useAppStore";
import { formatLat, formatLon } from "@/lib/geo";
import { markerLabel } from "../globe/LocationMarker";

/** Name + coordinates tag for the radar-lock marker (positioned by LocationMarker). */
export function MarkerLabel() {
  const sel = useAppStore((s) => s.selection);
  return (
    <div
      ref={(el) => {
        markerLabel.el = el;
      }}
      className="pointer-events-none absolute left-0 top-0 z-[5]"
      style={{ opacity: 0 }}
    >
      {sel && (
        <div className="marker-label">
          <div className="marker-label__leader" />
          <div className="marker-label__body">
            <div className="marker-label__name">{sel.name}</div>
            <div className="marker-label__coords">
              {formatLat(sel.lat, 4)} · {formatLon(sel.lon, 4)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
