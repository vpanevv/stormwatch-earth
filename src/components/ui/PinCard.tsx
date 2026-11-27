"use client";

import { useEffect, useRef, useState } from "react";
import type { WeatherBundle } from "@/types/weather";
import { useAppStore, type DroppedPin } from "@/store/useAppStore";
import { selectPlace } from "@/lib/actions";
import { formatLat, formatLon } from "@/lib/geo";
import { codeGlyph, describeCode } from "@/lib/weatherCodes";
import { namePin, type PinName } from "@/lib/places/namePin";
import { pinAnchor } from "../globe/PinMarker";
import { IconClose } from "./icons";

/** Gap between the pin's centre and its card (CSS px): just outside the ring and its ticks. */
const CARD_GAP = 30;
/** How long the arrow waits for a name still on its way before opening the bare coordinates. */
const PIN_NAME_WAIT_MS = 600;
const EDGE = 16;

/**
 * The dropped pin's card (Watched's PinOverlay, adapted): the spot's coordinates at once, the nearest town as soon
 * as it is known, a glance at the weather there, an orange arrow (or Enter) that opens the full forecast, and × (or
 * Esc) to remove it. It sits right of the pin, else left, below or above, clear of the panels, and hides while the
 * pin is on the far side of the planet.
 */
export function PinCard() {
  const pin = useAppStore((s) => s.pin);
  return pin ? <Card key={pin.id} pin={pin} /> : null;
}

type Peek = { temp: number; code: number; isDay: boolean };

function Card({ pin }: { pin: DroppedPin }) {
  const anchor = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // undefined: still naming · null: nothing named here
  const [name, setName] = useState<PinName | null | undefined>(undefined);
  const [peek, setPeek] = useState<Peek | null>(null);
  const [busy, setBusy] = useState(false);
  const naming = useRef<Promise<PinName | null> | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // The name and the weather, at once.
  useEffect(() => {
    const ctl = new AbortController();
    const p = namePin(pin.lat, pin.lon, ctl.signal);
    naming.current = p.catch(() => null);
    p.then(setName, () => undefined);
    // Same URL the forecast will ask for, so opening it is a cache hit.
    fetch(`/api/weather?lat=${pin.lat.toFixed(4)}&lon=${pin.lon.toFixed(4)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<WeatherBundle>) : null))
      .then((w) => w && setPeek({ temp: w.current.temperature, code: w.current.weatherCode, isDay: w.current.isDay }))
      .catch(() => undefined);
    return () => ctl.abort();
  }, [pin.lat, pin.lon]);

  const coords = `${formatLat(pin.lat, 4)} ${formatLon(pin.lon, 4)}`;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    let n = name;
    if (n === undefined && naming.current) {
      n = await Promise.race([naming.current, new Promise<null>((r) => setTimeout(() => r(null), PIN_NAME_WAIT_MS))]);
      if (!alive.current || useAppStore.getState().pin?.id !== pin.id) return;
    }
    // The pin's spot exactly, under the town's name (selecting clears the pin).
    selectPlace(
      n
        ? { id: `pin-${pin.lat},${pin.lon}`, name: n.name, context: n.context || undefined, kind: "city", lat: pin.lat, lon: pin.lon, countryCode: n.countryCode }
        : { id: `pin-${pin.lat},${pin.lon}`, name: coords, context: "Open water", kind: "coords", lat: pin.lat, lon: pin.lon },
    );
  };
  const openRef = useRef(open);
  openRef.current = open;

  // Enter opens the pin and Esc removes it, wherever the focus is — except while typing or inside a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "Escape" && e.key !== "Enter") || e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      const own = !!t && !!card.current?.contains(t);
      if (!own && t && t !== document.body && t.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"]')) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        useAppStore.getState().clearPin();
      } else if (!own) {
        e.preventDefault();
        void openRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Placement, every frame: right of the pin, else left, below, above; the side it has wins while it still fits.
  useEffect(() => {
    let raf = 0;
    const last = { x: NaN, y: NaN, side: "", vis: "" };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = anchor.current;
      const c = card.current;
      if (!el || !c) return;
      const vis = pinAnchor.visible ? "1" : "0";
      if (vis !== last.vis) {
        last.vis = vis;
        el.dataset.visible = vis;
      }
      if (!pinAnchor.visible) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const ins = useAppStore.getState().uiInsets;
      const lo = ins.left + EDGE;
      const hi = W - ins.right - EDGE;
      const top = ins.top + EDGE;
      const bottom = H - ins.bottom - EDGE;
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      const { x: ax, y: ay } = pinAnchor;
      const fits = {
        right: ax + CARD_GAP + w <= hi,
        left: ax - CARD_GAP - w >= lo,
        below: ay + CARD_GAP + h <= bottom,
        above: ay - CARD_GAP - h >= top,
      };
      const order = ["right", "left", "below", "above"] as const;
      const side = last.side && fits[last.side as keyof typeof fits] ? last.side : (order.find((k) => fits[k]) ?? "below");
      let x = side === "right" ? ax + CARD_GAP : side === "left" ? ax - CARD_GAP - w : ax - w / 2;
      let y = side === "below" ? ay + CARD_GAP : side === "above" ? ay - CARD_GAP - h : ay - h / 2;
      x = Math.round(Math.max(lo, Math.min(hi - w, x)));
      y = Math.round(Math.max(top, Math.min(bottom - h, y)));
      if (x !== last.x || y !== last.y) {
        last.x = x;
        last.y = y;
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      last.side = side;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={anchor} data-visible="0" className="pin-card pointer-events-none absolute left-0 top-0 z-[6]">
      <div
        ref={card}
        role="group"
        aria-label="Dropped pin"
        className="pointer-events-auto flex max-w-[min(380px,calc(100vw-32px))] items-stretch border border-white/10 bg-[#0b0d10]/90 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
      >
        <div className="min-w-0 flex-1 px-4 py-2.5">
          <div className="font-mono text-[11px] tracking-[0.12em] text-mute tabular-nums">{coords}</div>
          <div className="mt-1 truncate text-[15px] text-ink" title={name ? [name.name, name.context].filter(Boolean).join(", ") : undefined}>
            {name === undefined ? (
              <span className="animate-pulse text-mute">Finding the nearest town…</span>
            ) : name ? (
              <>
                {name.name}
                {name.context && <span className="text-mute"> {name.context.split(", ").pop()}</span>}
              </>
            ) : (
              <span className="text-mute">Open water · no town nearby</span>
            )}
          </div>
          <div className="mt-1 h-[16px] font-mono text-[11px] text-faint">
            {peek && (
              <span className="text-mute">
                <span className="text-accent-soft">{codeGlyph(peek.code, peek.isDay)}</span> {Math.round(peek.temp)}° · {describeCode(peek.code)}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void open()}
          disabled={busy}
          aria-label={`Show the forecast for ${name ? name.name : coords}`}
          title="Show the forecast (Enter)"
          className="grid w-14 shrink-0 place-items-center bg-accent text-[#140a02] transition-colors hover:bg-[#ff8f3a] disabled:opacity-70"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => useAppStore.getState().clearPin()}
          aria-label="Remove the pin"
          title="Remove (Esc)"
          className="grid w-10 shrink-0 place-items-center text-mute transition-colors hover:text-ink"
        >
          <IconClose width={12} height={12} />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {name === undefined ? `Pin dropped at ${coords}` : name ? `Pin dropped in ${name.name}${name.context ? `, ${name.context}` : ""}` : "Pin dropped on open water"}
      </p>
    </div>
  );
}
