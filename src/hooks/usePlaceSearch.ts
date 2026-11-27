"use client";

import { useEffect, useMemo, useState } from "react";
import type { Place } from "@/types/weather";
import { formatLat, formatLon, parseCoordinates } from "@/lib/geo";
import { searchGazetteer } from "@/lib/gazetteer";

/**
 * Place search state shared by the landing field and the in-app search panel:
 * instant gazetteer matches, debounced Open-Meteo autocomplete, coordinates, and a
 * full Nominatim search on Enter when nothing is highlighted.
 */
export function usePlaceSearch(onChoose: (p: Place) => void) {
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Place[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const coords = useMemo(() => parseCoordinates(q), [q]);
  const local = useMemo(() => (q.trim().length >= 1 ? searchGazetteer(q, 5) : []), [q]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || coords) {
      setRemote([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/geocode?mode=suggest&q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        setRemote(((await r.json()) as { places: Place[] }).places);
      } catch {
        /* aborted or offline: the gazetteer still answers */
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    }, 220);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, coords]);

  const items: Place[] = useMemo(() => {
    if (coords) {
      return [{ id: "coords", name: `${formatLat(coords.lat)} ${formatLon(coords.lon)}`, context: "Go to coordinates", kind: "coords", ...coords }];
    }
    const seen = new Set<string>();
    return [...local, ...remote]
      .filter((p) => {
        const k = `${p.name}|${p.lat.toFixed(1)}|${p.lon.toFixed(1)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 8);
  }, [coords, local, remote]);

  useEffect(() => setActive(0), [items.length]);

  const choose = (p: Place) => {
    setQ("");
    setNote(null);
    onChoose(p);
  };

  const submit = async () => {
    if (items[active]) return choose(items[active]);
    const term = q.trim();
    if (term.length < 2) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/geocode?mode=search&q=${encodeURIComponent(term)}`);
      const d = (await r.json()) as { places: Place[] };
      if (d.places[0]) choose(d.places[0]);
      else setNote(`No match for “${term}”`);
    } catch {
      setNote("Search unavailable — try coordinates");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent, onEscape?: () => void) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      onEscape?.();
    }
  };

  return { q, setQ, items, active, setActive, busy, note, setNote, choose, submit, onKeyDown };
}
