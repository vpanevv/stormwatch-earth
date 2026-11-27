"use client";

import { useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Place } from "@/types/weather";
import { useAppStore } from "@/store/useAppStore";
import { QUICK_PICKS } from "@/lib/gazetteer";
import { selectCoordinates, selectPlace, useMyLocation } from "@/lib/actions";
import { usePlaceSearch } from "@/hooks/usePlaceSearch";
import { IconCrosshair, IconSearch } from "./icons";

export const KIND_LABEL: Record<Place["kind"], string> = {
  city: "City",
  region: "Region",
  country: "Country",
  coords: "Coords",
  device: "Device",
  place: "Place",
};

export function SearchPanel() {
  const [open, setOpen] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const geolocating = useAppStore((s) => s.geolocating);
  const locate = useMyLocation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const search = usePlaceSearch((p) => {
    if (p.kind === "coords") selectCoordinates(p);
    else selectPlace(p);
    setOpen(false);
    inputRef.current?.blur();
  });
  const { q, setQ, items, active, setActive, busy, choose } = search;
  const note = search.note ?? locNote;

  const onLocate = async () => {
    setLocNote(null);
    try {
      await locate();
    } catch (e) {
      const code = (e as GeolocationPositionError)?.code;
      setLocNote(code === 1 ? "Location permission denied" : "Couldn’t get your position");
    }
  };

  const showList = open && q.trim().length > 0;

  return (
    <div className="panel corner-brackets relative p-3">
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <IconSearch className="shrink-0 text-mute" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            search.setNote(null);
            setLocNote(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) =>
            search.onKeyDown(e, () => {
              setOpen(false);
              inputRef.current?.blur();
            })
          }
          placeholder="City, region, country or 41.88, 23.47"
          aria-label="Search location"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
          className="w-full bg-transparent text-[14px] font-light text-ink placeholder:text-faint focus:outline-none"
        />
        {busy && <span className="label animate-pulse">…</span>}
      </div>

      <AnimatePresence>
        {showList && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="mt-1 max-h-72 overflow-auto scroll-thin"
          >
            {items.length === 0 && (
              <li className="px-1 py-2 font-mono text-[11px] text-mute">Press Enter to search OpenStreetMap</li>
            )}
            {items.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-1.5 py-2 ${i === active ? "bg-white/[0.05]" : ""}`}
              >
                <span className={`h-3 w-px ${i === active ? "bg-accent" : "bg-white/15"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{p.name}</span>
                  {p.context && <span className="block truncate text-[11px] text-mute">{p.context}</span>}
                </span>
                <span className="label !text-[9px]">{KIND_LABEL[p.kind]}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          onClick={onLocate}
          disabled={geolocating}
          className="inline-flex items-center gap-1.5 border border-accent/40 bg-accent/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
        >
          <IconCrosshair width={13} height={13} className={geolocating ? "animate-spin" : ""} />
          {geolocating ? "Locating…" : "Use my location"}
        </button>
        {QUICK_PICKS.map((p) => (
          <button
            key={p.id}
            onClick={() => choose(p)}
            className="border border-line px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mute transition-colors hover:border-white/25 hover:text-ink"
          >
            {p.name}
          </button>
        ))}
      </div>
      {note && <div className="mt-2 font-mono text-[10px] text-amber-300/90">{note}</div>}
    </div>
  );
}
