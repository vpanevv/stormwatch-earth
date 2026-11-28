"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { AppIcon } from "./LiveLightning";
import { cardFileName, loadOrbitImage, renderShareCard, shareLink, shareText } from "@/lib/shareCard";
import { IconClose } from "./icons";

type Status = { kind: "idle" | "ok" | "err"; text: string };

/** "Share this forecast": a rendered card (satellite view + forecast) to copy, save or share. */
export function ShareDialog() {
  const open = useAppStore((s) => s.shareOpen);
  const setOpen = useAppStore((s) => s.setShareOpen);
  const place = useAppStore((s) => s.selection);
  const weather = useAppStore((s) => s.weather.data);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const host = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // Render the card whenever the dialog opens (or the place / data changes while open).
  useEffect(() => {
    if (!open || !place || !weather) return;
    let alive = true;
    setBusy(true);
    setCanvas(null);
    setStatus({ kind: "idle", text: "" });
    (async () => {
      const orbit = await loadOrbitImage(place);
      const c = await renderShareCard(place, weather, orbit);
      if (alive) setCanvas(c);
    })()
      .catch(() => alive && setStatus({ kind: "err", text: "Couldn’t render the card" }))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [open, place, weather]);

  useEffect(() => {
    if (!host.current) return;
    host.current.replaceChildren();
    if (canvas) {
      canvas.className = "block h-auto w-full";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `Forecast card for ${place?.name}`);
      host.current.appendChild(canvas);
    }
  }, [canvas, place?.name]);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!place) return null;
  const link = shareLink(place);
  const text = weather ? shareText(place, weather) : "";
  const blob = () =>
    new Promise<Blob>((resolve, reject) => canvas?.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/png"));
  const flash = (s: Status) => {
    setStatus(s);
    window.setTimeout(() => setStatus((cur) => (cur === s ? { kind: "idle", text: "" } : cur)), 2600);
  };

  const copyImage = async () => {
    try {
      // Pass the promise straight in: Safari requires the ClipboardItem to be created inside the click.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob() })]);
      flash({ kind: "ok", text: "Image copied" });
    } catch {
      flash({ kind: "err", text: "Your browser blocked image copying — use Save PNG" });
    }
  };
  const savePng = async () => {
    const b = await blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = cardFileName(place);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    flash({ kind: "ok", text: "PNG saved" });
  };
  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      flash({ kind: "ok", text: `${what} copied` });
    } catch {
      flash({ kind: "err", text: "Clipboard unavailable" });
    }
  };
  const nativeShare = async () => {
    try {
      const file = new File([await blob()], cardFileName(place), { type: "image/png" });
      const data: ShareData = { title: `Weather in ${place.name}`, text, url: link, files: [file] };
      if (navigator.canShare && !navigator.canShare(data)) delete data.files;
      await navigator.share(data);
    } catch {
      /* dismissed */
    }
  };
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator && window.matchMedia("(pointer: coarse)").matches;
  const ready = !!canvas && !busy;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm md:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Share this forecast"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="bright-data scroll-thin max-h-full w-full max-w-[920px] overflow-y-auto border border-line bg-[#090c10] p-4 md:p-7"
          >
            <div className="mb-4 flex items-center gap-4">
              <AppIcon className="h-9 w-9" />
              <span className="label !text-[11px] !text-ink">Share this forecast</span>
              <span className="h-px flex-1 bg-white/10" />
              <button ref={closeBtn} onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-mute hover:text-ink">
                <IconClose width={18} height={18} />
              </button>
            </div>

            <div className="relative border border-line" style={{ aspectRatio: "1200 / 630" }}>
              <div ref={host} className="absolute inset-0" />
              {!ready && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#07090c]">
                  <div className="label">{status.kind === "err" ? status.text : "Fetching yesterday’s satellite pass…"}</div>
                  <div className="h-px w-40 overflow-hidden bg-white/10">
                    <motion.div
                      className="h-px w-1/3 bg-accent"
                      animate={{ x: ["-100%", "300%"] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className={`mt-4 grid gap-2 ${canNativeShare ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 md:grid-cols-3"}`}>
              <button
                onClick={copyImage}
                disabled={!ready}
                className="bg-accent px-4 py-3.5 font-mono text-[12px] uppercase tracking-[0.2em] text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Copy image
              </button>
              <button
                onClick={savePng}
                disabled={!ready}
                className="border border-line px-4 py-3.5 font-mono text-[12px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-white/30 disabled:opacity-40"
              >
                ↓ Save PNG
              </button>
              <button
                onClick={() => copy(link, "Link")}
                className="border border-line px-4 py-3.5 font-mono text-[12px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-white/30"
              >
                Copy link
              </button>
              {canNativeShare && (
                <button
                  onClick={nativeShare}
                  disabled={!ready}
                  className="border border-accent/50 px-4 py-3.5 font-mono text-[12px] uppercase tracking-[0.2em] text-accent disabled:opacity-40"
                >
                  Share…
                </button>
              )}
            </div>

            <dl className="mt-5 divide-y divide-white/10 border-t border-white/10 text-[13px]">
              <div className="grid grid-cols-[56px_1fr_auto] items-center gap-3 py-3">
                <dt className="label">Link</dt>
                <dd className="truncate font-mono text-[12px] text-white">{link}</dd>
                <button onClick={() => copy(link, "Link")} className="label hover:!text-ink">
                  Copy
                </button>
              </div>
              <div className="grid grid-cols-[56px_1fr_auto] items-start gap-3 py-3">
                <dt className="label pt-0.5">Post</dt>
                <dd className="text-white">{text}</dd>
                <button onClick={() => copy(`${text} ${link}`, "Post")} className="label pt-0.5 hover:!text-ink">
                  Copy
                </button>
              </div>
            </dl>

            <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-faint">
              <span>Imagery: NASA GIBS / EOSDIS · Forecast: {weather?.sources.forecast === "mock" ? "simulated" : "Open-Meteo"}</span>
              <span aria-live="polite" className={status.kind === "err" ? "text-amber-300" : "text-emerald-300"}>
                {status.kind !== "idle" && ready ? status.text : ""}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
